module.exports = async (req, res) => {
  // CORS — restrict to same-origin only (no wildcard)
  const allowedOrigins = ['https://jadomi.fr', 'https://www.jadomi.fr'];
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // same-origin requests (no Origin header)
    res.setHeader('Access-Control-Allow-Origin', 'https://jadomi.fr');
  } else {
    return res.status(403).json({ error: 'Origin non autorisée' });
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST uniquement' });

  // Auth check — require valid Supabase JWT
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentification requise' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Clé API non configurée sur le serveur' });

  try {
    const { model, max_tokens, messages, system, tools } = req.body;

    const body = {
      model: model || 'claude-haiku-4-5-20251001',
      max_tokens: max_tokens || 500,
      messages: messages || []
    };
    if (system) body.system = system;
    if (tools) body.tools = tools;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Erreur API', type: data.error?.type });
    }

    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: 'Erreur interne' });
  }
};
