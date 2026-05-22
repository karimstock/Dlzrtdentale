// =============================================
// JADOMI AVOCAT — Post-traitement des transcriptions
// 1. Correction juridique (termes mal transcrits)
// 2. Identification des interlocuteurs (qui dit quoi)
// 3. Export Word formaté (document avocat professionnel)
// =============================================
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

let _admin = null;
function admin() {
  if (!_admin) {
    _admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

async function requireAvocat(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token requis' });
    const { data: { user }, error } = await admin().auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Token invalide' });
    req.userId = user.id;
    const societeId = req.headers['x-societe-id'];
    if (societeId) {
      const { data: role } = await admin().from('user_societe_roles')
        .select('societe_id').eq('user_id', user.id).eq('societe_id', societeId).single();
      if (role) req.societeId = role.societe_id;
    }
    if (!req.societeId) {
      const { data: first } = await admin().from('user_societe_roles')
        .select('societe_id').eq('user_id', user.id).limit(1).single();
      if (first) req.societeId = first.societe_id;
    }
    if (!req.societeId) return res.status(400).json({ error: 'Aucune organisation' });
    next();
  } catch { return res.status(401).json({ error: 'Authentification échouée' }); }
}

// ================================================
// DICTIONNAIRE JURIDIQUE — Corrections fréquentes de Whisper
// ================================================
const CORRECTIONS_JURIDIQUES = {
  // Whisper confond souvent ces termes
  'conseil des prudhommes': 'conseil de prud\'hommes',
  'conseil de prudhomme': 'conseil de prud\'hommes',
  'prud homme': 'prud\'hommes',
  'prudhomme': 'prud\'hommes',
  'prudhommes': 'prud\'hommes',
  'mise en demeur': 'mise en demeure',
  'mise en demeures': 'mise en demeure',
  'harcellement': 'harcèlement',
  'harcelment': 'harcèlement',
  'harcelement': 'harcèlement',
  'licenciement': 'licenciement',
  'licenciment': 'licenciement',
  'indemnite': 'indemnité',
  'indémnité': 'indemnité',
  'indemnitée': 'indemnité',
  'préavi': 'préavis',
  'preavis': 'préavis',
  'contentieu': 'contentieux',
  'contentieux': 'contentieux',
  'juridiction': 'juridiction',
  'juridicion': 'juridiction',
  'jurisprudence': 'jurisprudence',
  'jurisprudance': 'jurisprudence',
  'cour de cassation': 'Cour de cassation',
  'cour dappel': 'cour d\'appel',
  'cour d appel': 'cour d\'appel',
  'tribunal judiciaire': 'tribunal judiciaire',
  'tribunal judicière': 'tribunal judiciaire',
  'code du travaille': 'Code du travail',
  'code du travail': 'Code du travail',
  'code civile': 'Code civil',
  'code civil': 'Code civil',
  'code pénal': 'Code pénal',
  'code penale': 'Code pénal',
  'convention collective': 'convention collective',
  'convention collectif': 'convention collective',
  'rupture conventionnel': 'rupture conventionnelle',
  'rupture conventionnelle': 'rupture conventionnelle',
  'faute grâve': 'faute grave',
  'faute grave': 'faute grave',
  'faute lourde': 'faute lourde',
  'faute lourd': 'faute lourde',
  'inaptitude': 'inaptitude',
  'innaptitude': 'inaptitude',
  'inapptitude': 'inaptitude',
  'reclassement': 'reclassement',
  'reclassment': 'reclassement',
  'entretient préalable': 'entretien préalable',
  'entretien prealable': 'entretien préalable',
  'article l': 'article L.',
  'article r': 'article R.',
  'article d': 'article D.',
  'alinéa': 'alinéa',
  'alinea': 'alinéa',
  'cse': 'CSE',
  'c s e': 'CSE',
  'chsct': 'CHSCT',
  'drh': 'DRH',
  'd r h': 'DRH',
  'cpam': 'CPAM',
  'urssaf': 'URSSAF',
  'pole emploi': 'France Travail',
  'pôle emploi': 'France Travail',
  'droit du travaille': 'droit du travail',
  'obligation de sécuritée': 'obligation de sécurité',
  'obligation de securité': 'obligation de sécurité',
  'discriminations': 'discrimination',
  'represaille': 'représailles',
  'represailles': 'représailles',
  'lanceur dalerte': 'lanceur d\'alerte',
  'lanceurs d alerte': 'lanceurs d\'alerte',
  'sapin 2': 'Sapin II',
  'sapin deux': 'Sapin II',
  'loi waserman': 'loi Waserman',
  'waserman': 'Waserman',
  'barème macron': 'barème Macron',
  'bareme macron': 'barème Macron',
  'défenseur des droit': 'Défenseur des droits',
  'defenseur des droits': 'Défenseur des droits',
};

// ================================================
// 1. POST /corriger — Correction juridique de la transcription
// ================================================
router.post('/corriger', requireAvocat, async (req, res) => {
  try {
    const { transcription_id } = req.body || {};
    if (!transcription_id) return res.status(400).json({ error: 'transcription_id requis' });

    const { data: trans } = await admin().from('enquete_transcriptions')
      .select('texte_complet, segments')
      .eq('id', transcription_id)
      .eq('societe_id', req.societeId)
      .single();

    if (!trans) return res.status(404).json({ error: 'Transcription non trouvée' });

    let texteCorrige = trans.texte_complet;
    const corrections = [];

    // Étape 1 : Corrections dictionnaire (instantané, 0 coût)
    for (const [erreur, correction] of Object.entries(CORRECTIONS_JURIDIQUES)) {
      const regex = new RegExp('\\b' + erreur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
      const matches = texteCorrige.match(regex);
      if (matches) {
        corrections.push({ erreur, correction, occurrences: matches.length, methode: 'dictionnaire' });
        texteCorrige = texteCorrige.replace(regex, correction);
      }
    }

    // Étape 2 : Correction IA (Mistral RGPD) pour les termes juridiques complexes
    const { callMistral } = require('../../lib/legal-providers/legal-ia-router');

    const system = `Tu es un correcteur juridique spécialisé. Tu reçois une transcription audio d'une audition d'enquête interne.

TON TRAVAIL : corriger UNIQUEMENT les erreurs de transcription liées au vocabulaire juridique français.

RÈGLES STRICTES :
1. NE CHANGE PAS le sens des phrases.
2. NE REFORMULE PAS. Tu corriges uniquement les mots mal transcrits.
3. Corrige : orthographe juridique, noms d'institutions, articles de loi, acronymes.
4. NE TOUCHE PAS aux phrases en langage courant (le témoin parle comme il parle).
5. Retourne UNIQUEMENT du JSON : {"corrections":[{"original":"mot mal transcrit","corrige":"mot correct","raison":"..."}],"texte_corrige":"...le texte complet corrigé..."}

EXEMPLES :
- "prudhomme" → "prud'hommes"
- "article L 1152 tiret 1" → "article L.1152-1"
- "le CSE" doit rester en majuscules
- "Maître dupont" → "Maître Dupont" (majuscule nom propre)`;

    try {
      // Envoyer par morceaux de 3000 chars pour ne pas saturer
      const chunks = [];
      for (let i = 0; i < texteCorrige.length; i += 3000) {
        chunks.push(texteCorrige.substring(i, i + 3000));
      }

      let texteIA = '';
      for (const chunk of chunks.slice(0, 5)) { // Max 5 chunks = 15000 chars
        const result = await callMistral(system, chunk, { maxTokens: 3500 });
        try {
          const match = result.match(/\{[\s\S]*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            texteIA += parsed.texte_corrige || chunk;
            (parsed.corrections || []).forEach(c => {
              corrections.push({ ...c, methode: 'ia_mistral' });
            });
          } else {
            texteIA += chunk;
          }
        } catch {
          texteIA += chunk;
        }
      }

      // Ajouter le reste non traité par IA
      if (chunks.length > 5) {
        texteIA += texteCorrige.substring(15000);
      }

      texteCorrige = texteIA || texteCorrige;
    } catch (iaErr) {
      console.warn('[post-traitement/corriger] IA fallback:', iaErr.message);
      // On garde les corrections dictionnaire
    }

    // Sauvegarder le texte corrigé
    await admin().from('enquete_transcriptions')
      .update({ texte_complet: texteCorrige })
      .eq('id', transcription_id);

    return res.json({
      transcription_id,
      corrections_appliquees: corrections.length,
      corrections,
      nombre_mots_avant: trans.texte_complet.split(/\s+/).length,
      nombre_mots_apres: texteCorrige.split(/\s+/).length,
      message: corrections.length + ' correction(s) juridique(s) appliquée(s).'
    });
  } catch (err) {
    console.error('[post-traitement/corriger]', err.message);
    return res.status(500).json({ error: 'Erreur correction : ' + err.message });
  }
});

// ================================================
// 2. POST /identifier-interlocuteurs — Qui dit quoi
// ================================================
router.post('/identifier-interlocuteurs', requireAvocat, async (req, res) => {
  try {
    const { transcription_id, interlocuteurs } = req.body || {};
    if (!transcription_id) return res.status(400).json({ error: 'transcription_id requis' });

    // interlocuteurs = [{ nom: "Maître Dupont", role: "enqueteur" }, { nom: "Mme Martin", role: "victime" }]
    if (!interlocuteurs || !Array.isArray(interlocuteurs) || interlocuteurs.length < 2) {
      return res.status(400).json({ error: 'interlocuteurs requis (tableau de 2+ personnes avec nom et role)' });
    }

    const { data: trans } = await admin().from('enquete_transcriptions')
      .select('texte_complet, segments')
      .eq('id', transcription_id)
      .eq('societe_id', req.societeId)
      .single();

    if (!trans) return res.status(404).json({ error: 'Transcription non trouvée' });

    const { callClaude } = require('../../lib/legal-providers/legal-ia-router');

    const nomsListe = interlocuteurs.map(i => i.nom + ' (' + i.role + ')').join(', ');

    const system = `Tu es un expert en analyse de transcriptions d'auditions juridiques.

Tu reçois la transcription d'un entretien entre ces personnes : ${nomsListe}

TON TRAVAIL : identifier QUI parle à chaque moment. Dans un entretien d'enquête, c'est généralement :
- L'enquêteur pose les questions (phrases interrogatives, "pouvez-vous me dire...", "et ensuite...")
- L'audité répond (récit, description, "oui", "non", "je ne sais pas")

RÈGLES :
1. Attribue chaque segment de parole à une personne.
2. Utilise les indices contextuels (questions vs réponses, "Maître", tutoiement/vouvoiement).
3. Si tu n'es pas sûr, mets "incertain" comme locuteur.
4. Garde le texte EXACTEMENT tel quel — tu ne changes RIEN, tu ajoutes juste l'attribution.

FORMAT JSON :
{
  "dialogue": [
    {"locuteur": "Maître Dupont", "role": "enqueteur", "texte": "Pouvez-vous me décrire ce qui s'est passé ?"},
    {"locuteur": "Mme Martin", "role": "victime", "texte": "Oui, tout a commencé en mars dernier..."},
    ...
  ],
  "statistiques": {
    "temps_parole_pct": {"Maître Dupont": 30, "Mme Martin": 70},
    "nombre_interventions": {"Maître Dupont": 25, "Mme Martin": 28}
  }
}`;

    const result = await callClaude(system, trans.texte_complet.substring(0, 15000), { maxTokens: 8192 });

    let dialogue;
    try {
      const match = result.match(/\{[\s\S]*\}/);
      dialogue = match ? JSON.parse(match[0]) : null;
    } catch {
      dialogue = { raw: result, parse_error: true };
    }

    // Sauvegarder dans les segments
    if (dialogue && dialogue.dialogue) {
      await admin().from('enquete_transcriptions')
        .update({ segments: dialogue.dialogue })
        .eq('id', transcription_id);
    }

    return res.json({
      transcription_id,
      interlocuteurs,
      dialogue: dialogue?.dialogue || [],
      statistiques: dialogue?.statistiques || {},
      nombre_interventions: (dialogue?.dialogue || []).length,
      message: 'Identification des interlocuteurs terminée.'
    });
  } catch (err) {
    console.error('[post-traitement/identifier]', err.message);
    return res.status(500).json({ error: 'Erreur identification : ' + err.message });
  }
});

// ================================================
// 3. POST /export-word — Export en format Word structuré
// ================================================
router.post('/export-word', requireAvocat, async (req, res) => {
  try {
    const { transcription_id, format } = req.body || {};
    // format = 'verbatim' | 'dialogue' | 'compte_rendu'
    if (!transcription_id) return res.status(400).json({ error: 'transcription_id requis' });

    const { data: trans } = await admin().from('enquete_transcriptions')
      .select('*')
      .eq('id', transcription_id)
      .eq('societe_id', req.societeId)
      .single();

    if (!trans) return res.status(404).json({ error: 'Transcription non trouvée' });

    const exportFormat = format || 'verbatim';
    let html = '';

    // Header commun
    html += `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<style>
  body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; margin: 40px 60px; color: #1a1a1a; }
  h1 { font-size: 16pt; text-align: center; margin-bottom: 5px; }
  h2 { font-size: 14pt; margin-top: 20px; border-bottom: 1px solid #333; padding-bottom: 3px; }
  .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 15px; }
  .confidentiel { text-align: center; font-weight: bold; font-size: 14pt; color: #cc0000; margin-bottom: 10px; }
  .meta { font-size: 10pt; color: #666; margin-bottom: 5px; }
  .locuteur { font-weight: bold; color: #1a3a5c; margin-top: 12px; }
  .texte { margin-left: 20px; margin-bottom: 8px; }
  .timestamp { font-size: 9pt; color: #999; font-style: italic; }
  .garde-fou { font-size: 9pt; font-style: italic; color: #666; margin-top: 30px; border-top: 1px solid #ccc; padding-top: 10px; }
  .page-break { page-break-before: always; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  td, th { border: 1px solid #ccc; padding: 6px 10px; font-size: 11pt; }
  th { background: #f0f0f0; font-weight: bold; }
</style></head><body>`;

    html += `<div class="confidentiel">CONFIDENTIEL</div>`;
    html += `<div class="header">`;
    html += `<h1>COMPTE-RENDU D'AUDITION</h1>`;
    html += `<div class="meta">Enquête : ${trans.enquete_id || 'N/A'}</div>`;
    html += `<div class="meta">Personne auditionnée : ${trans.personne_auditionnee || 'N/A'}</div>`;
    html += `<div class="meta">Qualité : ${trans.qualite_personne || 'N/A'}</div>`;
    html += `<div class="meta">Date : ${new Date(trans.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>`;
    html += `<div class="meta">Durée : ${trans.duree_minutes ? trans.duree_minutes + ' minutes' : 'N/A'}</div>`;
    html += `</div>`;

    if (exportFormat === 'verbatim') {
      // Transcription brute mot pour mot
      html += `<h2>TRANSCRIPTION VERBATIM</h2>`;
      html += `<p><em>Transcription automatique mot pour mot. Ce document reproduit fidèlement les propos tenus lors de l'audition.</em></p>`;

      if (trans.segments && Array.isArray(trans.segments) && trans.segments.length > 0 && trans.segments[0].texte) {
        // Segments horodatés
        for (const seg of trans.segments) {
          if (seg.debut !== undefined) {
            const min = Math.floor(seg.debut / 60);
            const sec = Math.floor(seg.debut % 60);
            html += `<p><span class="timestamp">[${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}]</span> ${seg.texte}</p>`;
          } else {
            html += `<p>${seg.texte}</p>`;
          }
        }
      } else {
        // Texte brut
        const paragraphs = trans.texte_complet.split(/\n+/).filter(p => p.trim());
        paragraphs.forEach(p => { html += `<p>${p}</p>`; });
      }

    } else if (exportFormat === 'dialogue') {
      // Dialogue avec identification des locuteurs
      html += `<h2>TRANSCRIPTION — FORMAT DIALOGUE</h2>`;

      if (trans.segments && Array.isArray(trans.segments) && trans.segments[0]?.locuteur) {
        let currentLocuteur = '';
        for (const seg of trans.segments) {
          if (seg.locuteur !== currentLocuteur) {
            currentLocuteur = seg.locuteur;
            html += `<p class="locuteur">${seg.locuteur} (${seg.role || ''}) :</p>`;
          }
          html += `<p class="texte">${seg.texte}</p>`;
        }
      } else {
        html += `<p><em>L'identification des interlocuteurs n'a pas encore été effectuée. Utilisez d'abord l'endpoint /identifier-interlocuteurs.</em></p>`;
        const paragraphs = trans.texte_complet.split(/\n+/).filter(p => p.trim());
        paragraphs.forEach(p => { html += `<p>${p}</p>`; });
      }

    } else if (exportFormat === 'compte_rendu') {
      // Format compte-rendu d'enquête structuré
      html += `<h2>I. CADRE DE L'ENTRETIEN</h2>`;
      html += `<table>
        <tr><th>Enquêteur</th><td>[À COMPLÉTER]</td></tr>
        <tr><th>Personne auditionnée</th><td>${trans.personne_auditionnee || '[À COMPLÉTER]'}</td></tr>
        <tr><th>Qualité</th><td>${trans.qualite_personne === 'victime' ? 'Victime présumée' : trans.qualite_personne === 'mis_en_cause' ? 'Mis(e) en cause' : trans.qualite_personne === 'temoin' ? 'Témoin' : '[À COMPLÉTER]'}</td></tr>
        <tr><th>Date</th><td>${new Date(trans.created_at).toLocaleDateString('fr-FR')}</td></tr>
        <tr><th>Durée</th><td>${trans.duree_minutes ? trans.duree_minutes + ' min' : '[À COMPLÉTER]'}</td></tr>
        <tr><th>Lieu</th><td>[À COMPLÉTER]</td></tr>
        <tr><th>Accompagnant</th><td>[À COMPLÉTER — représentant du personnel ou aucun]</td></tr>
      </table>`;

      html += `<p><em>L'enquêteur a rappelé à la personne auditionnée le cadre de l'enquête, le caractère confidentiel de l'entretien, et son droit d'être accompagnée d'un représentant du personnel.</em></p>`;

      html += `<h2>II. DÉCLARATIONS DE LA PERSONNE AUDITIONNÉE</h2>`;
      html += `<p><em>Transcription fidèle des propos tenus :</em></p>`;

      const paragraphs = trans.texte_complet.split(/\n+/).filter(p => p.trim());
      paragraphs.forEach(p => { html += `<p>« ${p} »</p>`; });

      html += `<h2>III. PIÈCES REMISES LORS DE L'ENTRETIEN</h2>`;
      html += `<p>☐ Aucune</p><p>☐ [LISTE DES PIÈCES]</p>`;

      html += `<h2>IV. VALIDATION</h2>`;
      html += `<p>Le présent compte-rendu a été soumis à la personne auditionnée le [DATE] pour relecture et validation.</p>`;
      html += `<table>
        <tr><td style="width:50%">☐ Approuvé sans modification<br>☐ Approuvé avec modifications (annexées)<br>☐ Refus de signer (motif : [...])</td>
        <td style="width:50%"></td></tr>
        <tr><td>Signature de l'audité(e) :<br><br><br>Date :</td>
        <td>Signature de l'enquêteur :<br><br><br>Date :</td></tr>
      </table>`;
    }

    // Garde-fou
    html += `<div class="garde-fou">Ce document a été généré par transcription automatique (Whisper) et corrigé par intelligence artificielle. Il doit être relu et validé par l'enquêteur avant toute utilisation. La transcription automatique peut contenir des erreurs résiduelles.</div>`;

    html += `</body></html>`;

    // Retourner le HTML (le frontend peut le convertir en .docx ou l'imprimer en PDF)
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audition-${trans.personne_auditionnee || 'inconnu'}-${new Date(trans.created_at).toISOString().split('T')[0]}.html"`);
    return res.send(html);
  } catch (err) {
    console.error('[post-traitement/export]', err.message);
    return res.status(500).json({ error: 'Erreur export : ' + err.message });
  }
});

// ================================================
// POST /pipeline-complet — Tout en un : transcrire → corriger → identifier → exporter
// ================================================
router.post('/pipeline-complet', requireAvocat, async (req, res) => {
  try {
    const { transcription_id, interlocuteurs, format } = req.body || {};
    if (!transcription_id) return res.status(400).json({ error: 'transcription_id requis' });

    const results = { etapes: [] };

    // Étape 1 : Correction juridique
    try {
      const corrReq = { body: { transcription_id }, userId: req.userId, societeId: req.societeId, headers: req.headers };
      // Appeler directement la logique de correction
      const { data: trans } = await admin().from('enquete_transcriptions')
        .select('texte_complet')
        .eq('id', transcription_id)
        .eq('societe_id', req.societeId)
        .single();

      if (trans) {
        let texte = trans.texte_complet;
        let nbCorrections = 0;
        for (const [erreur, correction] of Object.entries(CORRECTIONS_JURIDIQUES)) {
          const regex = new RegExp('\\b' + erreur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
          const matches = texte.match(regex);
          if (matches) { nbCorrections += matches.length; texte = texte.replace(regex, correction); }
        }
        await admin().from('enquete_transcriptions').update({ texte_complet: texte }).eq('id', transcription_id);
        results.etapes.push({ etape: 'correction', corrections: nbCorrections, statut: 'ok' });
      }
    } catch (e) { results.etapes.push({ etape: 'correction', statut: 'erreur', message: e.message }); }

    // Étape 2 : Identification interlocuteurs (si fournis)
    if (interlocuteurs && interlocuteurs.length >= 2) {
      try {
        const { callClaude } = require('../../lib/legal-providers/legal-ia-router');
        const { data: trans } = await admin().from('enquete_transcriptions')
          .select('texte_complet').eq('id', transcription_id).single();

        const nomsListe = interlocuteurs.map(i => i.nom + ' (' + i.role + ')').join(', ');
        const sysPrompt = `Identifie qui parle dans cette transcription d'audition entre : ${nomsListe}. Retourne du JSON : {"dialogue":[{"locuteur":"...","role":"...","texte":"..."}]}`;

        const result = await callClaude(sysPrompt, (trans?.texte_complet || '').substring(0, 12000), { maxTokens: 8192 });
        const match = result.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          await admin().from('enquete_transcriptions').update({ segments: parsed.dialogue || [] }).eq('id', transcription_id);
          results.etapes.push({ etape: 'identification', interventions: (parsed.dialogue || []).length, statut: 'ok' });
        }
      } catch (e) { results.etapes.push({ etape: 'identification', statut: 'erreur', message: e.message }); }
    }

    results.etapes.push({ etape: 'export', format: format || 'verbatim', statut: 'prêt', url: '/api/avocat/enquete-post/export-word?transcription_id=' + transcription_id + '&format=' + (format || 'verbatim') });

    return res.json({
      transcription_id,
      pipeline: results,
      message: 'Pipeline terminé. ' + results.etapes.filter(e => e.statut === 'ok').length + '/' + results.etapes.length + ' étapes réussies.'
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur pipeline : ' + err.message });
  }
});

module.exports = router;
