// =============================================
// JADOMI — Module Mon site internet
// ai-assistants.js — Generation de contenu IA pour wizard avocat
// =============================================
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const { requireSociete } = require('../multiSocietes/middleware');

let _admin = null;
function admin() {
  if (!_admin) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant');
    _admin = createClient(process.env.SUPABASE_URL, key, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ------------------------------------------
// System prompt de base pour contexte juridique francais
// ------------------------------------------
const BASE_SYSTEM = `Vous etes un assistant specialise dans la communication pour les cabinets d'avocats francais.
Ton professionnel, precis, sobre. Contexte : droit francais, deontologie du barreau, RGPD.
Repondez toujours en francais sauf instruction contraire.`;

module.exports = function(router) {

  // ------------------------------------------
  // POST /ai/generate-slogan — Generer 3 slogans pour cabinet
  // ------------------------------------------
  router.post('/ai/generate-slogan', requireSociete(), async (req, res) => {
    try {
      const { expertises, barreau, cabinet_name } = req.body;

      if (!expertises || !Array.isArray(expertises) || !barreau || !cabinet_name) {
        return res.status(400).json({ error: 'validation', message: 'expertises (array), barreau et cabinet_name requis' });
      }

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: BASE_SYSTEM,
        messages: [{
          role: 'user',
          content: `Generez exactement 3 slogans pour le cabinet d'avocats "${cabinet_name}", barreau de ${barreau}.
Expertises : ${expertises.join(', ')}.

Chaque slogan doit :
- Faire entre 3 et 6 mots
- Etre percutant, professionnel et memorable
- Refleter les valeurs du cabinet et ses expertises

Pour chaque slogan, proposez aussi un sous-titre complementaire (max 60 caracteres).

Repondez UNIQUEMENT en JSON valide, format :
[{"text": "Le slogan", "subtitle": "Le sous-titre complementaire"}]`
        }]
      });

      const text = response.content[0].text.trim();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return res.status(500).json({ error: 'ai_parse_error', message: 'Reponse IA non parseable' });
      }

      const slogans = JSON.parse(jsonMatch[0]);
      res.json({ slogans });
    } catch (err) {
      console.error('[vitrines/ai-assistants] generate-slogan:', err.message);
      res.status(500).json({ error: 'ai_error', message: err.message });
    }
  });

  // ------------------------------------------
  // POST /ai/generate-subtitle — Generer un sous-titre
  // ------------------------------------------
  router.post('/ai/generate-subtitle', requireSociete(), async (req, res) => {
    try {
      const { slogan, expertises, barreau, avocat_name } = req.body;

      if (!slogan || !expertises || !Array.isArray(expertises)) {
        return res.status(400).json({ error: 'validation', message: 'slogan et expertises (array) requis' });
      }

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: BASE_SYSTEM,
        messages: [{
          role: 'user',
          content: `Generez un sous-titre professionnel (60 caracteres maximum) pour completer le slogan suivant d'un cabinet d'avocats :

Slogan : "${slogan}"
Avocat : ${avocat_name || 'Non precise'}
Barreau : ${barreau || 'Non precise'}
Expertises : ${expertises.join(', ')}

Le sous-titre doit :
- Completer le slogan sans le repeter
- Etre sobre et professionnel
- Ne pas depasser 60 caracteres

Repondez UNIQUEMENT avec le sous-titre, sans guillemets ni ponctuation finale.`
        }]
      });

      const subtitle = response.content[0].text.trim().replace(/^["']|["']$/g, '');
      res.json({ subtitle });
    } catch (err) {
      console.error('[vitrines/ai-assistants] generate-subtitle:', err.message);
      res.status(500).json({ error: 'ai_error', message: err.message });
    }
  });

  // ------------------------------------------
  // POST /ai/generate-legal — Mentions legales completes RGPD
  // ------------------------------------------
  router.post('/ai/generate-legal', requireSociete(), async (req, res) => {
    try {
      const { cabinet_name, siret, address, avocat_name, barreau } = req.body;

      if (!cabinet_name || !avocat_name || !barreau) {
        return res.status(400).json({ error: 'validation', message: 'cabinet_name, avocat_name et barreau requis' });
      }

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: BASE_SYSTEM,
        messages: [{
          role: 'user',
          content: `Redigez les mentions legales completes pour le site internet du cabinet d'avocats suivant :

Cabinet : ${cabinet_name}
SIRET : ${siret || '[A completer]'}
Adresse : ${address || '[A completer]'}
Avocat responsable : ${avocat_name}
Barreau : ${barreau}

Les mentions legales doivent etre conformes au droit francais et au RGPD. Structurez en HTML avec les sections suivantes :
1. <h2>Editeur du site</h2> — identite complete du cabinet
2. <h2>Hebergeur</h2> — JADOMI SAS, heberge par OVH SAS, 2 rue Kellermann, 59100 Roubaix
3. <h2>Propriete intellectuelle</h2> — protection du contenu
4. <h2>Responsabilite</h2> — limitations de responsabilite
5. <h2>Protection des donnees personnelles (RGPD)</h2> — droits des utilisateurs, base legale, duree de conservation, contact DPO
6. <h2>Cookies</h2> — politique cookies, consentement
7. <h2>Deontologie</h2> — reference au Reglement Interieur National (RIN), Conseil National des Barreaux (CNB), obligation de secret professionnel

Utilisez des balises HTML (<h2>, <p>, <ul>, <li>) pour la mise en forme.
Repondez UNIQUEMENT avec le HTML, sans bloc de code markdown.`
        }]
      });

      let content = response.content[0].text.trim();
      // Nettoyer les eventuels blocs markdown
      content = content.replace(/^```html?\s*/i, '').replace(/\s*```$/i, '');

      res.json({ content });
    } catch (err) {
      console.error('[vitrines/ai-assistants] generate-legal:', err.message);
      res.status(500).json({ error: 'ai_error', message: err.message });
    }
  });

  // ------------------------------------------
  // POST /ai/generate-bio — Biographie professionnelle avocat
  // ------------------------------------------
  router.post('/ai/generate-bio', requireSociete(), async (req, res) => {
    try {
      const { name, expertises, years_exp, barreau, formation } = req.body;

      if (!name || !expertises || !Array.isArray(expertises) || !barreau) {
        return res.status(400).json({ error: 'validation', message: 'name, expertises (array) et barreau requis' });
      }

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: BASE_SYSTEM,
        messages: [{
          role: 'user',
          content: `Redigez une biographie professionnelle pour un avocat, entre 150 et 200 mots.

Nom : ${name}
Barreau : ${barreau}
Expertises : ${expertises.join(', ')}
Annees d'experience : ${years_exp || 'Non precise'}
Formation : ${formation || 'Non precisee'}

La biographie doit :
- Commencer par "Avocat(e) au Barreau de ${barreau}"
- Mettre en avant les expertises et l'experience
- Etre redigee a la troisieme personne
- Ton professionnel et sobre, inspire confiance
- Mentionner la formation si fournie

Repondez UNIQUEMENT avec le texte de la biographie, sans titre ni guillemets.`
        }]
      });

      const content = response.content[0].text.trim();
      res.json({ content });
    } catch (err) {
      console.error('[vitrines/ai-assistants] generate-bio:', err.message);
      res.status(500).json({ error: 'ai_error', message: err.message });
    }
  });

  // ------------------------------------------
  // POST /ai/generate-section-content — Contenu de section
  // ------------------------------------------
  router.post('/ai/generate-section-content', requireSociete(), async (req, res) => {
    try {
      const { section_type, cabinet_data } = req.body;

      const validTypes = ['cabinet', 'expertises', 'equipe', 'actualites', 'contact', 'faq'];
      if (!section_type || !validTypes.includes(section_type)) {
        return res.status(400).json({ error: 'validation', message: `section_type requis, valeurs possibles : ${validTypes.join(', ')}` });
      }
      if (!cabinet_data || typeof cabinet_data !== 'object') {
        return res.status(400).json({ error: 'validation', message: 'cabinet_data (object) requis' });
      }

      const sectionPrompts = {
        cabinet: `Redigez le contenu HTML de la section "Le Cabinet" pour le site d'un cabinet d'avocats.
Incluez : presentation du cabinet, valeurs, approche client, engagement.
Utilisez des <h3>, <p> et <ul> pour structurer.
150-250 mots.`,

        expertises: `Redigez le contenu HTML de la section "Nos Expertises" pour un cabinet d'avocats.
Pour chaque expertise listee, redigez un paragraphe de 2-3 phrases.
Utilisez des <h3> pour chaque expertise et <p> pour les descriptions.`,

        equipe: `Redigez le contenu HTML de la section "Notre Equipe" pour un cabinet d'avocats.
Incluez : introduction de l'equipe, valeurs partagees, complementarite.
Utilisez des <h3> et <p>. 100-150 mots pour l'introduction.`,

        actualites: `Redigez le contenu HTML de la section "Actualites" pour un cabinet d'avocats.
Generez 3 exemples d'articles courts (titre + resume 2-3 phrases) sur des sujets juridiques actuels.
Utilisez des <article>, <h3> et <p>.`,

        contact: `Redigez le contenu HTML de la section "Contact" pour un cabinet d'avocats.
Incluez : texte d'accueil invitant a prendre contact, mention des horaires, engagement de reponse rapide.
Utilisez des <h3> et <p>. Ton accueillant mais professionnel. 80-120 mots.`,

        faq: `Redigez le contenu HTML de la section "Questions Frequentes" pour un cabinet d'avocats.
Generez 5-6 questions/reponses pertinentes sur : premier rendez-vous, honoraires, delais, confidentialite, procedures.
Utilisez des <details> et <summary> pour chaque question, <p> pour la reponse.`
      };

      const cabinetInfo = `
Informations du cabinet :
- Nom : ${cabinet_data.cabinet_name || 'Non precise'}
- Avocat : ${cabinet_data.avocat_name || 'Non precise'}
- Barreau : ${cabinet_data.barreau || 'Non precise'}
- Expertises : ${(cabinet_data.expertises || []).join(', ') || 'Non precisees'}
- Adresse : ${cabinet_data.address || 'Non precisee'}`;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: BASE_SYSTEM,
        messages: [{
          role: 'user',
          content: `${sectionPrompts[section_type]}

${cabinetInfo}

Repondez UNIQUEMENT avec le HTML, sans bloc de code markdown.`
        }]
      });

      let content = response.content[0].text.trim();
      content = content.replace(/^```html?\s*/i, '').replace(/\s*```$/i, '');

      res.json({ content });
    } catch (err) {
      console.error('[vitrines/ai-assistants] generate-section-content:', err.message);
      res.status(500).json({ error: 'ai_error', message: err.message });
    }
  });

  // ------------------------------------------
  // POST /ai/translate — Traduction avec preservation HTML
  // ------------------------------------------
  router.post('/ai/translate', requireSociete(), async (req, res) => {
    try {
      const { content, target_lang } = req.body;

      const validLangs = { en: 'anglais', es: 'espagnol', de: 'allemand', ar: 'arabe', nl: 'neerlandais' };
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'validation', message: 'content (string) requis' });
      }
      if (!target_lang || !validLangs[target_lang]) {
        return res.status(400).json({ error: 'validation', message: `target_lang requis, valeurs possibles : ${Object.keys(validLangs).join(', ')}` });
      }

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: `Vous etes un traducteur professionnel specialise dans le domaine juridique.
Vous traduisez du francais vers d'autres langues en preservant :
- Toutes les balises HTML intactes (ne traduisez pas les attributs)
- Le vocabulaire juridique precis de la langue cible
- Le ton professionnel et formel`,
        messages: [{
          role: 'user',
          content: `Traduisez le contenu suivant du francais vers le ${validLangs[target_lang]}.
Conservez toutes les balises HTML exactement comme elles sont.
Ne traduisez que le texte visible, pas les attributs HTML.

Contenu a traduire :
${content}

Repondez UNIQUEMENT avec le contenu traduit, sans commentaire ni bloc de code.`
        }]
      });

      const translated = response.content[0].text.trim();
      res.json({ translated });
    } catch (err) {
      console.error('[vitrines/ai-assistants] translate:', err.message);
      res.status(500).json({ error: 'ai_error', message: err.message });
    }
  });

};
