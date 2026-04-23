// =============================================
// JADOMI Studio — Router Central
// Orchestre providers, wallet, R2, logging
// =============================================

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');

// --- Providers ---
const OpenAIImageProvider = require('./providers/openai-image');
const OpenAIVideoProvider = require('./providers/openai-video');
const OpenAITTSProvider = require('./providers/openai-tts');
const ElevenLabsProvider = require('./providers/elevenlabs');
const HeyGenProvider = require('./providers/heygen');
const UnsplashProvider = require('./providers/unsplash');
const PexelsProvider = require('./providers/pexels');

// --- Rate limits par type ---
const RATE_LIMITS = {
  image: 20,
  video: 5,
  avatar: 3,
  voice: 30,
};

let providers = {};

function initProviders() {
  providers = {
    'openai-image': new OpenAIImageProvider(process.env.OPENAI_API_KEY),
    'openai-video': new OpenAIVideoProvider(process.env.OPENAI_API_KEY),
    'openai-tts': new OpenAITTSProvider(process.env.OPENAI_API_KEY),
    'elevenlabs': new ElevenLabsProvider(process.env.ELEVENLABS_API_KEY),
    'heygen': new HeyGenProvider(process.env.HEYGEN_API_KEY),
    'unsplash': new UnsplashProvider(process.env.UNSPLASH_ACCESS_KEY),
    'pexels': new PexelsProvider(process.env.PEXELS_API_KEY),
  };
}

function getProvider(name) {
  if (!providers[name]) initProviders();
  return providers[name] || null;
}

function selectProvider(type, quality) {
  switch (type) {
    case 'image':
      return getProvider('openai-image');
    case 'video':
      return getProvider('openai-video');
    case 'voice':
      if (quality === 'premium') return getProvider('elevenlabs');
      return getProvider('openai-tts');
    case 'avatar':
      return getProvider('heygen');
    default:
      throw new Error(`unknown_generation_type: ${type}`);
  }
}

// --- R2 Upload ---
function getR2Client() {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) return null;

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey }
  });
}

async function uploadToR2(result, key) {
  const client = getR2Client();
  if (!client) {
    // Fallback : pas de R2, retourner data URL pour dev
    const base64 = result.buffer.toString('base64');
    return `data:${result.contentType};base64,${base64.substring(0, 100)}...`;
  }

  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'jadomi-rush-fichiers';

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: result.buffer,
    ContentType: result.contentType,
  }));

  const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL || `https://${bucket}.r2.dev`;
  return `${publicUrl}/${key}`;
}

// --- Wallet helpers ---
async function getWallet(supabase, userId) {
  const { data, error } = await supabase
    .from('user_coins_wallet')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    // Creer wallet par defaut avec 100 coins offerts
    const { data: newWallet, error: createErr } = await supabase
      .from('user_coins_wallet')
      .insert({ user_id: userId, balance: 100, total_earned: 100 })
      .select()
      .single();
    if (createErr) throw new Error('wallet_creation_failed');
    return newWallet;
  }
  return data;
}

