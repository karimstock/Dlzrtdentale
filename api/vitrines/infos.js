// =============================================
// JADOMI — Module Mon site internet
// infos.js — Endpoint infos-completes + mise a jour societe
// =============================================
var { createClient } = require('@supabase/supabase-js');
var { requireSociete } = require('../multiSocietes/middleware');
var { getProfession } = require('./professions');

var _admin = null;
function admin() {
  if (!_admin) {
    var key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    _admin = createClient(process.env.SUPABASE_URL, key, { auth: { autoRefreshToken: false, persistSession: false } });
  }
  return _admin;
}

// Champs requis/optionnels par categorie metier
var FIELDS_BY_CATEGORY = {
  sante: {
    required: ['nom', 'adresse', 'ville', 'code_postal', 'telephone', 'email', 'siret', 'rpps'],
    optional: ['horaires', 'ordre_numero', 'secteur_conventionnel', 'diplome_universite', 'diplome_annee', 'social_instagram', 'social_facebook', 'social_linkedin', 'footer_pitch']
  },
  liberale: {
    required: ['nom', 'adresse', 'ville', 'code_postal', 'telephone', 'email', 'siret'],
    optional: ['horaires', 'barreau', 'numero_toque', 'assurance_rc', 'carpa', 'social_instagram', 'social_facebook', 'social_linkedin', 'footer_pitch']
  },
  beaute: {
    required: ['nom', 'adresse', 'ville', 'code_postal', 'telephone', 'email', 'siret'],
    optional: ['horaires', 'social_instagram', 'social_facebook', 'footer_pitch']
  },
  commerce: {
    required: ['nom', 'adresse', 'ville', 'code_postal', 'telephone', 'email', 'siret'],
    optional: ['horaires', 'social_instagram', 'social_facebook', 'footer_pitch']
  },
  restauration: {
    required: ['nom', 'adresse', 'ville', 'code_postal', 'telephone', 'email', 'siret'],
    optional: ['horaires', 'social_instagram', 'social_facebook', 'footer_pitch']
  },
  artisan: {
    required: ['nom', 'adresse', 'ville', 'code_postal', 'telephone', 'email', 'siret'],
    optional: ['horaires', 'assurance_rc', 'social_instagram', 'social_facebook', 'footer_pitch']
  }
};

module.exports = function(router) {

  // ------------------------------------------
  // GET /infos/complete — Infos completes + completion
  // ------------------------------------------
  router.get('/infos/complete', requireSociete(), async function(req, res) {
    try {
      var socRes = await admin().from('societes').select('*').eq('id', req.societe.id).single();
      if (socRes.error) throw socRes.error;
      var soc = socRes.data;

      // Determine category
      var siteRes = await admin().from('vitrines_sites').select('profession_id').eq('societe_id', soc.id).order('is_primary', { ascending: false, nullsFirst: false }).order('created_at', { ascending: true }).limit(1).maybeSingle();
      var profConfig = siteRes.data ? getProfession(siteRes.data.profession_id) : null;
      var category = profConfig ? profConfig.category : 'sante';

      var fields = FIELDS_BY_CATEGORY[category] || FIELDS_BY_CATEGORY.sante;
      var allFields = fields.required.concat(fields.optional);
      var filled = allFields.filter(function(f) { return soc[f]; });
      var missingRequired = fields.required.filter(function(f) { return !soc[f]; });
      var missingOptional = fields.optional.filter(function(f) { return !soc[f]; });
      var pct = Math.round((filled.length / allFields.length) * 100);

      res.json({
        success: true,
        societe: soc,
        completion: {
          pct: pct,
          missing_required: missingRequired,
          missing_optional: missingOptional,
          last_updated: soc.infos_updated_at || soc.updated_at
        },
        category: category,
        fields: fields
      });
    } catch (err) {
      console.error('[vitrines/infos]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // PATCH /infos/update — Mettre a jour la societe (single source of truth)
  // ------------------------------------------
  router.patch('/infos/update', requireSociete(), async function(req, res) {
    try {
      var allowed = ['nom', 'adresse', 'adresse_complement', 'code_postal', 'ville', 'pays', 'telephone', 'email', 'horaires', 'siret', 'tva_intracom', 'rpps', 'ordre_numero', 'departement_exercice', 'secteur_conventionnel', 'diplome_universite', 'diplome_annee', 'qualifications', 'barreau', 'numero_toque', 'assurance_rc', 'assurance_rc_numero', 'carpa', 'social_instagram', 'social_facebook', 'social_linkedin', 'footer_pitch', 'metier', 'logo_url'];
      var updates = {};
      allowed.forEach(function(f) { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Aucun champ' });

      updates.infos_updated_at = new Date().toISOString();
      updates.updated_at = new Date().toISOString();

      var updRes = await admin().from('societes').update(updates).eq('id', req.societe.id).select('*').single();
      if (updRes.error) throw updRes.error;

      // Recalculate completion
      var siteRes = await admin().from('vitrines_sites').select('profession_id').eq('societe_id', req.societe.id).order('is_primary', { ascending: false, nullsFirst: false }).order('created_at', { ascending: true }).limit(1).maybeSingle();
      var profConfig = siteRes.data ? getProfession(siteRes.data.profession_id) : null;
      var category = profConfig ? profConfig.category : 'sante';
      var fields = FIELDS_BY_CATEGORY[category] || FIELDS_BY_CATEGORY.sante;
      var allFields = fields.required.concat(fields.optional);
      var filled = allFields.filter(function(f) { return updRes.data[f]; });
      var pct = Math.round((filled.length / allFields.length) * 100);

      await admin().from('societes').update({ infos_completion_pct: pct }).eq('id', req.societe.id);

      res.json({ success: true, societe: updRes.data, completion_pct: pct });
    } catch (err) {
      console.error('[vitrines/infos]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

};
