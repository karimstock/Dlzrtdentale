# AI Marketing Agent Skill for Claude Code

## Overview
This skill enables Claude to act as an autonomous marketing campaign generator for JADOMI. Covers campaign planning, audience segmentation, multi-channel orchestration, A/B testing, email marketing, ad copy generation, landing page optimization, and performance analysis.

## Campaign Architecture

### Campaign Types
```javascript
const CAMPAIGN_TYPES = {
  PRODUCT_LAUNCH: {
    name: 'Lancement produit',
    duration: '4-6 semaines',
    channels: ['email', 'social', 'ads', 'landing_page', 'seo'],
    phases: ['teasing', 'lancement', 'acceleration', 'maintien'],
  },
  SEASONAL_PROMO: {
    name: 'Promotion saisonniere',
    duration: '1-2 semaines',
    channels: ['email', 'social', 'ads', 'banner'],
    phases: ['annonce', 'promotion', 'derniere_chance'],
  },
  LEAD_GENERATION: {
    name: 'Generation de leads',
    duration: 'continue',
    channels: ['ads', 'landing_page', 'email_nurturing', 'seo'],
    phases: ['acquisition', 'nurturing', 'conversion'],
  },
  BRAND_AWARENESS: {
    name: 'Notoriete de marque',
    duration: '3-6 mois',
    channels: ['social', 'content', 'pr', 'video'],
    phases: ['exposition', 'engagement', 'fidelisation'],
  },
  RETENTION: {
    name: 'Fidelisation client',
    duration: 'continue',
    channels: ['email', 'sms', 'social', 'loyalty'],
    phases: ['reengagement', 'upsell', 'referral'],
  },
};
```

### Campaign Generator
```javascript
function generateCampaign(config) {
  const campaign = {
    id: `CAM-${Date.now()}`,
    name: config.name,
    type: config.type,
    objective: config.objective,
    budget: config.budget,
    startDate: config.startDate,
    endDate: config.endDate,
    targetAudience: config.audience,
    channels: [],
    timeline: [],
    kpis: [],
    creatives: [],
  };

  // Auto-generate channel strategy
  const template = CAMPAIGN_TYPES[config.type];
  for (const channel of template.channels) {
    campaign.channels.push(generateChannelStrategy(channel, config));
  }

  // Auto-generate timeline
  campaign.timeline = generateTimeline(template.phases, config.startDate, config.endDate);

  // Auto-generate KPIs
  campaign.kpis = generateKPIs(config.type, config.objective);

  return campaign;
}
```

## Audience Segmentation

### JADOMI Audience Segments
```javascript
const AUDIENCE_SEGMENTS = {
  // B2C Segments
  PARTICULIER_SENIOR: {
    name: 'Seniors autonomes',
    demographics: { age: '65+', location: 'France', income: 'moyen-eleve' },
    pain_points: ['Perte de mobilite', 'Maintien a domicile', 'Confort quotidien'],
    channels: ['facebook', 'email', 'google_ads'],
    messaging: 'Confort, securite, independance',
    keywords: ['fauteuil roulant confortable', 'aide mobilite senior', 'maintien domicile'],
  },
  PARTICULIER_AIDANT: {
    name: 'Aidants familiaux',
    demographics: { age: '40-65', location: 'France' },
    pain_points: ['Trouver le bon equipement', 'Budget contraint', 'Prise en charge CPAM'],
    channels: ['google_ads', 'facebook', 'email'],
    messaging: 'Simplicite, accompagnement, remboursement',
    keywords: ['fauteuil roulant rembourse', 'materiel medical domicile', 'aide handicap'],
  },
  
  // B2B Segments
  PRO_PHARMACIE: {
    name: 'Pharmacies et orthopedies',
    demographics: { type: 'B2B', sector: 'pharmacie' },
    pain_points: ['Marge sur produits', 'Stock minimum', 'Livraison rapide'],
    channels: ['linkedin', 'email', 'salon_pro'],
    messaging: 'Partenariat, marge, service rapide',
    keywords: ['fournisseur fauteuil roulant', 'grossiste materiel medical'],
  },
  PRO_EHPAD: {
    name: 'EHPAD et etablissements',
    demographics: { type: 'B2B', sector: 'medico-social' },
    pain_points: ['Volume de commande', 'Budget collectivite', 'Maintenance'],
    channels: ['linkedin', 'email', 'appel_direct'],
    messaging: 'Volume, fiabilite, SAV',
    keywords: ['fauteuil roulant ehpad', 'equipement mobilite collectivite'],
  },
  PRO_HOPITAL: {
    name: 'Hopitaux et cliniques',
    demographics: { type: 'B2B', sector: 'hospitalier' },
    pain_points: ['Marches publics', 'Normes strictes', 'Budget annuel'],
    channels: ['linkedin', 'email', 'appel_offres'],
    messaging: 'Conformite, certifications, volume',
  },
};
```

