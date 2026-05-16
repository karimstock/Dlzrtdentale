// =============================================
// JADOMI Studio V2 — API Wallet Tokens
// Solde, recharge, historique transactions
// =============================================

const express = require('express');
const router = express.Router();

// Packs de tokens disponibles
const PACKS = [
  { id: 'pack_100',  tokens: 100,  prix_eur: 9,   label: '100 tokens',  bonus: 0 },
  { id: 'pack_500',  tokens: 500,  prix_eur: 29,  label: '500 tokens',  bonus: 0 },
  { id: 'pack_1000', tokens: 1000, prix_eur: 49,  label: '1 000 tokens', bonus: 100 },
  { id: 'pack_2500', tokens: 2500, prix_eur: 99,  label: '2 500 tokens', bonus: 300 },
  { id: 'pack_5000', tokens: 5000, prix_eur: 179, label: '5 000 tokens', bonus: 750 },
];

// Coûts par action (référence serveur — synchro avec le frontend)
const ACTION_COSTS = {
  'patient':        3,
  'avant-apres':    5,
  'reseaux-cab':    3,
  'presentation':  10,
  'produit':       10,
  'catalogue':     15,
  'fiche-produit':  8,
  'congres':       20,
  'formation':     15,
  'video':         20,
  'landing':       15,
  'flyer':          5,
  'reseaux':        3,
  'agent':        100,
  // Granulaire (utilisé par le router IA)
  'image_dalle':   10,
  'image_gemini':   5,
  'video_remotion': 15,
  'video_vidu':    30,
  'video_kling':   40,
  'detourage':      5,
  'voix_standard':  3,
  'voix_premium':   8,
  'analyse_site':  10,
};

// ── GET / — Solde actuel ──
router.get('/', async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('user_coins_wallet')
      .select('balance, total_earned, total_spent')
      .eq('user_id', req.user.id)
      .single();

    if (error && error.code === 'PGRST116') {
      // Pas de wallet — en créer un avec 50 tokens offerts
      const { data: newWallet, error: createErr } = await req.supabase
        .from('user_coins_wallet')
        .insert({ user_id: req.user.id, balance: 50, total_earned: 50, total_spent: 0 })
        .select('balance, total_earned, total_spent')
        .single();

      if (createErr) return res.json({ ok: true, balance: 50, total_earned: 50, total_spent: 0, new_user: true });
      return res.json({ ok: true, ...newWallet, new_user: true });
    }

    if (error) throw error;
    res.json({ ok: true, ...data });
  } catch (e) {
    console.error('[WALLET] error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /packs — Packs disponibles ──
router.get('/packs', (req, res) => {
  res.json({ ok: true, packs: PACKS });
});

// ── GET /costs — Coûts par action ──
router.get('/costs', (req, res) => {
  res.json({ ok: true, costs: ACTION_COSTS });
});

// ── GET /historique — Dernières transactions ──
router.get('/historique', async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('coins_transactions')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json({ ok: true, transactions: data || [] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /check — Vérifier si l'utilisateur a assez de tokens ──
router.post('/check', async (req, res) => {
  try {
    const { action } = req.body;
    const cost = ACTION_COSTS[action];
    if (!cost && cost !== 0) {
      return res.status(400).json({ ok: false, error: 'Action inconnue : ' + action });
    }

    const { data } = await req.supabase
      .from('user_coins_wallet')
      .select('balance')
      .eq('user_id', req.user.id)
      .single();

    const balance = data ? data.balance : 0;
    const canAfford = balance >= cost;

    res.json({
      ok: true,
      can_afford: canAfford,
      balance,
      cost,
      action,
      missing: canAfford ? 0 : cost - balance,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
module.exports.ACTION_COSTS = ACTION_COSTS;
module.exports.PACKS = PACKS;
