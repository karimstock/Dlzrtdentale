// =============================================
// JADOMI — Parrainage : codes, referrals, gains
// Routes authentifiées /api/network/parrainage/*
// =============================================
const { admin, requireSociete, auditLog } = require('../multiSocietes/middleware');
const mailer = require('../multiSocietes/mailer');
const crypto = require('crypto');

module.exports = function (router) {

  // ---- GET /parrainage/mon-code ----
  router.get('/parrainage/mon-code', requireSociete(), async (req, res) => {
    try {
      const userId = req.user.id;
      const societeId = req.societe.id;

      // Check existing code
      let { data, error } = await admin()
        .from('parrainage_codes')
        .select('*')
        .eq('user_id', userId)
        .eq('societe_id', societeId)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        // Generate unique code
        const code = 'JAD-' + crypto.randomBytes(4).toString('hex').toUpperCase();
        const { data: inserted, error: insertErr } = await admin()
          .from('parrainage_codes')
          .insert({
            user_id: userId,
            societe_id: societeId,
            code,
            actif: true,
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (insertErr) throw insertErr;
        data = inserted;

        await auditLog({
          userId, societeId, action: 'parrainage_code_created',
          entity: 'parrainage_codes', entityId: data.id, req
        });
      }

      res.json({ ok: true, code: data });
    } catch (e) {
      console.error('[parrainage/mon-code]', e.message);
      res.status(500).json({ error: 'parrainage_code_error', message: e.message });
    }
  });

  // ---- GET /parrainage/mes-referrals ----
  router.get('/parrainage/mes-referrals', requireSociete(), async (req, res) => {
    try {
      const userId = req.user.id;
      const societeId = req.societe.id;

      const { data, error } = await admin()
        .from('parrainage_referrals')
        .select('*')
        .eq('parrain_user_id', userId)
        .eq('societe_id', societeId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const stats = {
        total: (data || []).length,
        convertis: (data || []).filter(r => r.converti).length,
        en_attente: (data || []).filter(r => !r.converti).length
      };

      res.json({ ok: true, referrals: data || [], stats });
    } catch (e) {
      console.error('[parrainage/mes-referrals]', e.message);
      res.status(500).json({ error: 'referrals_error', message: e.message });
    }
  });

  // ---- GET /parrainage/mes-gains ----
  router.get('/parrainage/mes-gains', requireSociete(), async (req, res) => {
    try {
      const userId = req.user.id;
      const societeId = req.societe.id;

      const { data, error } = await admin()
        .from('parrainage_gains')
        .select('*')
        .eq('parrain_user_id', userId)
        .eq('societe_id', societeId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const gains = data || [];
      const total = gains.reduce((sum, g) => sum + (parseFloat(g.montant) || 0), 0);
      const paye = gains.filter(g => g.paye).reduce((sum, g) => sum + (parseFloat(g.montant) || 0), 0);
      const en_attente = total - paye;

      res.json({ ok: true, gains, totaux: { total, paye, en_attente } });
    } catch (e) {
      console.error('[parrainage/mes-gains]', e.message);
      res.status(500).json({ error: 'gains_error', message: e.message });
    }
  });

  // ---- POST /parrainage/track ----
  router.post('/parrainage/track', async (req, res) => {
    try {
      const { code, page_url, visitor_id } = req.body;
      if (!code) return res.status(400).json({ error: 'missing_code' });

      // Verify code exists and is active
      const { data: codeData, error: codeErr } = await admin()
        .from('parrainage_codes')
        .select('*')
        .eq('code', code)
        .eq('actif', true)
        .maybeSingle();

      if (codeErr) throw codeErr;
      if (!codeData) return res.status(404).json({ error: 'code_not_found' });

      // Log the visit
      const { data, error } = await admin()
        .from('parrainage_visites')
        .insert({
          parrainage_code_id: codeData.id,
          parrain_user_id: codeData.user_id,
          societe_id: codeData.societe_id,
          page_url: page_url || null,
          visitor_id: visitor_id || null,
          ip: req.ip || null,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      res.json({ ok: true, visite_id: data.id });
    } catch (e) {
      console.error('[parrainage/track]', e.message);
      res.status(500).json({ error: 'track_error', message: e.message });
    }
  });

  // ---- POST /parrainage/attribuer ----
  router.post('/parrainage/attribuer', requireSociete(), async (req, res) => {
    try {
      const { code, filleul_user_id, booking_id, order_id, montant } = req.body;
      if (!code || !filleul_user_id) return res.status(400).json({ error: 'missing_fields' });

      // Verify code
      const { data: codeData, error: codeErr } = await admin()
        .from('parrainage_codes')
        .select('*')
        .eq('code', code)
        .eq('actif', true)
        .maybeSingle();

      if (codeErr) throw codeErr;
      if (!codeData) return res.status(404).json({ error: 'code_not_found' });

      // Prevent self-referral
      if (codeData.user_id === filleul_user_id) {
        return res.status(400).json({ error: 'self_referral_not_allowed' });
      }

      // Create referral
      const { data: referral, error: refErr } = await admin()
        .from('parrainage_referrals')
        .insert({
          parrain_user_id: codeData.user_id,
          filleul_user_id,
          societe_id: codeData.societe_id,
          parrainage_code_id: codeData.id,
          booking_id: booking_id || null,
          order_id: order_id || null,
          converti: true,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (refErr) throw refErr;

      // Create gain if montant provided
      if (montant && parseFloat(montant) > 0) {
        await admin()
          .from('parrainage_gains')
          .insert({
            parrain_user_id: codeData.user_id,
            societe_id: codeData.societe_id,
            referral_id: referral.id,
            montant: parseFloat(montant),
            paye: false,
            created_at: new Date().toISOString()
          });
      }

      await auditLog({
        userId: req.user.id,
        societeId: codeData.societe_id,
        action: 'parrainage_attributed',
        entity: 'parrainage_referrals',
        entityId: referral.id,
        meta: { code, filleul_user_id, montant },
        req
      });

      // Notify parrain by email (best-effort)
      try {
        const { data: parrain } = await admin().auth.admin.getUserById(codeData.user_id);
        if (parrain?.user?.email) {
          await mailer.sendMail({
            to: parrain.user.email,
            subject: '🎉 Nouveau filleul JADOMI !',
            html: `<h2>Félicitations !</h2><p>Un nouveau filleul a utilisé votre code de parrainage <strong>${code}</strong>.</p><p>Connectez-vous pour voir vos gains.</p><p>— JADOMI IA</p>`
          });
        }
      } catch (mailErr) {
        console.warn('[parrainage/attribuer] mail:', mailErr.message);
      }

      res.json({ ok: true, referral });
    } catch (e) {
      console.error('[parrainage/attribuer]', e.message);
      res.status(500).json({ error: 'attribuer_error', message: e.message });
    }
  });
};