## Email Marketing Campaigns

### Email Sequence Builder
```javascript
function buildEmailSequence(sequenceType, audience) {
  const sequences = {
    WELCOME: [
      { day: 0, subject: 'Bienvenue chez JADOMI !', type: 'welcome', cta: 'Decouvrir le catalogue' },
      { day: 3, subject: 'Comment choisir votre {product_category} ?', type: 'educational', cta: 'Lire le guide' },
      { day: 7, subject: '10% sur votre premiere commande', type: 'promo', cta: 'Profiter de l\'offre' },
      { day: 14, subject: 'Des questions ? Nos experts vous repondent', type: 'engagement', cta: 'Contacter un expert' },
    ],
    ABANDONED_CART: [
      { delay: '1h', subject: 'Vous avez oublie quelque chose !', type: 'reminder', cta: 'Reprendre ma commande' },
      { delay: '24h', subject: 'Votre panier vous attend', type: 'reminder_2', cta: 'Finaliser ma commande' },
      { delay: '72h', subject: 'Derniere chance : -5% sur votre panier', type: 'incentive', cta: 'Profiter de -5%' },
    ],
    POST_PURCHASE: [
      { day: 1, subject: 'Merci pour votre commande !', type: 'confirmation', cta: 'Suivre ma livraison' },
      { day: 7, subject: 'Tout se passe bien avec votre {product} ?', type: 'satisfaction', cta: 'Donner mon avis' },
      { day: 30, subject: 'Accessoires recommandes pour votre {product}', type: 'cross_sell', cta: 'Voir les accessoires' },
      { day: 90, subject: 'Entretien de votre {product} : nos conseils', type: 'retention', cta: 'Lire les conseils' },
    ],
    REENGAGEMENT: [
      { day: 0, subject: 'Vous nous manquez !', type: 'winback', cta: 'Redecouvrir JADOMI' },
      { day: 7, subject: 'Les nouveautes que vous avez manquees', type: 'update', cta: 'Voir les nouveautes' },
      { day: 14, subject: 'Offre exclusive pour votre retour : -15%', type: 'incentive', cta: 'En profiter' },
    ],
    B2B_NURTURING: [
      { day: 0, subject: 'JADOMI : votre partenaire materiel medical', type: 'intro', cta: 'Decouvrir l\'offre pro' },
      { day: 5, subject: 'Etude de cas : {client_name} x JADOMI', type: 'case_study', cta: 'Lire l\'etude' },
      { day: 12, subject: 'Nos conditions grossiste', type: 'commercial', cta: 'Demander un devis' },
      { day: 20, subject: 'Invitation : webinaire nouveautes 2026', type: 'event', cta: 'S\'inscrire' },
      { day: 30, subject: 'Parlons de votre projet', type: 'meeting', cta: 'Reserver un appel' },
    ],
  };
  
  return sequences[sequenceType] || sequences.WELCOME;
}
```

