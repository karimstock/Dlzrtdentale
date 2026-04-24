// =============================================
// JADOMI — Generation section/page IA par metier
// Passe 41B — 24 avril 2026
// POST /api/vitrines/generate-section
// =============================================
const Anthropic = require('@anthropic-ai/sdk');
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

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

module.exports = function (router) {

  // POST /generate-section
  router.post('/generate-section', async (req, res) => {
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Token requis' });
      const { data: { user }, error: authErr } = await admin().auth.getUser(token);
      if (authErr || !user) return res.status(401).json({ error: 'Token invalide' });

      const { site_id, section_type, section_id, ton, custom_prompt } = req.body || {};
      if (!site_id || !section_id) return res.status(400).json({ error: 'site_id et section_id requis' });

      // Charger le site + societe
      const { data: site } = await admin().from('vitrines_sites').select('*, societes(*)').eq('id', site_id).single();
      if (!site) return res.status(404).json({ error: 'Site non trouve' });

      const societe = site.societes || {};
      const metier = site.profession_id || 'dentiste';
      const nomCabinet = societe.nom || 'Cabinet';
      const ville = societe.adresse_ville || societe.ville || '';
      const tonEditorial = ton || 'chaleureux';

      // Charger la config profession
      let profConfig;
      try { profConfig = require('./professions/' + metier); } catch { profConfig = require('./professions/dentiste'); }

      // Trouver la section dans les configs
      let sectionConfig = null;
      let sectionTitle = section_id;

      if (section_type === 'equipment' && profConfig.equipements_disponibles) {
        sectionConfig = profConfig.equipements_disponibles.find(e => e.id === section_id);
        if (sectionConfig?.section_proposee) sectionTitle = sectionConfig.section_proposee.titre;
      } else if (section_type === 'specialite' && profConfig.specialites_disponibles) {
        sectionConfig = profConfig.specialites_disponibles.find(s => s.id === section_id);
        if (sectionConfig?.page_proposee) sectionTitle = sectionConfig.page_proposee.titre;
      }

      // Construire le prompt
      const isPage = section_type === 'specialite'; // avocats = pages dediees
      const prompt = custom_prompt || buildPrompt(metier, nomCabinet, ville, tonEditorial, sectionTitle, sectionConfig, isPage);

      // Appeler Claude
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        temperature: 0.6,
        system: `Tu es redacteur web expert specialise en ${metier}. Tu generes du contenu de haute qualite pour des sites professionnels. Reponds UNIQUEMENT en JSON strict.`,
        messages: [{ role: 'user', content: prompt }]
      });

      const text = response.content[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return res.status(500).json({ error: 'Reponse IA invalide' });

      const generatedContent = JSON.parse(jsonMatch[0]);

      // Sauvegarder en DB
      if (isPage) {
        // Creer une page dediee
        const pageSlug = section_id.replace(/_/g, '-');
        const { data: page } = await admin().from('vitrines_pages').upsert({
          site_id, slug: pageSlug, titre: generatedContent.titre || sectionTitle,
          specialite_id: section_id, type: 'specialite', is_generated_ia: true
        }, { onConflict: 'site_id,slug' }).select().single();

        // Creer la section liee a la page
        await admin().from('vitrines_sections').insert({
          site_id, type: 'page_content', key: section_id,
          content: generatedContent, page_id: page?.id,
          section_source: 'ia_generated', specialite_id: section_id
        });
      } else {
        // Section integree a la page d'accueil
        await admin().from('vitrines_sections').insert({
          site_id, type: 'equipment_section', key: section_id,
          content: generatedContent,
          section_source: 'ia_generated', equipment_id: section_id
        });
      }

      const tokensIn = response.usage?.input_tokens || 0;
      const tokensOut = response.usage?.output_tokens || 0;
      const coutCentimes = Math.ceil((tokensIn * 0.3 + tokensOut * 1.5) / 1000);

      return res.json({
        success: true,
        section_id,
        titre: generatedContent.titre || sectionTitle,
        content: generatedContent,
        cout_centimes: coutCentimes,
        is_page: isPage
      });

    } catch (err) {
      console.error('[generate-section]', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /sections-recommandees/:site_id
  router.get('/sections-recommandees/:site_id', async (req, res) => {
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Token requis' });

      const { data: site } = await admin().from('vitrines_sites').select('*').eq('id', req.params.site_id).single();
      if (!site) return res.status(404).json({ error: 'Site non trouve' });

      const metier = site.profession_id || 'dentiste';
      let profConfig;
      try { profConfig = require('./professions/' + metier); } catch { profConfig = require('./professions/dentiste'); }

      // Charger la conversation pour trouver les equipements/specialites coches
      const { data: conv } = await admin().from('vitrines_conversations').select('extracted_data').eq('site_id', site.id).single();
      const extracted = conv?.extracted_data || {};

      const equipements = extracted.equipements || [];
      const specialites = extracted.specialites || [];

      const recommendations = [];

      // Recommander sections equipements
      if (profConfig.equipements_disponibles) {
        for (const eq of profConfig.equipements_disponibles) {
          if (equipements.includes(eq.id) || equipements.includes(eq.label)) {
            recommendations.push({
              type: 'equipment',
              id: eq.id,
              label: eq.label,
              icone: eq.icone || '',
              titre: eq.section_proposee?.titre || eq.label,
              description: eq.section_proposee?.description_courte || '',
              recommended: true
            });
          }
        }
      }

      // Recommander pages specialites
      if (profConfig.specialites_disponibles) {
        for (const sp of profConfig.specialites_disponibles) {
          if (specialites.includes(sp.id) || specialites.includes(sp.label)) {
            recommendations.push({
              type: 'specialite',
              id: sp.id,
              label: sp.label,
              titre: sp.page_proposee?.titre || sp.label,
              description: sp.page_proposee?.sous_titre || '',
              recommended: true,
              is_page: true
            });
          }
        }
      }

      return res.json({ recommendations, metier, equipements_detectes: equipements, specialites_detectees: specialites });

    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });
};

function buildPrompt(metier, nomCabinet, ville, ton, titre, config, isPage) {
  const metierLabels = { dentiste: 'dentisterie', avocat: 'droit', orthodontiste: 'orthodontie', prothesiste: 'prothese dentaire' };
  const domaine = metierLabels[metier] || metier;

  if (isPage) {
    const sections = config?.page_proposee?.sections_internes || ['Presentation', 'Cas traites', 'Accompagnement', 'FAQ'];
    return `Cabinet : ${nomCabinet} (${ville})
Ton editorial : ${ton}
Domaine : ${domaine}

Genere UNE PAGE COMPLETE pour la specialite "${titre}".

Structure :
- titre : titre H1 de la page
- sous_titre : sous-titre 10-15 mots
- introduction : 3-4 phrases
- cas_traites : array de 4-5 cas avec titre + description courte
- process : array de 4-5 etapes d'accompagnement
- faq : array de 6-8 questions/reponses
- call_to_action : phrase CTA
- meta_description : 155 caracteres max

Sections a couvrir : ${sections.join(', ')}
Ton ${ton}, SEO naturel, vulgarise pour le client.
Format JSON strict.`;
  }

  const avantages = config?.section_proposee?.avantages_patient || [];
  const applications = config?.section_proposee?.applications || [];

  return `Cabinet : ${nomCabinet} (${ville})
Ton editorial : ${ton}
Domaine : ${domaine}

Genere une section de site intitulee "${titre}".

Structure :
- titre : titre H2
- sous_titre : 10-15 mots
- introduction : 2-3 phrases
- points_cles : array de 3-5 avantages
- paragraphes : array de 2 paragraphes detailles
- call_to_action : phrase CTA
- meta_description : 155 caracteres max

${avantages.length ? 'Avantages a mettre en avant : ' + avantages.join(', ') : ''}
${applications.length ? 'Applications : ' + applications.join(', ') : ''}
Ton ${ton}, langage patient, SEO naturel avec "${ville}" et "${domaine}".
Format JSON strict.`;
}