async function debitWallet(supabase, userId, coins, description) {
  const wallet = await getWallet(supabase, userId);
  const newBalance = wallet.balance - coins;
  if (newBalance < 0) throw new Error('insufficient_coins');

  await supabase
    .from('user_coins_wallet')
    .update({
      balance: newBalance,
      total_spent: (wallet.total_spent || 0) + coins,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId);

  await supabase
    .from('coins_transactions')
    .insert({
      user_id: userId,
      amount: -coins,
      balance_after: newBalance,
      type: 'spend',
      description,
    });

  return newBalance;
}

async function creditWallet(supabase, userId, coins, description) {
  const wallet = await getWallet(supabase, userId);
  const newBalance = wallet.balance + coins;

  await supabase
    .from('user_coins_wallet')
    .update({
      balance: newBalance,
      total_earned: (wallet.total_earned || 0) + coins,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId);

  await supabase
    .from('coins_transactions')
    .insert({
      user_id: userId,
      amount: coins,
      balance_after: newBalance,
      type: 'refund',
      description,
    });

  return newBalance;
}

// --- Rate limiting ---
async function checkRateLimit(supabase, userId, actionType) {
  const limit = RATE_LIMITS[actionType];
  if (!limit) return true;

  const now = new Date();
  const { data } = await supabase
    .from('studio_rate_limits')
    .select('*')
    .eq('user_id', userId)
    .eq('action_type', actionType)
    .single();

  if (!data || new Date(data.reset_at) < now) {
    // Reset ou creer
    await supabase
      .from('studio_rate_limits')
      .upsert({
        user_id: userId,
        action_type: actionType,
        count: 1,
        reset_at: new Date(now.getTime() + 3600000).toISOString(),
      }, { onConflict: 'user_id,action_type' });
    return true;
  }

  if (data.count >= limit) {
    throw new Error(`rate_limit_exceeded: ${actionType} (max ${limit}/heure)`);
  }

  await supabase
    .from('studio_rate_limits')
    .update({ count: data.count + 1 })
    .eq('id', data.id);

  return true;
}

// --- Log generation ---
async function logGeneration(supabase, logData) {
  const { data, error } = await supabase
    .from('ai_generations_log')
    .insert(logData)
    .select()
    .single();
  if (error) console.error('[STUDIO] Log error:', error.message);
  return data;
}

// --- Main generation function ---
async function generateCreative(supabase, userId, societeId, type, quality, options) {
  const provider = selectProvider(type, quality);

  if (!provider || !await provider.isAvailable()) {
    throw new Error('provider_not_available');
  }

  const cost = provider.getCost(options);

  // Verifier wallet
  const wallet = await getWallet(supabase, userId);
  if (wallet.balance < cost.coins) {
    throw new Error('insufficient_coins');
  }

  // Rate limit
  await checkRateLimit(supabase, userId, type);

  // Debiter wallet
  await debitWallet(supabase, userId, cost.coins, `studio:${provider.name}:${type}`);

  const startTime = Date.now();

  try {
    const result = await provider.generate(type, options);

    // Upload R2
    const fileId = crypto.randomUUID();
    const key = `studio/${userId}/${fileId}.${result.ext}`;
    const r2Url = await uploadToR2(result, key);

    // Log
    const log = await logGeneration(supabase, {
      user_id: userId,
      societe_id: societeId,
      provider: provider.name,
      generation_type: type,
      quality_tier: quality,
      cost_usd: cost.usd,
      cost_coins: cost.coins,
      prompt_input: options.user_prompt || options.prompt,
      prompt_optimized: options.prompt,
      generation_time_ms: Date.now() - startTime,
      status: 'success',
      r2_url: r2Url,
      metadata: result.metadata || {},
    });

    return {
      url: r2Url,
      cost_coins: cost.coins,
      generation_id: log ? log.id : null,
      metadata: result.metadata,
    };

  } catch (err) {
    // Rembourser coins en cas d'echec
    await creditWallet(supabase, userId, cost.coins, 'refund_failed_generation');

    await logGeneration(supabase, {
      user_id: userId,
      societe_id: societeId,
      provider: provider.name,
      generation_type: type,
      quality_tier: quality,
      cost_coins: cost.coins,
      prompt_input: options.user_prompt || options.prompt,
      status: 'failure',
      error_message: err.message,
      generation_time_ms: Date.now() - startTime,
    });

    throw err;
  }
}

// --- Provider availability check ---
async function getProvidersStatus() {
  if (!Object.keys(providers).length) initProviders();
  const status = {};
  for (const [name, provider] of Object.entries(providers)) {
    status[name] = await provider.isAvailable();
  }
  return status;
}

module.exports = {
  generateCreative,
  getProvider,
  getWallet,
  debitWallet,
  creditWallet,
  getProvidersStatus,
  initProviders,
  uploadToR2,
};