### Email Template
```javascript
function generateEmailHTML(email, data) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${email.subject}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;">
    <!-- Header -->
    <tr>
      <td style="padding:20px;text-align:center;background:#0066CC;">
        <img src="${data.logoUrl}" alt="JADOMI" width="150" style="display:block;margin:0 auto;">
      </td>
    </tr>
    <!-- Body -->
    <tr>
      <td style="padding:30px 20px;">
        <h1 style="color:#333;font-size:24px;margin:0 0 15px;">${email.headline}</h1>
        <p style="color:#666;font-size:16px;line-height:1.6;">${email.body}</p>
        ${email.image ? `<img src="${email.image}" alt="" style="width:100%;border-radius:8px;margin:20px 0;">` : ''}
        <a href="${email.ctaUrl}" style="display:inline-block;background:#0066CC;color:#fff;padding:14px 30px;text-decoration:none;border-radius:6px;font-weight:bold;margin:20px 0;">${email.ctaText}</a>
      </td>
    </tr>
    <!-- Footer -->
    <tr>
      <td style="padding:20px;background:#f0f0f0;text-align:center;font-size:12px;color:#999;">
        <p>JADOMI - Materiel Medical<br>Roubaix, France</p>
        <p><a href="${data.unsubscribeUrl}" style="color:#999;">Se desinscrire</a></p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
```

## Ad Copy Generation

### Google Ads (Responsive Search Ads)
```javascript
function generateGoogleAds(product, audience) {
  return {
    headlines: [
      // Max 30 chars each, need 3-15
      `${product.name}`,
      `${product.category} Pro`,
      `Livraison Gratuite`,
      `A Partir de ${product.price} EUR`,
      `Qualite Professionnelle`,
      `-${product.discountPercent}% Ce Mois-ci`,
      `Prise en Charge CPAM`,
      `Conseil Expert Gratuit`,
      `Stock Disponible`,
      `Garantie ${product.warranty} Ans`,
      `SAV Reactif`,
      `Marque Certifiee`,
    ],
    descriptions: [
      // Max 90 chars each, need 2-4
      `Decouvrez notre ${product.name}. ${product.keyFeature}. Livraison rapide partout en France.`,
      `${product.category} de qualite professionnelle. Conseil personnalise. Commandez en ligne.`,
      `JADOMI, expert materiel medical depuis 20XX. ${product.benefitStatement}. Devis gratuit.`,
      `${product.name} : ${product.shortDescription}. Paiement securise. Retours gratuits 30j.`,
    ],
    sitelinks: [
      { text: 'Tous les Produits', url: '/produits' },
      { text: 'Promotions', url: '/promotions' },
      { text: 'Guide d\'Achat', url: '/guides' },
      { text: 'Contactez-Nous', url: '/contact' },
    ],
    keywords: product.keywords.map(kw => ({
      keyword: kw,
      matchType: 'phrase', // exact, phrase, broad
      bid: product.suggestedBid || 1.50,
    })),
  };
}
```

### Facebook/Instagram Ads
```javascript
function generateFacebookAd(product, audience, objective) {
  return {
    primary_text: `${audience.pain_points[0]} ?\n\n` +
      `Le ${product.name} est la solution.\n\n` +
      `✅ ${product.feature1}\n` +
      `✅ ${product.feature2}\n` +
      `✅ ${product.feature3}\n\n` +
      `🚚 Livraison gratuite\n` +
      `💬 Conseil expert par telephone\n\n` +
      `Commandez maintenant sur jadomi.fr`,
    headline: `${product.name} - Des ${product.price} EUR`, // Max 40 chars
    description: product.shortDescription, // Max 30 chars
    cta: objective === 'CONVERSIONS' ? 'SHOP_NOW' : 'LEARN_MORE',
    targeting: {
      age_min: audience.demographics.age?.split('-')[0] || 25,
      age_max: audience.demographics.age?.split('-')[1] || 65,
      geo_locations: { countries: ['FR'] },
      interests: audience.keywords,
    },
    placements: ['facebook_feed', 'instagram_feed', 'instagram_stories', 'facebook_stories'],
  };
}
```

