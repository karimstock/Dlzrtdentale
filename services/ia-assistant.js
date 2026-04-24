// =============================================
// JADOMI — IA Assistant (suggestions, pas decisions)
// Passe 38 — 24 avril 2026
// L'IA propose TOUJOURS 3 suggestions, le pro choisit
// =============================================
const Anthropic = require('@anthropic-ai/sdk');

const METIER_CONTEXT = {
  dentiste: 'chirurgien-dentiste, cabinet dentaire, soins dentaires, implants, blanchiment, orthodontie',
  avocat: 'avocat, cabinet d\'avocats, droit, contentieux, conseil juridique, defense',
  orthodontiste: 'orthodontiste, aligneurs invisibles, appareils dentaires, sourire, correction',
  prothesiste: 'prothesiste dentaire, laboratoire, protheses, couronnes, bridges, ceramique, zircone'
};

async function suggestText(type, contexte_cabinet, texte_actuel, metier) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const metierCtx = METIER_CONTEXT[metier] || metier || 'professionnel de sante';

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 800,
    temperature: 0.7,
    system: `Tu es redacteur web professionnel specialise ${metierCtx}.
Propose EXACTEMENT 3 versions (60 mots max chacune) pour le champ "${type}".
Ton : professionnel rassurant, sans superlatifs agressifs.
Pas d'emojis sauf demande explicite. Vouvoiement obligatoire.
Reponds UNIQUEMENT en JSON strict : {"propositions": ["v1", "v2", "v3"]}`,
    messages: [{
      role: 'user',
      content: `Cabinet : ${contexte_cabinet || 'non precise'}
Texte actuel : ${texte_actuel || '(vide)'}
Champ a remplir : ${type}
Genere 3 propositions.`
    }]
  });

  const text = response.content[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Reponse IA invalide');

  const result = JSON.parse(jsonMatch[0]);
  const tokensIn = response.usage?.input_tokens || 0;
  const tokensOut = response.usage?.output_tokens || 0;
  const coutCentimes = Math.ceil((tokensIn * 0.3 + tokensOut * 1.5) / 1000);

  return {
    propositions: result.propositions || [],
    cout_centimes: coutCentimes
  };
}

async function suggestPalette(ambiance) {
  const palettes = {
    premium: [
      { primaire: '#0D2847', accent: '#C9A961', fond: '#FFFFFF', texte: '#1A1A2E' },
      { primaire: '#1A1A1A', accent: '#B8860B', fond: '#F5F5F0', texte: '#1A1A1A' },
      { primaire: '#2D3A8C', accent: '#D4A853', fond: '#FAFAF8', texte: '#1A1A2E' }
    ],
    chaleureux: [
      { primaire: '#6B8E7A', accent: '#D4A373', fond: '#FAF3E9', texte: '#2D2D2D' },
      { primaire: '#8B6F47', accent: '#D4AF37', fond: '#FFF8F0', texte: '#3D3024' },
      { primaire: '#B85C38', accent: '#E8C170', fond: '#FEF9F2', texte: '#2C1810' }
    ],
    clinique: [
      { primaire: '#4A90E2', accent: '#E8F1FB', fond: '#FFFFFF', texte: '#1A1A2E' },
      { primaire: '#0077B6', accent: '#CAF0F8', fond: '#F8FBFF', texte: '#023E8A' },
      { primaire: '#2563EB', accent: '#DBEAFE', fond: '#FAFBFF', texte: '#1E293B' }
    ],
    moderne: [
      { primaire: '#0F3460', accent: '#E5E7EB', fond: '#FFFFFF', texte: '#111827' },
      { primaire: '#1F2937', accent: '#9CA3AF', fond: '#F9FAFB', texte: '#111827' },
      { primaire: '#00B8A9', accent: '#E0F7F5', fond: '#FFFFFF', texte: '#134E4A' }
    ]
  };
  return palettes[ambiance] || palettes.premium;
}

async function suggestPhotos(section, metier) {
  const PEXELS_KEY = process.env.PEXELS_API_KEY;
  if (!PEXELS_KEY) return [];

  const queries = {
    hero: { dentiste: 'modern dental clinic interior', avocat: 'elegant law office', orthodontiste: 'bright smile orthodontic', prothesiste: 'dental laboratory precision' },
    about: { dentiste: 'dentist professional portrait', avocat: 'lawyer professional portrait', orthodontiste: 'orthodontist consultation', prothesiste: 'dental technician work' },
    equipe: { dentiste: 'dental team professional', avocat: 'law firm team meeting', orthodontiste: 'orthodontic team', prothesiste: 'dental lab team' },
    soins: { dentiste: 'dental treatment modern', avocat: 'legal consultation', orthodontiste: 'orthodontic aligners', prothesiste: 'dental prosthetics crafting' }
  };

  const query = queries[section]?.[metier] || 'professional healthcare office';

  try {
    const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=6&orientation=landscape`, {
      headers: { Authorization: PEXELS_KEY },
      signal: AbortSignal.timeout(8000)
    });
    const data = await res.json();
    return (data.photos || []).map(p => ({
      url: p.src.large,
      url_small: p.src.medium,
      photographer: p.photographer,
      alt: p.alt || query
    }));
  } catch {
    return [];
  }
}

async function verifierSite(siteId, supabase) {
  const issues = [];

  const { data: site } = await supabase.from('sites_jadomi').select('*').eq('id', siteId).single();
  if (!site) return [{ type: 'error', message: 'Site non trouve' }];

  const { data: sections } = await supabase.from('sites_jadomi_sections').select('*').eq('site_id', siteId);

  // Verifier completude
  const requiredSections = ['hero', 'contact', 'services'];
  for (const req of requiredSections) {
    const found = (sections || []).find(s => s.cle === req);
    if (!found) issues.push({ type: 'warning', section: req, message: `Section "${req}" manquante` });
    else if (!found.valeur || Object.keys(found.valeur).length === 0) {
      issues.push({ type: 'warning', section: req, message: `Section "${req}" vide` });
    }
  }

  // Verifier contact
  const contact = (sections || []).find(s => s.cle === 'contact');
  if (contact?.valeur) {
    if (!contact.valeur.telephone) issues.push({ type: 'info', section: 'contact', message: 'Telephone non renseigne' });
    if (!contact.valeur.email) issues.push({ type: 'info', section: 'contact', message: 'Email non renseigne' });
    if (!contact.valeur.adresse) issues.push({ type: 'info', section: 'contact', message: 'Adresse non renseignee' });
  }

  // Verifier hero
  const hero = (sections || []).find(s => s.cle === 'hero');
  if (hero?.valeur) {
    if (!hero.valeur.slogan || hero.valeur.slogan.length < 10) {
      issues.push({ type: 'suggestion', section: 'hero', message: 'Le slogan est trop court. Utilisez la suggestion IA pour un texte accrocheur.' });
    }
  }

  if (issues.length === 0) issues.push({ type: 'success', message: 'Tout est pret pour la publication.' });

  return issues;
}

module.exports = { suggestText, suggestPalette, suggestPhotos, verifierSite };
