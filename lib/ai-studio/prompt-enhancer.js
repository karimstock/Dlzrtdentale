// =============================================
// JADOMI Studio — Prompt Enhancer
// Claude optimise les briefs simples en prompts IA techniques
// =============================================

async function enhancePrompt(anthropic, userBrief, mediaType, style) {
  if (!anthropic) {
    throw new Error('anthropic_client_required');
  }

  const styleDescriptions = {
    pro: 'Style professionnel scientifique, sérieux et crédible',
    moderne: 'Style moderne épuré, design minimaliste contemporain',
    chaleureux: 'Ambiance chaleureuse humaine, proximité patient',
    scientifique: 'Style académique médical, rigueur scientifique',
  };

  const styleDesc = styleDescriptions[style] || styleDescriptions.pro;
  const mediaDesc = mediaType === 'video'
    ? 'une vidéo publicitaire Sora 2 (mouvement caméra, éclairage cinématique)'
    : 'une image publicitaire DALL-E 3 (composition, éclairage, texte intégré)';

  const systemPrompt = `Tu es expert en création publicitaire dentaire B2B.
Tu reçois un brief simple de dentiste/formateur et le transformes en prompt technique optimisé pour ${mediaDesc}.

Règles strictes :
- Respecte le Code de déontologie dentaire (pas de promesses médicales trompeuses)
- Style professionnel adapté à audience professionnelle de santé
- Ambiance cabinet dentaire moderne, équipement dernier cri
- Palette or JADOMI (#c9a961) pour cohérence branding
- Texte intégré doit être lisible et bien placé (important pour pubs)
- ${styleDesc}
- Le prompt doit être en anglais (meilleurs résultats avec les IA génératives)
- Maximum 300 mots
- Décrire précisément : composition, éclairage, couleurs, textures, camera angle
- Ne jamais inclure de visages de patients réels, utiliser des modèles génériques

Retourne UNIQUEMENT le prompt optimisé, sans explication.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `Brief dentiste : "${userBrief}"\n\nType media : ${mediaType}\nStyle : ${style}\n\nOptimise ce prompt.`
    }],
    system: systemPrompt
  });

  return response.content[0].text.trim();
}

module.exports = { enhancePrompt };
