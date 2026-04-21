// =============================================
// JADOMI LABO — Extraction IA grilles tarifaires
// Utilise JADOMI IA (Claude Sonnet) pour OCR/extraction
// =============================================

const Anthropic = require('@anthropic-ai/sdk');

const PROMPT_EXTRACTION = `Tu analyses une grille tarifaire de laboratoire de prothese dentaire francaise.
Extrais TOUS les produits avec leurs prix.
Pour chaque produit :
- nom : denomination exacte telle que ecrite dans le document
- prix_ht : prix en euros (nombre decimal, sans symbole)
- categorie_suggeree : parmi [amovible_resine, amovible_metallique, fixe_metal, fixe_ceramique, implant, orthese, odf, reparation, accessoire, dents, autre]
- type_produit : prothese|orthese|accessoire|reparation
- tva_applicable : false si prothese (art. 261 CGI), true si orthese (gouttiere, ODF, aligneur)
- code_ccam : si present dans le document
- notes : caracteristiques techniques eventuelles

Retourne un JSON valide avec la structure :
{
  "produits": [
    {
      "nom": "...",
      "prix_ht": 0.00,
      "categorie_suggeree": "...",
      "type_produit": "...",
      "tva_applicable": false,
      "code_ccam": null,
      "notes": ""
    }
  ],
  "metadata": {
    "nom_labo": "si visible",
    "date_grille": "si visible",
    "nombre_produits": 0
  }
}

IMPORTANT :
- Ne manque AUCUN produit
- Si plusieurs variantes (ex: 1 dent, 2 dents, 3 dents), cree une ligne par variante
- Prix en HT uniquement
- JSON strict, pas de commentaires
- Si un prix est ambigu, mets la valeur la plus probable`;

let _anthropic = null;
function getClient() {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

// Extraction depuis texte (CSV, Excel converti en texte)
async function extraireDepuisTexte(texte) {
  const client = getClient();
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    messages: [{
      role: 'user',
      content: `${PROMPT_EXTRACTION}\n\nVoici le contenu de la grille tarifaire :\n\n${texte}`
    }]
  });

  const content = msg.content[0]?.text || '';
  return parseResponse(content);
}

// Extraction depuis image/PDF (vision)
async function extraireDepuisImage(base64Data, mediaType) {
  const client = getClient();
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64Data }
        },
        { type: 'text', text: PROMPT_EXTRACTION }
      ]
    }]
  });

  const content = msg.content[0]?.text || '';
  return parseResponse(content);
}

// Extraction depuis PDF multi-pages (texte extrait par pdf-parse)
async function extraireDepuisPdfTexte(pdfText) {
  return extraireDepuisTexte(pdfText);
}

function parseResponse(content) {
  // Extraire le JSON de la reponse
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Pas de JSON dans la reponse IA');

  try {
    const data = JSON.parse(jsonMatch[0]);
    if (!data.produits || !Array.isArray(data.produits)) {
      throw new Error('Format de reponse invalide : pas de tableau produits');
    }
    return data;
  } catch (e) {
    throw new Error('Erreur parsing JSON IA: ' + e.message);
  }
}

module.exports = {
  extraireDepuisTexte,
  extraireDepuisImage,
  extraireDepuisPdfTexte
};
