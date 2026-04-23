// =============================================
// JADOMI Studio — Prompt Enhancer
// Claude optimise les briefs simples en prompts IA techniques
// =============================================

async function enhancePrompt(anthropic, userBrief, mediaType, style) {
  if (!anthropic) {
    throw new Error('anthropic_client_required');
  }

  const styleDescriptions = {
    pro: 'Style professionnel scientifique, serieux et credible',
    moderne: 'Style moderne epure, design minimaliste contemporain',
    chaleureux: 'Ambiance chaleureuse humaine, proximite patient',
    scientifique: 'Style academique medical, rigueur scientifique',
  };

  const styleDesc = styleDescriptions[style] || styleDescriptions.pro;
  const mediaDesc = mediaType === 'video'
    ? 'une video publicitaire Sora 2 (mouvement camera, eclairage cinematique)'
    : 'une image publicitaire DALL-E 3 (composition, eclairage, texte integre)';

  const systemPrompt = `Tu es expert en creation publicitaire dentaire B2B.
Tu recois un brief simple de dentiste/formateur et le transformes en prompt technique optimise pour ${mediaDesc}.

Regles strictes :
- Respecte le Code de deontologie dentaire (pas de promesses medicales trompeuses)
- Style professionnel adapte a audience professionnelle de sante
- Ambiance cabinet dentaire moderne, equipement dernier cri
- Palette or JADOMI (#c9a961) pour coherence branding
- Texte integre doit etre lisible et bien place (important pour pubs)
- ${styleDesc}
- Le prompt doit etre en anglais (meilleurs resultats avec les IA generatives)
- Maximum 300 mots
- Decrire precisement : composition, eclairage, couleurs, textures, camera angle
- Ne jamais inclure de visages de patients reels, utiliser des modeles generiques

Retourne UNIQUEMENT le prompt optimise, sans explication.`;

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
