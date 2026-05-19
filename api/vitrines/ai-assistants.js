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
const BASE_SYSTEM = `Vous êtes un assistant spécialisé dans la communication pour les cabinets d'avocats français.
Ton professionnel, précis, sobre. Contexte : droit français, déontologie du barreau, RGPD.
Répondez toujours en français sauf instruction contraire.`;

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
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: BASE_SYSTEM,
        messages: [{
          role: 'user',
          content: `Générez exactement 3 slogans pour le cabinet d'avocats "${cabinet_name}", barreau de ${barreau}.
Expertises : ${expertises.join(', ')}.

Chaque slogan doit :
- Faire entre 3 et 6 mots
- Être percutant, professionnel et mémorable
- Refléter les valeurs du cabinet et ses expertises

Pour chaque slogan, proposez aussi un sous-titre complémentaire (max 60 caractères).

Répondez UNIQUEMENT en JSON valide, format :
[{"text": "Le slogan", "subtitle": "Le sous-titre complémentaire"}]`
        }]
      });

      const text = response.content[0].text.trim();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return res.status(500).json({ error: 'ai_parse_error', message: 'Réponse IA non parseable' });
      }

      const slogans = JSON.parse(jsonMatch[0]);
      res.json({ slogans });
    } catch (err) {
      console.error('[vitrines/ai-assistants] generate-slogan:', err.message);
      res.status(500).json({ error: 'ai_error', message: 'Erreur interne' });
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
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: BASE_SYSTEM,
        messages: [{
          role: 'user',
          content: `Générez un sous-titre professionnel (60 caractères maximum) pour compléter le slogan suivant d'un cabinet d'avocats :

Slogan : "${slogan}"
Avocat : ${avocat_name || 'Non précisé'}
Barreau : ${barreau || 'Non précisé'}
Expertises : ${expertises.join(', ')}

Le sous-titre doit :
- Compléter le slogan sans le répéter
- Être sobre et professionnel
- Ne pas dépasser 60 caractères

Répondez UNIQUEMENT avec le sous-titre, sans guillemets ni ponctuation finale.`
        }]
      });

      const subtitle = response.content[0].text.trim().replace(/^["']|["']$/g, '');
      res.json({ subtitle });
    } catch (err) {
      console.error('[vitrines/ai-assistants] generate-subtitle:', err.message);
      res.status(500).json({ error: 'ai_error', message: 'Erreur interne' });
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
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: BASE_SYSTEM,
        messages: [{
          role: 'user',
          content: `Rédigez les mentions légales complètes pour le site internet du cabinet d'avocats suivant :

Cabinet : ${cabinet_name}
SIRET : ${siret || '[À compléter]'}
Adresse : ${address || '[À compléter]'}
Avocat responsable : ${avocat_name}
Barreau : ${barreau}

Les mentions légales doivent être conformes au droit français et au RGPD. Structurez en HTML avec les sections suivantes :
1. <h2>Éditeur du site</h2> — identité complète du cabinet
2. <h2>Hébergeur</h2> — JADOMI SAS, hébergé par OVH SAS, 2 rue Kellermann, 59100 Roubaix
3. <h2>Propriété intellectuelle</h2> — protection du contenu
4. <h2>Responsabilité</h2> — limitations de responsabilité
5. <h2>Protection des données personnelles (RGPD)</h2> — droits des utilisateurs, base légale, durée de conservation, contact DPO
6. <h2>Cookies</h2> — politique cookies, consentement
7. <h2>Déontologie</h2> — référence au Règlement Intérieur National (RIN), Conseil National des Barreaux (CNB), obligation de secret professionnel

Utilisez des balises HTML (<h2>, <p>, <ul>, <li>) pour la mise en forme.
Répondez UNIQUEMENT avec le HTML, sans bloc de code markdown.`
        }]
      });

      let content = response.content[0].text.trim();
      // Nettoyer les éventuels blocs markdown
      content = content.replace(/^```html?\s*/i, '').replace(/\s*```$/i, '');

      res.json({ content });
    } catch (err) {
      console.error('[vitrines/ai-assistants] generate-legal:', err.message);
      res.status(500).json({ error: 'ai_error', message: 'Erreur interne' });
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
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: BASE_SYSTEM,
        messages: [{
          role: 'user',
          content: `Rédigez une biographie professionnelle pour un avocat, entre 150 et 200 mots.

Nom : ${name}
Barreau : ${barreau}
Expertises : ${expertises.join(', ')}
Années d'expérience : ${years_exp || 'Non précisé'}
Formation : ${formation || 'Non précisée'}

La biographie doit :
- Commencer par "Avocat(e) au Barreau de ${barreau}"
- Mettre en avant les expertises et l'expérience
- Être rédigée à la troisième personne
- Ton professionnel et sobre, inspire confiance
- Mentionner la formation si fournie

Répondez UNIQUEMENT avec le texte de la biographie, sans titre ni guillemets.`
        }]
      });

      const content = response.content[0].text.trim();
      res.json({ content });
    } catch (err) {
      console.error('[vitrines/ai-assistants] generate-bio:', err.message);
      res.status(500).json({ error: 'ai_error', message: 'Erreur interne' });
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
        cabinet: `Rédigez le contenu HTML de la section "Le Cabinet" pour le site d'un cabinet d'avocats.
Incluez : présentation du cabinet, valeurs, approche client, engagement.
Utilisez des <h3>, <p> et <ul> pour structurer.
150-250 mots.`,

        expertises: `Rédigez le contenu HTML de la section "Nos Expertises" pour un cabinet d'avocats.
Pour chaque expertise listée, rédigez un paragraphe de 2-3 phrases.
Utilisez des <h3> pour chaque expertise et <p> pour les descriptions.`,

        equipe: `Rédigez le contenu HTML de la section "Notre Équipe" pour un cabinet d'avocats.
Incluez : introduction de l'équipe, valeurs partagées, complémentarité.
Utilisez des <h3> et <p>. 100-150 mots pour l'introduction.`,

        actualites: `Rédigez le contenu HTML de la section "Actualités" pour un cabinet d'avocats.
Générez 3 exemples d'articles courts (titre + résumé 2-3 phrases) sur des sujets juridiques actuels.
Utilisez des <article>, <h3> et <p>.`,

        contact: `Rédigez le contenu HTML de la section "Contact" pour un cabinet d'avocats.
Incluez : texte d'accueil invitant à prendre contact, mention des horaires, engagement de réponse rapide.
Utilisez des <h3> et <p>. Ton accueillant mais professionnel. 80-120 mots.`,

        faq: `Rédigez le contenu HTML de la section "Questions Fréquentes" pour un cabinet d'avocats.
Générez 5-6 questions/réponses pertinentes sur : premier rendez-vous, honoraires, délais, confidentialité, procédures.
Utilisez des <details> et <summary> pour chaque question, <p> pour la réponse.`
      };

      const cabinetInfo = `
Informations du cabinet :
- Nom : ${cabinet_data.cabinet_name || 'Non précisé'}
- Avocat : ${cabinet_data.avocat_name || 'Non précisé'}
- Barreau : ${cabinet_data.barreau || 'Non précisé'}
- Expertises : ${(cabinet_data.expertises || []).join(', ') || 'Non précisées'}
- Adresse : ${cabinet_data.address || 'Non précisée'}`;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: BASE_SYSTEM,
        messages: [{
          role: 'user',
          content: `${sectionPrompts[section_type]}

${cabinetInfo}

Répondez UNIQUEMENT avec le HTML, sans bloc de code markdown.`
        }]
      });

      let content = response.content[0].text.trim();
      content = content.replace(/^```html?\s*/i, '').replace(/\s*```$/i, '');

      res.json({ content });
    } catch (err) {
      console.error('[vitrines/ai-assistants] generate-section-content:', err.message);
      res.status(500).json({ error: 'ai_error', message: 'Erreur interne' });
    }
  });

  // ------------------------------------------
  // POST /ai/translate — Traduction avec preservation HTML
  // ------------------------------------------
  router.post('/ai/translate', requireSociete(), async (req, res) => {
    try {
      const { content, target_lang } = req.body;

      const validLangs = { en: 'anglais', es: 'espagnol', de: 'allemand', ar: 'arabe', nl: 'néerlandais' };
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'validation', message: 'content (string) requis' });
      }
      if (!target_lang || !validLangs[target_lang]) {
        return res.status(400).json({ error: 'validation', message: `target_lang requis, valeurs possibles : ${Object.keys(validLangs).join(', ')}` });
      }

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: `Vous êtes un traducteur professionnel spécialisé dans le domaine juridique.
Vous traduisez du français vers d'autres langues en préservant :
- Toutes les balises HTML intactes (ne traduisez pas les attributs)
- Le vocabulaire juridique précis de la langue cible
- Le ton professionnel et formel`,
        messages: [{
          role: 'user',
          content: `Traduisez le contenu suivant du français vers le ${validLangs[target_lang]}.
Conservez toutes les balises HTML exactement comme elles sont.
Ne traduisez que le texte visible, pas les attributs HTML.

Contenu à traduire :
${content}

Répondez UNIQUEMENT avec le contenu traduit, sans commentaire ni bloc de code.`
        }]
      });

      const translated = response.content[0].text.trim();
      res.json({ translated });
    } catch (err) {
      console.error('[vitrines/ai-assistants] translate:', err.message);
      res.status(500).json({ error: 'ai_error', message: 'Erreur interne' });
    }
  });

};
