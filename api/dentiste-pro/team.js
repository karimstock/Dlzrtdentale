// =============================================
// JADOMI — Dentiste Pro : Gestion equipe & permissions
// Invitation, roles, permissions granulaires par module
// Fonctionne pour toutes professions de sante
// =============================================
const express = require('express');
const crypto = require('crypto');
const { admin, requireCabinet } = require('./shared');

const router = express.Router();

// ===== Role presets =====
const ROLE_PRESETS = {
  praticien: {
    agenda: true, patients: true, chat: true, stock: true,
    comptabilite: true, facturation: true, statistiques: true,
    configuration: true, waitlist: true, rappels: true,
    chat_ia_config: true, series: true, documents: true, timeline: true
  },
  associe: {
    agenda: true, patients: true, chat: true, stock: true,
    comptabilite: true, facturation: true, statistiques: true,
    configuration: true, waitlist: true, rappels: true,
    chat_ia_config: true, series: true, documents: true, timeline: true
  },
  secretaire: {
    agenda: true, patients: true, chat: true, stock: false,
    comptabilite: false, facturation: false, statistiques: false,
    configuration: false, waitlist: true, rappels: true,
    chat_ia_config: false, series: true, documents: true, timeline: false
  },
  assistante: {
    agenda: true, patients: true, chat: true, stock: false,
    comptabilite: false, facturation: false, statistiques: false,
    configuration: false, waitlist: true, rappels: true,
    chat_ia_config: false, series: false, documents: false, timeline: false
  },
  comptable: {
    agenda: false, patients: false, chat: false, stock: false,
    comptabilite: true, facturation: true, statistiques: true,
    configuration: false, waitlist: false, rappels: false,
    chat_ia_config: false, series: false, documents: false, timeline: false
  },
  stagiaire: {
    agenda: true, patients: true, chat: false, stock: false,
    comptabilite: false, facturation: false, statistiques: false,
    configuration: false, waitlist: false, rappels: false,
    chat_ia_config: false, series: false, documents: false, timeline: false
  }
};

// Modules valides
const VALID_MODULES = [
  'agenda', 'patients', 'chat', 'stock', 'comptabilite', 'facturation',
  'statistiques', 'configuration', 'waitlist', 'rappels', 'chat_ia_config',
  'series', 'documents', 'timeline'
];

// ===== Helpers =====

function generateInvitationToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Verifie que le user actuel est praticien ou associe du cabinet
async function isManagerRole(userId, cabinetId) {
  // D'abord verifier si c'est le proprietaire de la societe (via cabinet)
  const { data: cabinet } = await admin()
    .from('dentiste_pro_cabinets')
    .select('societe_id')
    .eq('id', cabinetId)
    .maybeSingle();

  if (!cabinet) return false;

  const { data: role } = await admin()
    .from('user_societe_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('societe_id', cabinet.societe_id)
    .maybeSingle();

  // Le proprietaire de la societe (role owner/admin) est toujours manager
  if (role && (role.role === 'owner' || role.role === 'admin')) return true;

  // Verifier si c'est un praticien ou associe dans l'equipe
  const { data: teamMember } = await admin()
    .from('dentiste_pro_team')
    .select('role')
    .eq('user_id', userId)
    .eq('cabinet_id', cabinetId)
    .eq('actif', true)
    .maybeSingle();

  return teamMember && (teamMember.role === 'praticien' || teamMember.role === 'associe');
}

// =========================================================
// POST /team/invite — Inviter un membre d'equipe
// Requiert: praticien ou associe
// =========================================================
router.post('/invite', requireCabinet(), async (req, res) => {
  try {
    const cabinetId = req.cabinet?.id;
    if (!cabinetId) return res.status(400).json({ error: 'Cabinet non configure' });

    // Verifier les droits
    const canManage = await isManagerRole(req.user.id, cabinetId);
    if (!canManage) {
      return res.status(403).json({ error: 'Seul un praticien ou associe peut inviter des membres' });
    }

    const { email, nom, prenom, role } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Email valide requis' });
    }
    if (!role || !ROLE_PRESETS[role]) {
      return res.status(400).json({ error: 'Role invalide. Roles acceptes : ' + Object.keys(ROLE_PRESETS).join(', ') });
    }

    // Verifier que le membre n'existe pas deja
    const { data: existing } = await admin()
      .from('dentiste_pro_team')
      .select('id, actif, invitation_accepted')
      .eq('cabinet_id', cabinetId)
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (existing) {
      if (existing.actif) {
        return res.status(409).json({ error: 'Ce membre fait deja partie de l\'equipe' });
      }
      // Reactiver un membre desactive
      const token = generateInvitationToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 jours

      const { data: reactivated, error: reErr } = await admin()
        .from('dentiste_pro_team')
        .update({
          actif: true,
          role,
          nom: nom || existing.nom,
          prenom: prenom || existing.prenom,
          permissions: ROLE_PRESETS[role],
          invitation_token: token,
          invitation_expires_at: expiresAt,
          invitation_accepted: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (reErr) throw reErr;

      // Envoyer l'email d'invitation
      await sendInvitationEmail(reactivated, req.cabinet);

      return res.json({ ok: true, member: sanitizeMember(reactivated), reactivated: true });
    }

    // Creer le nouveau membre
    const token = generateInvitationToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: member, error } = await admin()
      .from('dentiste_pro_team')
      .insert({
        cabinet_id: cabinetId,
        email: email.toLowerCase().trim(),
        nom: nom || null,
        prenom: prenom || null,
        role,
        permissions: ROLE_PRESETS[role],
        invitation_token: token,
        invitation_expires_at: expiresAt,
        invitation_accepted: false,
        actif: true
      })
      .select()
      .single();

    if (error) throw error;

    // Envoyer l'email d'invitation
    await sendInvitationEmail(member, req.cabinet);

    res.status(201).json({ ok: true, member: sanitizeMember(member) });
  } catch (err) {
    console.error('[team] POST /invite', err.message);
    res.status(500).json({ error: 'Erreur invitation membre' });
  }
});

// =========================================================
// GET /team — Lister les membres de l'equipe
// =========================================================
router.get('/', requireCabinet(), async (req, res) => {
  try {
    const cabinetId = req.cabinet?.id;
    if (!cabinetId) return res.status(400).json({ error: 'Cabinet non configure' });

    const { data, error } = await admin()
      .from('dentiste_pro_team')
      .select('id, cabinet_id, email, nom, prenom, role, permissions, invitation_accepted, actif, derniere_connexion, created_at, updated_at')
      .eq('cabinet_id', cabinetId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    res.json({ ok: true, team: data || [] });
  } catch (err) {
    console.error('[team] GET /', err.message);
    res.status(500).json({ error: 'Erreur liste equipe' });
  }
});

// =========================================================
// PUT /team/:id/permissions — Modifier les permissions
// Requiert: praticien (owner)
// =========================================================
router.put('/:id/permissions', requireCabinet(), async (req, res) => {
  try {
    const cabinetId = req.cabinet?.id;
    if (!cabinetId) return res.status(400).json({ error: 'Cabinet non configure' });

    const canManage = await isManagerRole(req.user.id, cabinetId);
    if (!canManage) {
      return res.status(403).json({ error: 'Seul un praticien ou associe peut modifier les permissions' });
    }

    const { permissions } = req.body;
    if (!permissions || typeof permissions !== 'object') {
      return res.status(400).json({ error: 'permissions requis (objet {module: true/false})' });
    }

    // Valider les modules
    for (const key of Object.keys(permissions)) {
      if (!VALID_MODULES.includes(key)) {
        return res.status(400).json({ error: `Module inconnu : ${key}. Modules valides : ${VALID_MODULES.join(', ')}` });
      }
      if (typeof permissions[key] !== 'boolean') {
        return res.status(400).json({ error: `La permission "${key}" doit etre un booleen` });
      }
    }

    // Charger le membre actuel
    const { data: member, error: mErr } = await admin()
      .from('dentiste_pro_team')
      .select('id, permissions, role, cabinet_id')
      .eq('id', req.params.id)
      .eq('cabinet_id', cabinetId)
      .maybeSingle();

    if (mErr) throw mErr;
    if (!member) return res.status(404).json({ error: 'Membre introuvable' });

    // Fusionner les permissions (merge partiel)
    const currentPerms = member.permissions || {};
    const mergedPerms = { ...currentPerms, ...permissions };

    const { data: updated, error } = await admin()
      .from('dentiste_pro_team')
      .update({
        permissions: mergedPerms,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json({ ok: true, member: sanitizeMember(updated) });
  } catch (err) {
    console.error('[team] PUT /:id/permissions', err.message);
    res.status(500).json({ error: 'Erreur modification permissions' });
  }
});

// =========================================================
// PUT /team/:id/role — Changer le role d'un membre
// Requiert: praticien (owner)
// =========================================================
router.put('/:id/role', requireCabinet(), async (req, res) => {
  try {
    const cabinetId = req.cabinet?.id;
    if (!cabinetId) return res.status(400).json({ error: 'Cabinet non configure' });

    const canManage = await isManagerRole(req.user.id, cabinetId);
    if (!canManage) {
      return res.status(403).json({ error: 'Seul un praticien ou associe peut changer les roles' });
    }

    const { role } = req.body;
    if (!role || !ROLE_PRESETS[role]) {
      return res.status(400).json({ error: 'Role invalide. Roles acceptes : ' + Object.keys(ROLE_PRESETS).join(', ') });
    }

    // Verifier que le membre existe dans ce cabinet
    const { data: member, error: mErr } = await admin()
      .from('dentiste_pro_team')
      .select('id, cabinet_id')
      .eq('id', req.params.id)
      .eq('cabinet_id', cabinetId)
      .maybeSingle();

    if (mErr) throw mErr;
    if (!member) return res.status(404).json({ error: 'Membre introuvable' });

    const { data: updated, error } = await admin()
      .from('dentiste_pro_team')
      .update({
        role,
        permissions: ROLE_PRESETS[role],
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json({ ok: true, member: sanitizeMember(updated) });
  } catch (err) {
    console.error('[team] PUT /:id/role', err.message);
    res.status(500).json({ error: 'Erreur changement role' });
  }
});

// =========================================================
// DELETE /team/:id — Retirer un membre
// Requiert: praticien (owner)
// =========================================================
router.delete('/:id', requireCabinet(), async (req, res) => {
  try {
    const cabinetId = req.cabinet?.id;
    if (!cabinetId) return res.status(400).json({ error: 'Cabinet non configure' });

    const canManage = await isManagerRole(req.user.id, cabinetId);
    if (!canManage) {
      return res.status(403).json({ error: 'Seul un praticien ou associe peut retirer des membres' });
    }

    // Verifier que le membre existe dans ce cabinet
    const { data: member, error: mErr } = await admin()
      .from('dentiste_pro_team')
      .select('id, cabinet_id, role')
      .eq('id', req.params.id)
      .eq('cabinet_id', cabinetId)
      .maybeSingle();

    if (mErr) throw mErr;
    if (!member) return res.status(404).json({ error: 'Membre introuvable' });

    // Ne pas permettre de supprimer un praticien (proprietaire)
    if (member.role === 'praticien') {
      return res.status(403).json({ error: 'Impossible de retirer le praticien proprietaire' });
    }

    // Desactiver (soft delete) plutot que supprimer
    const { error } = await admin()
      .from('dentiste_pro_team')
      .update({
        actif: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ ok: true, message: 'Membre retire de l\'equipe' });
  } catch (err) {
    console.error('[team] DELETE /:id', err.message);
    res.status(500).json({ error: 'Erreur suppression membre' });
  }
});

// =========================================================
// POST /team/accept-invitation — Accepter une invitation
// Public : authentification par token d'invitation
// =========================================================
router.post('/accept-invitation', async (req, res) => {
  try {
    const { token, user_id } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token d\'invitation requis' });
    }

    // Chercher le membre par token
    const { data: member, error: mErr } = await admin()
      .from('dentiste_pro_team')
      .select('*')
      .eq('invitation_token', token)
      .eq('actif', true)
      .maybeSingle();

    if (mErr) throw mErr;
    if (!member) {
      return res.status(404).json({ error: 'Invitation introuvable ou expiree' });
    }

    // Verifier l'expiration
    if (member.invitation_expires_at && new Date(member.invitation_expires_at) < new Date()) {
      return res.status(410).json({ error: 'Cette invitation a expire. Demandez une nouvelle invitation.' });
    }

    if (member.invitation_accepted) {
      return res.status(409).json({ error: 'Cette invitation a deja ete acceptee' });
    }

    // Tenter de recuperer le user_id depuis le header Authorization si present
    let resolvedUserId = user_id || null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const { data: userData } = await admin().auth.getUser(authHeader.slice(7));
        if (userData?.user) {
          resolvedUserId = userData.user.id;
        }
      } catch (e) {
        // Ignorer, pas de user auth
      }
    }

    // Accepter l'invitation
    const updateData = {
      invitation_accepted: true,
      invitation_token: null,
      invitation_expires_at: null,
      derniere_connexion: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    if (resolvedUserId) {
      updateData.user_id = resolvedUserId;
    }

    const { data: updated, error } = await admin()
      .from('dentiste_pro_team')
      .update(updateData)
      .eq('id', member.id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      ok: true,
      message: 'Invitation acceptee',
      member: sanitizeMember(updated),
      cabinet_id: updated.cabinet_id
    });
  } catch (err) {
    console.error('[team] POST /accept-invitation', err.message);
    res.status(500).json({ error: 'Erreur acceptation invitation' });
  }
});

// =========================================================
// GET /team/my-permissions — Permissions de l'utilisateur
// =========================================================
router.get('/my-permissions', requireCabinet(), async (req, res) => {
  try {
    const cabinetId = req.cabinet?.id;
    if (!cabinetId) return res.status(400).json({ error: 'Cabinet non configure' });

    const userId = req.user.id;

    // Verifier si c'est le proprietaire de la societe
    const { data: cabinet } = await admin()
      .from('dentiste_pro_cabinets')
      .select('societe_id')
      .eq('id', cabinetId)
      .maybeSingle();

    if (cabinet) {
      const { data: societeRole } = await admin()
        .from('user_societe_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('societe_id', cabinet.societe_id)
        .maybeSingle();

      if (societeRole && (societeRole.role === 'owner' || societeRole.role === 'admin')) {
        // Proprietaire : toutes les permissions
        return res.json({
          ok: true,
          role: 'praticien',
          is_owner: true,
          permissions: ROLE_PRESETS.praticien
        });
      }
    }

    // Chercher dans l'equipe
    const { data: member, error } = await admin()
      .from('dentiste_pro_team')
      .select('id, role, permissions, actif, invitation_accepted')
      .eq('user_id', userId)
      .eq('cabinet_id', cabinetId)
      .eq('actif', true)
      .maybeSingle();

    if (error) throw error;

    if (!member) {
      return res.status(403).json({ error: 'Vous ne faites pas partie de cette equipe' });
    }

    if (!member.invitation_accepted) {
      return res.status(403).json({ error: 'Votre invitation n\'a pas encore ete acceptee' });
    }

    // Mettre a jour la derniere connexion
    await admin()
      .from('dentiste_pro_team')
      .update({ derniere_connexion: new Date().toISOString() })
      .eq('id', member.id);

    res.json({
      ok: true,
      role: member.role,
      is_owner: false,
      permissions: member.permissions || ROLE_PRESETS[member.role] || {}
    });
  } catch (err) {
    console.error('[team] GET /my-permissions', err.message);
    res.status(500).json({ error: 'Erreur chargement permissions' });
  }
});

// ===== Helpers internes =====

function sanitizeMember(member) {
  if (!member) return null;
  const { invitation_token, ...safe } = member;
  return safe;
}

async function sendInvitationEmail(member, cabinet) {
  try {
    const nodemailer = require('nodemailer');
    const BASE_URL = process.env.BASE_URL || 'https://jadomi.fr';
    const cabinetName = cabinet?.nom_cabinet || cabinet?.nom || 'Un cabinet';
    const inviteLink = `${BASE_URL}/dentiste-pro/invitation?token=${member.invitation_token}`;

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'pro1.mail.ovh.net',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER || process.env.EMAIL_USER,
        pass: process.env.SMTP_PASS || process.env.EMAIL_PASS
      }
    });

    const memberName = [member.prenom, member.nom].filter(Boolean).join(' ') || 'Collegue';
    const roleFR = {
      praticien: 'Praticien',
      associe: 'Associe',
      secretaire: 'Secretaire',
      assistante: 'Assistante',
      comptable: 'Comptable',
      stagiaire: 'Stagiaire'
    }[member.role] || member.role;

    await transporter.sendMail({
      from: `"${cabinetName}" <${process.env.SMTP_USER || 'noreply@jadomi.fr'}>`,
      to: member.email,
      subject: `Invitation a rejoindre ${cabinetName} sur JADOMI`,
      html: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f1f3d;font-family:Arial,sans-serif;color:#f1f5f9;">
<div style="max-width:600px;margin:0 auto;background:#1e3460;border:1px solid rgba(99,102,241,0.25);border-radius:12px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#1a2d50,#243870);padding:20px 24px;border-bottom:1px solid rgba(99,102,241,0.15);">
    <div style="font-size:18px;font-weight:700;color:#f1f5f9;">${cabinetName}</div>
  </div>
  <div style="padding:24px;">
    <h2 style="font-size:20px;color:#f1f5f9;margin:0 0 16px;">Invitation a rejoindre l'equipe</h2>
    <p style="font-size:14px;color:#cbd5e1;margin:0 0 20px;">
      Bonjour ${memberName},
    </p>
    <p style="font-size:14px;color:#cbd5e1;margin:0 0 20px;">
      Vous avez ete invite a rejoindre l'equipe de <strong style="color:#f1f5f9;">${cabinetName}</strong>
      en tant que <strong style="color:#6366f1;">${roleFR}</strong>.
    </p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${inviteLink}" style="display:inline-block;padding:12px 32px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
        Accepter l'invitation
      </a>
    </div>
    <p style="font-size:12px;color:#94a3b8;margin:24px 0 0;">
      Cette invitation expire dans 7 jours. Si vous n'avez pas demande cette invitation, ignorez cet email.
    </p>
  </div>
  <div style="text-align:center;padding:16px 24px;border-top:1px solid rgba(99,102,241,0.15);font-size:11px;color:#64748b;">
    Envoye via <a href="https://jadomi.fr" style="color:#6366f1;">JADOMI</a>
  </div>
</div>
</body></html>`
    });

    console.log('[team] Invitation email envoyee a', member.email);
  } catch (emailErr) {
    // Ne pas faire echouer l'invitation si l'email echoue
    console.warn('[team] Echec envoi email invitation:', emailErr.message);
  }
}

module.exports = router;