## Landing Page Builder

### Landing Page Structure
```javascript
function generateLandingPageSpec(campaign) {
  return {
    url: `/lp/${campaign.slug}`,
    sections: [
      {
        type: 'hero',
        headline: campaign.headline,
        subheadline: campaign.subheadline,
        cta: { text: campaign.ctaText, url: campaign.ctaUrl },
        image: campaign.heroImage,
        trustBadges: ['Livraison gratuite', 'Garantie 2 ans', 'SAV expert'],
      },
      {
        type: 'problem_solution',
        problem: campaign.targetAudience.pain_points[0],
        solution: campaign.product.benefitStatement,
      },
      {
        type: 'features',
        title: 'Pourquoi choisir JADOMI ?',
        features: campaign.product.features.map(f => ({
          icon: f.icon,
          title: f.title,
          description: f.description,
        })),
      },
      {
        type: 'social_proof',
        testimonials: campaign.testimonials,
        stats: [
          { value: '5000+', label: 'Clients satisfaits' },
          { value: '98%', label: 'Taux de satisfaction' },
          { value: '24h', label: 'Livraison express' },
        ],
      },
      {
        type: 'pricing',
        plans: campaign.product.pricing,
        highlight: campaign.promoCode,
      },
      {
        type: 'faq',
        questions: campaign.faqs,
      },
      {
        type: 'final_cta',
        headline: 'Pret a ameliorer votre quotidien ?',
        cta: { text: campaign.ctaText, url: campaign.ctaUrl },
        urgency: campaign.promoEndDate ? `Offre valable jusqu'au ${campaign.promoEndDate}` : null,
      },
    ],
    tracking: {
      ga4Events: ['page_view', 'cta_click', 'form_submit', 'scroll_depth'],
      fbPixel: true,
      utmParams: campaign.utmParams,
    },
  };
}
```

## A/B Testing Framework

```javascript
const AB_TEST_TEMPLATES = {
  EMAIL_SUBJECT: {
    name: 'Test objet email',
    variants: 2,
    metric: 'open_rate',
    minSampleSize: 1000,
    duration: '24h',
    generate: (baseSubject) => [
      { id: 'A', subject: baseSubject },
      { id: 'B', subject: `🔥 ${baseSubject}` },
    ],
  },
  CTA_BUTTON: {
    name: 'Test bouton CTA',
    variants: 2,
    metric: 'click_rate',
    minSampleSize: 500,
    duration: '7 jours',
    generate: (baseCta) => [
      { id: 'A', text: baseCta, color: '#0066CC' },
      { id: 'B', text: baseCta.replace('Decouvrir', 'Essayer'), color: '#FF6600' },
    ],
  },
  LANDING_PAGE: {
    name: 'Test landing page',
    variants: 2,
    metric: 'conversion_rate',
    minSampleSize: 200,
    duration: '14 jours',
    generate: (pageConfig) => [
      { id: 'A', layout: 'hero_left', headline: pageConfig.headline },
      { id: 'B', layout: 'hero_center', headline: pageConfig.altHeadline },
    ],
  },
};

