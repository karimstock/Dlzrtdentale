// =============================================
// JADOMI — Emails GPO fournisseurs
// =============================================
const { sendMail } = require('../../api/multiSocietes/mailer');
const { createClient } = require('@supabase/supabase-js');

const PUBLIC_URL = process.env.JADOMI_PUBLIC_URL || 'https://jadomi.fr';

/** Échappe les caractères HTML dangereux */
function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/** Échappe les wildcards ilike (%,_) pour Supabase/PostgreSQL */
function escLike(s) {
  return String(s).replace(/%/g, '\\%').replace(/_/g, '\\_');
}

let _adminClient = null;
function getAdmin() {
  if (!_adminClient) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (!key) return null;
    _adminClient = createClient(process.env.SUPABASE_URL, key, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _adminClient;
}

/**
 * Cherche les prix marché pour les items d'une commande GPO.
 * Retourne un objet { itemName: [{ supplier, price }], ... } et un bloc HTML.
 */
async function lookupMarketPrices(items) {
  const db = getAdmin();
  if (!db) return { priceMap: {}, html: '' };

  const priceMap = {};
  try {
    for (const item of (items || [])) {
      const name = (item.name || '').trim();
      if (!name) continue;

      // Chercher le produit par nom (ilike)
      const { data: products } = await db
        .from('products')
        .select('id, name, name_fr')
        .or(`name.ilike.%${escLike(name)}%,name_fr.ilike.%${escLike(name)}%`)
        .limit(1);

      if (!products || products.length === 0) continue;

      const { data: prices } = await db
        .from('supplier_prices')
        .select('supplier_name, price_catalog, price_negotiated')
        .eq('product_id', products[0].id)
        .order('price_catalog', { ascending: true })
        .limit(5);

      if (prices && prices.length > 0) {
        priceMap[name] = prices.map(p => ({
          supplier: p.supplier_name,
          price: Number(p.price_negotiated || p.price_catalog)
        }));
      }
    }
  } catch (e) {
    console.warn('[GPO Email] lookupMarketPrices error:', e.message);
  }

  // Générer le bloc HTML
  const entries = Object.entries(priceMap);
  if (entries.length === 0) return { priceMap, html: '' };

  let html = `
    <div style="margin:16px 0;padding:16px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;">
      <div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:10px;">
        Prix marché constatés (sources JADOMI)
      </div>`;

  for (const [itemName, suppliers] of entries) {
    const priceList = suppliers
      .map(s => `${escHtml(s.supplier)} ${s.price.toFixed(2)}\u20ac`)
      .join(' | ');
    html += `
      <div style="font-size:12px;color:#78350f;margin-bottom:4px;">
        <strong>${escHtml(itemName)}</strong> : ${priceList}
      </div>`;
  }

  html += `
    </div>`;

  return { priceMap, html };
}

/**
 * Génère le bloc HTML "Tarif cible JADOMI" avec pourcentage vs catalogue
 */
function buildTargetPriceBlock(totalTarget, totalMarket) {
  if (!totalTarget || !totalMarket || totalMarket <= 0) return '';
  const pct = Math.round((1 - totalTarget / totalMarket) * 100);
  if (pct <= 0) return '';
  return `
    <div style="margin:8px 0 16px;padding:12px 16px;background:#f0fdf4;border:1px solid #86efac;border-radius:10px;">
      <div style="font-size:13px;font-weight:700;color:#166534;">
        Tarif cible JADOMI : ${Number(totalTarget).toFixed(2)}\u20ac (-${pct}% vs votre catalogue)
      </div>
    </div>`;
}

function formatItems(items) {
  return items.map(i => `  \u2022 ${i.quantity || 1}\u00d7 ${i.name}`).join('\n');
}

function formatItemsHtml(items) {
  return items.map(i =>
    `<li style="padding:6px 0;border-bottom:1px solid #eee;font-size:14px;">${i.quantity || 1}\u00d7 <strong>${escHtml(i.name)}</strong></li>`
  ).join('');
}

/**
 * Email pour fournisseur INSCRIT (status=active)
 */
async function buildRegisteredEmail({ supplier, attempt, request, delayMinutes }) {
  const offerUrl = `${PUBLIC_URL}/supplier/offer/${attempt.response_token}`;
  const totalTarget = request.total_target_eur ? Number(request.total_target_eur).toFixed(2) : '---';
  const totalMarket = request.total_market_eur ? Number(request.total_market_eur).toFixed(2) : '---';

  // Intelligence prix marché
  const { html: marketPricesHtml } = await lookupMarketPrices(request.items);
  const targetBlock = buildTargetPriceBlock(request.total_target_eur, request.total_market_eur);

  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
  <div style="background:#0f0e0d;padding:24px 28px;">
    <h1 style="color:#10b981;margin:0;font-size:22px;">JADOMI</h1>
  </div>
  <div style="padding:28px;">
    <h2 style="margin:0 0 16px;font-size:18px;color:#1a1a1a;">Nouvelle commande JADOMI</h2>
    <p style="color:#555;font-size:14px;line-height:1.6;">
      Bonjour <strong>${escHtml(supplier.name)}</strong>,
    </p>
    <p style="color:#555;font-size:14px;line-height:1.6;">
      Un cabinet dentaire JADOMI souhaite commander :
    </p>
    <ul style="list-style:none;padding:0;margin:16px 0;background:#f9f9f7;border-radius:8px;padding:12px 16px;">
      ${formatItemsHtml(request.items)}
    </ul>
    <div style="display:flex;gap:20px;margin:16px 0;">
      <div style="flex:1;background:#f0fdf4;border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:12px;color:#666;">Tarif cible JADOMI</div>
        <div style="font-size:22px;font-weight:700;color:#10b981;">${totalTarget}\u20ac</div>
      </div>
      <div style="flex:1;background:#f5f5f5;border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:12px;color:#666;">Prix march\u00e9 moyen</div>
        <div style="font-size:22px;font-weight:700;color:#888;">${totalMarket}\u20ac</div>
      </div>
    </div>
    ${marketPricesHtml}
    ${targetBlock}
    <p style="color:#f59e0b;font-size:14px;font-weight:600;">
      \u23f0 Vous avez ${delayMinutes} minutes pour r\u00e9pondre.
    </p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${offerUrl}" style="display:inline-block;background:#10b981;color:#fff;padding:14px 32px;border-radius:50px;text-decoration:none;font-weight:700;font-size:15px;">
        VOIR &amp; R\u00c9PONDRE \u2192
      </a>
    </div>
    <p style="color:#999;font-size:12px;">
      En cas de non-r\u00e9ponse, la commande sera propos\u00e9e automatiquement au fournisseur suivant dans la file.
    </p>
  </div>
  <div style="background:#f5f5f3;padding:16px 28px;text-align:center;">
    <p style="color:#999;font-size:11px;margin:0;">JADOMI \u2014 jadomi.fr</p>
  </div>
</div>`;

  return {
    to: supplier.email,
    subject: `\ud83d\uded2 Nouvelle commande JADOMI \u2014 Action sous ${delayMinutes} min`,
    html
  };
}

/**
 * Email pour fournisseur NON-INSCRIT (status=extracted/invited)
 */
async function buildUnregisteredEmail({ supplier, attempt, request, delayMinutes }) {
  const offerUrl = `${PUBLIC_URL}/supplier/offer/${attempt.response_token}`;
  const totalTarget = request.total_target_eur ? Number(request.total_target_eur).toFixed(2) : '---';

  // Intelligence prix marché
  const { html: marketPricesHtml } = await lookupMarketPrices(request.items);
  const targetBlock = buildTargetPriceBlock(request.total_target_eur, request.total_market_eur);

  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
  <div style="background:#0f0e0d;padding:24px 28px;">
    <h1 style="color:#10b981;margin:0;font-size:22px;">JADOMI</h1>
  </div>
  <div style="padding:28px;">
    <h2 style="margin:0 0 16px;font-size:18px;color:#1a1a1a;">Un cabinet dentaire souhaite commander chez vous</h2>
    <p style="color:#555;font-size:14px;line-height:1.6;">
      Bonjour,
    </p>
    <p style="color:#555;font-size:14px;line-height:1.6;">
      Nous avons identifié votre entreprise comme potentiel fournisseur pour cette commande d'un cabinet dentaire français :
    </p>
    <ul style="list-style:none;padding:0;margin:16px 0;background:#f9f9f7;border-radius:8px;padding:12px 16px;">
      ${formatItemsHtml(request.items)}
    </ul>
    ${marketPricesHtml}
    ${targetBlock}
    <p style="color:#555;font-size:14px;line-height:1.6;">
      JADOMI est la plateforme qui connecte cabinets dentaires et fournisseurs partout en France.
      Vous pouvez r\u00e9pondre \u00e0 cette commande <strong>sans cr\u00e9er de compte</strong>.
    </p>
    <p style="color:#555;font-size:14px;">
      \ud83d\udcb0 Tarif cible : <strong>${totalTarget}\u20ac</strong> (prix march\u00e9 -15%)<br>
      \u23f0 R\u00e9ponse sous <strong>${delayMinutes} min</strong>.
    </p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${offerUrl}" style="display:inline-block;background:#10b981;color:#fff;padding:14px 32px;border-radius:50px;text-decoration:none;font-weight:700;font-size:15px;">
        VOIR LA COMMANDE &amp; R\u00c9PONDRE \u2192
      </a>
    </div>
  </div>
  <div style="background:#f5f5f3;padding:16px 28px;text-align:center;">
    <p style="color:#999;font-size:11px;margin:0;">JADOMI \u2014 jadomi.fr</p>
  </div>
</div>`;

  return {
    to: supplier.email,
    subject: `[Cabinet dentaire] souhaite commander chez vous via JADOMI`,
    html
  };
}

/**
 * Envoie l'email d'offre au fournisseur (inscrit ou non)
 */
async function sendSupplierOfferEmail({ supplier, attempt, request, delayMinutes }) {
  if (!supplier.email) {
    console.warn(`[GPO Email] Fournisseur ${supplier.name} sans email — skip`);
    return { ok: false, error: 'no_email' };
  }

  const isRegistered = supplier.status === 'active';
  const emailData = isRegistered
    ? await buildRegisteredEmail({ supplier, attempt, request, delayMinutes })
    : await buildUnregisteredEmail({ supplier, attempt, request, delayMinutes });

  let lastErr = null;
  for (let i = 0; i < 3; i++) {
    try {
      const result = await sendMail(emailData);
      if (result.ok) {
        console.log(`[GPO Email] Envoi OK à ${supplier.email} (tentative ${i + 1})`);
        return result;
      }
      lastErr = result.error;
    } catch (e) {
      lastErr = e.message;
    }
    // Backoff exponentiel
    if (i < 2) await new Promise(r => setTimeout(r, (i + 1) * 2000));
  }

  console.error(`[GPO Email] Échec 3 tentatives pour ${supplier.email}: ${lastErr}`);
  return { ok: false, error: lastErr };
}

/**
 * Email de notification au dentiste (contre-proposition)
 */
async function sendCounterProposalNotification({ societeEmail, supplierName, request, counterPrice }) {
  if (!societeEmail) return;
  const totalTarget = request.total_target_eur ? Number(request.total_target_eur).toFixed(2) : '---';
  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:#0f0e0d;padding:24px 28px;">
    <h1 style="color:#10b981;margin:0;font-size:22px;">JADOMI</h1>
  </div>
  <div style="padding:28px;">
    <h2 style="margin:0 0 16px;font-size:18px;">Contre-proposition re\u00e7ue</h2>
    <p style="color:#555;font-size:14px;">
      Le fournisseur <strong>${escHtml(supplierName)}</strong> propose <strong>${Number(counterPrice).toFixed(2)}\u20ac</strong>
      au lieu de ${totalTarget}\u20ac (tarif cible).
    </p>
    <p style="color:#555;font-size:14px;">
      Connectez-vous \u00e0 JADOMI pour accepter ou laisser passer au fournisseur suivant.
    </p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${PUBLIC_URL}" style="display:inline-block;background:#10b981;color:#fff;padding:14px 32px;border-radius:50px;text-decoration:none;font-weight:700;">
        Voir ma commande
      </a>
    </div>
  </div>
</div>`;

  await sendMail({
    to: societeEmail,
    subject: `Contre-proposition de ${supplierName} sur votre commande JADOMI`,
    html
  });
}

module.exports = { sendSupplierOfferEmail, sendCounterProposalNotification };
