# Google Analytics 4 (GA4) Skill for Claude Code

## Overview
This skill enables Claude to work with Google Analytics 4 — configuring tracking, analyzing reports, setting up conversions, creating custom events, and generating actionable insights for JADOMI dashboards.

## Authentication & Setup

### Google Analytics Data API (v1)
```bash
# Install the GA4 client library
npm install @google-analytics/data
# Or for Python
pip install google-analytics-data
```

### Service Account Authentication
```javascript
const { BetaAnalyticsDataClient } = require('@google-analytics/data');

// Using service account JSON key file
const analyticsDataClient = new BetaAnalyticsDataClient({
  keyFilename: '/path/to/service-account-key.json',
});

// Using environment variable
// Set GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
const client = new BetaAnalyticsDataClient();
```

### GA4 Property ID
Always reference the GA4 property ID (numeric, e.g., `properties/123456789`), NOT the old UA tracking ID.

## Core API Operations

### Run a Report
```javascript
async function runReport(propertyId) {
  const [response] = await analyticsDataClient.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'city' }],
    metrics: [{ name: 'activeUsers' }],
  });

  response.rows.forEach(row => {
    console.log(`${row.dimensionValues[0].value}: ${row.metricValues[0].value}`);
  });
}
```

### Run a Realtime Report
```javascript
async function runRealtimeReport(propertyId) {
  const [response] = await analyticsDataClient.runRealtimeReport({
    property: `properties/${propertyId}`,
    dimensions: [{ name: 'country' }],
    metrics: [{ name: 'activeUsers' }],
  });
  return response;
}
```

### Batch Reports (up to 5 reports in one call)
```javascript
async function batchRunReports(propertyId) {
  const [response] = await analyticsDataClient.batchRunReports({
    property: `properties/${propertyId}`,
    requests: [
      {
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'country' }],
        metrics: [{ name: 'activeUsers' }],
      },
      {
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }, { name: 'conversions' }],
      },
    ],
  });
  return response;
}
```

## Key Dimensions & Metrics

### Essential Metrics
| Metric | API Name | Description |
|--------|----------|-------------|
| Active Users | `activeUsers` | Users who engaged with the site |
| Sessions | `sessions` | Total sessions |
| Engaged Sessions | `engagedSessions` | Sessions > 10s or conversion/2+ pageviews |
| Engagement Rate | `engagementRate` | Engaged sessions / total sessions |
| Conversions | `conversions` | Total conversion events |
| Revenue | `totalRevenue` | Total revenue (ecommerce + ads) |
| Average Session Duration | `averageSessionDuration` | Mean session time in seconds |
| Bounce Rate | `bounceRate` | Non-engaged sessions percentage |
| Screen Page Views | `screenPageViews` | Total page/screen views |
| Event Count | `eventCount` | Total events fired |
| New Users | `newUsers` | First-time visitors |

### Essential Dimensions
| Dimension | API Name | Description |
|-----------|----------|-------------|
| Page Path | `pagePath` | URL path of the page |
| Source/Medium | `sessionSourceMedium` | Traffic source and medium |
| Channel Group | `sessionDefaultChannelGroup` | Default channel grouping |
| Device Category | `deviceCategory` | desktop, mobile, tablet |
| Country | `country` | User country |
| City | `city` | User city |
| Landing Page | `landingPage` | First page in session |
| Page Title | `pageTitle` | HTML title of the page |
| Date | `date` | Date in YYYYMMDD format |
| Event Name | `eventName` | Name of the event |

## GA4 Tracking Implementation (gtag.js)

### Base Installation
```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

### Custom Events
```javascript
// Track a button click
gtag('event', 'cta_click', {
  event_category: 'engagement',
  event_label: 'hero_banner_cta',
  value: 1
});

// Track form submission
gtag('event', 'generate_lead', {
  event_category: 'conversion',
  event_label: 'contact_form',
  currency: 'EUR',
  value: 50.00
});

// Track a purchase (ecommerce)
gtag('event', 'purchase', {
  transaction_id: 'T12345',
  currency: 'EUR',
  value: 299.99,
  items: [{
    item_id: 'SKU001',
    item_name: 'Fauteuil Roulant Standard',
    price: 299.99,
    quantity: 1
  }]
});
```

### Recommended GA4 Events for JADOMI (B2B Medical)
```javascript
// Quote request
gtag('event', 'request_quote', {
  event_category: 'conversion',
  item_category: 'fauteuil_roulant',
  value: 0
});

// Product view
gtag('event', 'view_item', {
  currency: 'EUR',
  value: 450.00,
  items: [{ item_id: 'FR-001', item_name: 'Fauteuil Roulant Electrique' }]
});

// Add to cart
gtag('event', 'add_to_cart', {
  currency: 'EUR',
  value: 450.00,
  items: [{ item_id: 'FR-001', item_name: 'Fauteuil Roulant Electrique', quantity: 1 }]
});

// Begin checkout
gtag('event', 'begin_checkout', { currency: 'EUR', value: 450.00 });

// Sign up (pro account)
gtag('event', 'sign_up', { method: 'email' });

// Search
gtag('event', 'search', { search_term: 'fauteuil roulant pliant' });

// File download (catalog PDF)
gtag('event', 'file_download', {
  file_name: 'catalogue-2026.pdf',
  file_extension: 'pdf'
});
```

## Conversion Setup

### Mark an Event as Conversion (Admin API)
```javascript
const { AnalyticsAdminServiceClient } = require('@google-analytics/admin');

const adminClient = new AnalyticsAdminServiceClient();