function calculateStatisticalSignificance(variantA, variantB) {
  const pA = variantA.conversions / variantA.visitors;
  const pB = variantB.conversions / variantB.visitors;
  const pooled = (variantA.conversions + variantB.conversions) / (variantA.visitors + variantB.visitors);
  const se = Math.sqrt(pooled * (1 - pooled) * (1/variantA.visitors + 1/variantB.visitors));
  const z = Math.abs(pA - pB) / se;
  
  // z > 1.96 = 95% confidence
  return {
    significant: z > 1.96,
    confidence: z > 2.576 ? 99 : z > 1.96 ? 95 : z > 1.645 ? 90 : 0,
    winner: pA > pB ? 'A' : 'B',
    lift: ((Math.max(pA, pB) / Math.min(pA, pB)) - 1) * 100,
    zScore: z,
  };
}
```

## Campaign Performance Dashboard

### KPI Tracking
```javascript
function generateKPIs(campaignType, objective) {
  const kpis = {
    PRODUCT_LAUNCH: [
      { metric: 'impressions', target: 100000, unit: 'vues' },
      { metric: 'website_visits', target: 5000, unit: 'visites' },
      { metric: 'conversions', target: 100, unit: 'ventes' },
      { metric: 'revenue', target: 50000, unit: 'EUR' },
      { metric: 'roas', target: 4.0, unit: 'x' },
    ],
    LEAD_GENERATION: [
      { metric: 'leads', target: 500, unit: 'leads' },
      { metric: 'cpl', target: 15, unit: 'EUR/lead' },
      { metric: 'lead_to_customer', target: 10, unit: '%' },
      { metric: 'email_subscribers', target: 1000, unit: 'inscrits' },
    ],
    BRAND_AWARENESS: [
      { metric: 'reach', target: 500000, unit: 'personnes' },
      { metric: 'engagement_rate', target: 3.5, unit: '%' },
      { metric: 'follower_growth', target: 20, unit: '%/mois' },
      { metric: 'brand_mentions', target: 100, unit: 'mentions' },
    ],
    RETENTION: [
      { metric: 'repeat_purchase_rate', target: 25, unit: '%' },
      { metric: 'customer_lifetime_value', target: 800, unit: 'EUR' },
      { metric: 'nps', target: 60, unit: 'score' },
      { metric: 'churn_rate', target: 5, unit: '%' },
    ],
  };
  return kpis[campaignType] || kpis.PRODUCT_LAUNCH;
}
```

### ROI Calculator
```javascript
function calculateCampaignROI(campaign) {
  const totalSpend = campaign.channels.reduce((s, c) => s + c.spend, 0);
  const totalRevenue = campaign.revenue;
  const roi = ((totalRevenue - totalSpend) / totalSpend) * 100;
  const roas = totalRevenue / totalSpend;
  const cpa = totalSpend / campaign.conversions;
  const cpc = totalSpend / campaign.clicks;
  const ctr = (campaign.clicks / campaign.impressions) * 100;
  const conversionRate = (campaign.conversions / campaign.clicks) * 100;

  return {
    roi: `${roi.toFixed(1)}%`,
    roas: `${roas.toFixed(2)}x`,
    cpa: `${cpa.toFixed(2)} EUR`,
    cpc: `${cpc.toFixed(2)} EUR`,
    ctr: `${ctr.toFixed(2)}%`,
    conversionRate: `${conversionRate.toFixed(2)}%`,
    totalSpend: `${totalSpend.toFixed(2)} EUR`,
    totalRevenue: `${totalRevenue.toFixed(2)} EUR`,
    profit: `${(totalRevenue - totalSpend).toFixed(2)} EUR`,
  };
}
```

## Automation Workflows

### Lead Scoring
```javascript
function scoreLead(lead) {
  let score = 0;
  
  // Demographic scoring
  if (lead.type === 'professionnel') score += 20;
  if (lead.sector === 'hospitalier') score += 15;
  if (lead.city && ['Paris', 'Lyon', 'Marseille', 'Lille', 'Roubaix'].includes(lead.city)) score += 5;
  
  // Behavioral scoring
  if (lead.pagesViewed > 5) score += 10;
  if (lead.visitedPricingPage) score += 15;
  if (lead.downloadedCatalog) score += 10;
  if (lead.requestedQuote) score += 25;
  if (lead.emailOpens > 3) score += 5;
  if (lead.emailClicks > 1) score += 10;
  
  // Recency
  const daysSinceLastVisit = (Date.now() - new Date(lead.lastVisit)) / 86400000;
  if (daysSinceLastVisit < 1) score += 15;
  else if (daysSinceLastVisit < 7) score += 10;
  else if (daysSinceLastVisit < 30) score += 5;
  
  return {
    score,
    tier: score >= 70 ? 'HOT' : score >= 40 ? 'WARM' : 'COLD',
    action: score >= 70 ? 'Appel commercial immediat' : score >= 40 ? 'Email nurturing' : 'Newsletter',
  };
}
```

### Campaign Automation Engine
```javascript
async function runCampaignAutomation(trigger, context) {
  const automations = {
    NEW_LEAD: async (ctx) => {
      await sendEmail(ctx.lead.email, 'WELCOME', 0);
      await addToSegment(ctx.lead, 'new_leads');
      await notifySlack(`Nouveau lead : ${ctx.lead.name} (${ctx.lead.email})`);
    },
    CART_ABANDONED: async (ctx) => {
      await scheduleEmail(ctx.user.email, 'ABANDONED_CART', '1h');
      await scheduleEmail(ctx.user.email, 'ABANDONED_CART', '24h');
      if (ctx.cartValue > 200) {
        await scheduleSMS(ctx.user.phone, 'Votre panier JADOMI vous attend ! -5% avec le code RETOUR5');
      }
    },
    PURCHASE_COMPLETE: async (ctx) => {
      await sendEmail(ctx.customer.email, 'POST_PURCHASE', 0);
      await updateCRM(ctx.customer, { lastPurchase: new Date(), totalSpent: ctx.orderTotal });
      await triggerReviewRequest(ctx.customer, ctx.order, 7); // 7 days later
    },
    LEAD_SCORE_HOT: async (ctx) => {
      await notifySlack(`Lead HOT : ${ctx.lead.name} - Score ${ctx.lead.score}`);
      await assignToSalesRep(ctx.lead);
      await sendEmail(ctx.lead.email, 'PERSONAL_OUTREACH');
    },
  };

  if (automations[trigger]) {
    await automations[trigger](context);
  }
}
```

## Content Marketing Calendar

### Monthly Theme Generator
```javascript
function generateMonthlyThemes(year) {
  return {
    1: { theme: 'Nouveaux departs', focus: 'New year resolutions, equipment renewal' },
    2: { theme: 'Journee handicap', focus: 'Accessibility awareness, community stories' },
    3: { theme: 'Printemps mobilite', focus: 'Outdoor mobility, spring cleaning equipment' },
    4: { theme: 'Innovation sante', focus: 'New products, tech in medical equipment' },
    5: { theme: 'Bien-etre au quotidien', focus: 'Daily comfort, ergonomic solutions' },
    6: { theme: 'Ete actif', focus: 'Travel-friendly equipment, beach wheelchairs' },
    7: { theme: 'Soldes ete', focus: 'Summer sales, clearance, promotions' },
    8: { theme: 'Preparation rentree', focus: 'Back-to-school accessibility, student mobility' },
    9: { theme: 'Rentree des pros', focus: 'B2B campaigns, trade shows, partnerships' },
    10: { theme: 'Octobre rose', focus: 'Health awareness, community engagement' },
    11: { theme: 'Black Friday medical', focus: 'Biggest promotions of the year' },
    12: { theme: 'Cadeaux et confort', focus: 'Gift guides, year-end comfort solutions' },
  };
}
```

## Best Practices

1. **Data-driven decisions** — never launch a campaign without clear KPIs and measurement
2. **Audience first** — segment before messaging; one message does not fit all
3. **Multi-touch attribution** — track the full customer journey, not just last click
4. **GDPR compliance** — explicit opt-in for all marketing communications
5. **Test before scale** — small budget test, analyze, then scale what works
6. **Consistent brand voice** — professional yet accessible for medical equipment
7. **Urgency without manipulation** — real deadlines only, no fake countdowns
8. **Mobile-first** — 70%+ of traffic is mobile; design for small screens first
9. **Follow-up speed** — contact leads within 5 minutes for 10x higher conversion
10. **Omnichannel coherence** — same message, adapted tone, across all channels
11. **Budget allocation rule** — 70% proven channels, 20% testing, 10% experimental
12. **Noreply for automated emails** — use noreply@jadomi.fr for automations, contact@jadomi.fr for public