async function createConversionEvent(propertyId, eventName) {
  const [conversionEvent] = await adminClient.createConversionEvent({
    parent: `properties/${propertyId}`,
    conversionEvent: { eventName },
  });
  return conversionEvent;
}
// Mark 'request_quote' and 'purchase' as conversions
await createConversionEvent('123456789', 'request_quote');
await createConversionEvent('123456789', 'purchase');
```

## Filters & Segments

### Dimension Filter
```javascript
const [response] = await analyticsDataClient.runReport({
  property: `properties/${propertyId}`,
  dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
  dimensions: [{ name: 'pagePath' }],
  metrics: [{ name: 'screenPageViews' }],
  dimensionFilter: {
    filter: {
      fieldName: 'pagePath',
      stringFilter: {
        matchType: 'CONTAINS',
        value: '/produits/',
      },
    },
  },
  orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
  limit: 20,
});
```

### Metric Filter (e.g., pages with > 100 views)
```javascript
metricFilter: {
  filter: {
    fieldName: 'screenPageViews',
    numericFilter: {
      operation: 'GREATER_THAN',
      value: { int64Value: 100 },
    },
  },
}
```

## Dashboard Reporting Patterns

### Traffic Overview Report
```javascript
async function trafficOverview(propertyId, startDate, endDate) {
  const [response] = await analyticsDataClient.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [
      { startDate, endDate, name: 'current' },
      { startDate: '60daysAgo', endDate: '31daysAgo', name: 'previous' },
    ],
    metrics: [
      { name: 'activeUsers' },
      { name: 'sessions' },
      { name: 'engagementRate' },
      { name: 'averageSessionDuration' },
      { name: 'conversions' },
      { name: 'totalRevenue' },
    ],
  });
  return response;
}
```

### Top Pages Report
```javascript
async function topPages(propertyId) {
  const [response] = await analyticsDataClient.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
    metrics: [
      { name: 'screenPageViews' },
      { name: 'activeUsers' },
      { name: 'averageSessionDuration' },
      { name: 'bounceRate' },
    ],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 50,
  });
  return response;
}
```

### Acquisition Channels Report
```javascript
async function acquisitionChannels(propertyId) {
  const [response] = await analyticsDataClient.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: [
      { name: 'sessions' },
      { name: 'activeUsers' },
      { name: 'engagementRate' },
      { name: 'conversions' },
      { name: 'totalRevenue' },
    ],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
  });
  return response;
}
```

## Google Analytics Admin API

### List Accounts and Properties
```javascript
const adminClient = new AnalyticsAdminServiceClient();

async function listAccounts() {
  const [accounts] = await adminClient.listAccounts();
  return accounts;
}

async function listProperties(accountId) {
  const [properties] = await adminClient.listProperties({
    filter: `parent:accounts/${accountId}`,
  });
  return properties;
}
```

### Create a Custom Dimension
```javascript
async function createCustomDimension(propertyId) {
  const [dimension] = await adminClient.createCustomDimension({
    parent: `properties/${propertyId}`,
    customDimension: {
      parameterName: 'product_category',
      displayName: 'Product Category',
      description: 'Category of medical equipment',
      scope: 'EVENT',
    },
  });
  return dimension;
}
```

## Best Practices

1. **Always use date comparison** — show current vs previous period for context
2. **Engagement rate > bounce rate** — GA4 engagement rate is the inverse of bounce rate but more meaningful
3. **Use explorations for funnels** — Admin API supports funnel reports for conversion path analysis
4. **Respect API quotas** — 10,000 requests/day per property; batch when possible
5. **Cache reports** — Store daily snapshots; real-time only for dashboards
6. **UTM parameters** — Always tag marketing URLs: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`
7. **Enhanced measurement** — Enable scroll tracking, outbound clicks, site search, video engagement, file downloads in GA4 admin
8. **Data retention** — Set to 14 months in GA4 admin for maximum historical access
9. **Server-side tracking** — For critical conversions, implement Measurement Protocol as fallback
10. **GDPR compliance** — Implement consent mode v2: `gtag('consent', 'default', { analytics_storage: 'denied' })` then update on user acceptance

## Measurement Protocol (Server-Side)
```javascript
const fetch = require('node-fetch');

async function sendServerEvent(measurementId, apiSecret, clientId, events) {
  const response = await fetch(
    `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`,
    {
      method: 'POST',
      body: JSON.stringify({
        client_id: clientId,
        events: events,
      }),
    }
  );
  return response.status; // 204 = success
}

// Example: server-side purchase tracking
await sendServerEvent('G-XXXXXXXXXX', 'your_api_secret', 'client_123', [
  {
    name: 'purchase',
    params: {
      transaction_id: 'T-99999',
      currency: 'EUR',
      value: 599.00,
      items: [{ item_id: 'FR-PRO', item_name: 'Fauteuil Pro', price: 599.00, quantity: 1 }],
    },
  },
]);
```

## UTM Builder Helper
```javascript
function buildUTMUrl(baseUrl, params) {
  const url = new URL(baseUrl);
  if (params.source) url.searchParams.set('utm_source', params.source);
  if (params.medium) url.searchParams.set('utm_medium', params.medium);
  if (params.campaign) url.searchParams.set('utm_campaign', params.campaign);
  if (params.content) url.searchParams.set('utm_content', params.content);
  if (params.term) url.searchParams.set('utm_term', params.term);
  return url.toString();
}

// Example
buildUTMUrl('https://jadomi.fr/produits', {
  source: 'linkedin',
  medium: 'social',
  campaign: 'promo-ete-2026',
  content: 'carousel-fauteuils'
});
```
