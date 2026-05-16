# Airtable Skill for Claude Code

## Overview
This skill enables Claude to interact with Airtable as a lightweight CMS and data management platform. Covers the Airtable Web API for CRUD operations, webhooks, automations, and integration patterns for JADOMI dashboards.

## Authentication

### API Key / Personal Access Token
```bash
# Set environment variable
export AIRTABLE_API_KEY="pat_xxxxxxxxxxxxx"
# Or use in .env
AIRTABLE_API_KEY=pat_xxxxxxxxxxxxx
AIRTABLE_BASE_ID=appXXXXXXXXXXXXXX
```

### Base URL
All API requests go to: `https://api.airtable.com/v0/{baseId}/{tableIdOrName}`

### Headers
```javascript
const headers = {
  'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
  'Content-Type': 'application/json',
};
```

## JavaScript SDK Setup
```bash
npm install airtable
```

```javascript
const Airtable = require('airtable');

Airtable.configure({
  apiKey: process.env.AIRTABLE_API_KEY,
});

const base = Airtable.base(process.env.AIRTABLE_BASE_ID);
```

## Core CRUD Operations

### List Records (with pagination)
```javascript
async function listRecords(tableName, options = {}) {
  const records = [];
  await base(tableName)
    .select({
      maxRecords: options.maxRecords || 100,
      view: options.view || 'Grid view',
      filterByFormula: options.filter || '',
      sort: options.sort || [{ field: 'Created', direction: 'desc' }],
      fields: options.fields || [],
    })
    .eachPage((pageRecords, fetchNextPage) => {
      records.push(...pageRecords.map(r => ({ id: r.id, ...r.fields })));
      fetchNextPage();
    });
  return records;
}

// Example: get all active products
const products = await listRecords('Produits', {
  filter: "AND({Status} = 'Actif', {Prix} > 0)",
  fields: ['Nom', 'Prix', 'Categorie', 'Image'],
  sort: [{ field: 'Prix', direction: 'asc' }],
});
```

### Get a Single Record
```javascript
async function getRecord(tableName, recordId) {
  const record = await base(tableName).find(recordId);
  return { id: record.id, ...record.fields };
}
```

### Create Records (max 10 per request)
```javascript
async function createRecords(tableName, records) {
  const created = await base(tableName).create(
    records.map(r => ({ fields: r })),
    { typecast: true }
  );
  return created.map(r => ({ id: r.id, ...r.fields }));
}

// Example: add a new product
await createRecords('Produits', [
  {
    'Nom': 'Fauteuil Roulant Electrique Pro',
    'Prix': 1299.99,
    'Categorie': 'Fauteuils Electriques',
    'Status': 'Actif',
    'Description': 'Fauteuil roulant electrique haute performance',
    'Stock': 15,
  },
]);
```

### Update Records (max 10 per request)
```javascript
async function updateRecords(tableName, records) {
  const updated = await base(tableName).update(
    records.map(r => ({ id: r.id, fields: r.fields })),
    { typecast: true }
  );
  return updated.map(r => ({ id: r.id, ...r.fields }));
}

// Example: update stock
await updateRecords('Produits', [
  { id: 'recXXXXXX', fields: { 'Stock': 12 } },
]);
```

### Delete Records (max 10 per request)
```javascript
async function deleteRecords(tableName, recordIds) {
  const deleted = await base(tableName).destroy(recordIds);
  return deleted.map(r => r.id);
}
```

### Upsert Records (create or update)
```javascript
async function upsertRecords(tableName, records, fieldsToMergeOn) {
  const response = await fetch(
    `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        performUpsert: { fieldsToMergeOn },
        records: records.map(r => ({ fields: r })),
        typecast: true,
      }),
    }
  );
  return response.json();
}

// Example: upsert products by SKU
await upsertRecords('Produits', [
  { 'SKU': 'FR-E-001', 'Nom': 'Fauteuil Electrique', 'Prix': 1299.99, 'Stock': 10 },
  { 'SKU': 'FR-M-002', 'Nom': 'Fauteuil Manuel', 'Prix': 499.99, 'Stock': 25 },
], ['SKU']);
```

## Filter Formulas

### Common Filters
```javascript
// Exact match
"({Categorie} = 'Fauteuils')"

// Contains text
"FIND('electrique', LOWER({Nom})) > 0"

// Numeric comparison
"{Prix} >= 500"

// Date filters
"IS_AFTER({Date Creation}, '2026-01-01')"
"DATETIME_DIFF(NOW(), {Date Creation}, 'days') <= 30"

// Multiple conditions
"AND({Status} = 'Actif', {Prix} > 100, {Stock} > 0)"

// OR condition
"OR({Categorie} = 'Fauteuils', {Categorie} = 'Accessoires')"

// Empty / not empty
"NOT({Image} = '')"
"{Image} = BLANK()"

// Linked records
"FIND('recXXXXXX', ARRAYJOIN(RECORD_ID()))"
```

### Formula Functions Reference
| Function | Example | Description |
|----------|---------|-------------|
| `FIND()` | `FIND('text', {Field})` | Find substring position |
| `LOWER()` | `LOWER({Nom})` | Lowercase |
| `UPPER()` | `UPPER({Nom})` | Uppercase |
| `LEN()` | `LEN({Description})` | String length |
| `TRIM()` | `TRIM({Nom})` | Remove whitespace |
| `CONCATENATE()` | `CONCATENATE({Prenom}, ' ', {Nom})` | Join strings |
| `VALUE()` | `VALUE({Prix Text})` | Convert to number |
| `ROUND()` | `ROUND({Prix} * 1.20, 2)` | Round number |
| `IF()` | `IF({Stock} > 0, 'Dispo', 'Rupture')` | Conditional |
| `SWITCH()` | `SWITCH({Status}, 'A', 'Actif', 'I', 'Inactif')` | Multiple conditions |
| `CREATED_TIME()` | `CREATED_TIME()` | Record creation time |
| `LAST_MODIFIED_TIME()` | `LAST_MODIFIED_TIME()` | Last modification |
| `RECORD_ID()` | `RECORD_ID()` | Current record ID |

## Batch Operations (for > 10 records)

```javascript
async function batchCreate(tableName, allRecords) {
  const results = [];
  // Airtable limits 10 records per request
  for (let i = 0; i < allRecords.length; i += 10) {
    const batch = allRecords.slice(i, i + 10);
    const created = await base(tableName).create(
      batch.map(r => ({ fields: r })),
      { typecast: true }
    );
    results.push(...created);
    // Respect rate limit: 5 requests/second
    if (i + 10 < allRecords.length) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  return results;
}
```

## Webhooks

### Create a Webhook
```javascript
async function createWebhook(baseId, tableId, notificationUrl) {
  const response = await fetch(
    `https://api.airtable.com/v0/bases/${baseId}/webhooks`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        notificationUrl,
        specification: {
          options: {
            filters: {
              dataTypes: ['tableData'],
              recordChangeScope: tableId,
            },
          },
        },
      }),
    }
  );
  return response.json();
}
```

### Process Webhook Payload
```javascript
app.post('/api/airtable-webhook', async (req, res) => {
  const { base, webhook, timestamp } = req.body;
  
  // Fetch the actual changes using cursor
  const response = await fetch(
    `https://api.airtable.com/v0/bases/${base.id}/webhooks/${webhook.id}/payloads`,
    { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}` } }
  );
  const data = await response.json();
  
  for (const payload of data.payloads) {
    if (payload.changedTablesById) {
      // Process changes
      for (const [tableId, changes] of Object.entries(payload.changedTablesById)) {
        if (changes.createdRecordsById) {
          console.log('New records:', Object.keys(changes.createdRecordsById));
        }
        if (changes.changedRecordsById) {
          console.log('Updated records:', Object.keys(changes.changedRecordsById));
        }
      }
    }
  }
  
  res.sendStatus(200);
});
```

## JADOMI CMS Use Cases

### Product Catalog Table Schema
```
Table: Produits
- Nom (Single line text) — Product name
- SKU (Single line text) — Unique identifier
- Categorie (Single select) — Fauteuils Manuels, Fauteuils Electriques, Accessoires, Coussins, etc.
- Prix (Currency EUR) — Public price
- Prix Promo (Currency EUR) — Promotional price (OBLIGATOIRE: catalogue ET promo)
- Description (Long text) — Full description
- Image (Attachment) — Product images
- Stock (Number) — Available quantity
- Fournisseur (Link to Fournisseurs) — Supplier link
- Status (Single select) — Actif, Inactif, En rupture
- Poids (Number) — Weight in kg
- Dimensions (Single line text) — LxWxH
- Date Creation (Created time)
- Derniere Modification (Last modified time)
```

### Client/Lead Table Schema
```
Table: Clients
- Nom (Single line text)
- Prenom (Single line text)
- Email (Email)
- Telephone (Phone)
- Type (Single select) — Particulier, Professionnel, Etablissement
- Adresse (Long text)
- Ville (Single line text)
- Code Postal (Single line text)
- Source (Single select) — Site web, Telephone, Email, Salon, Partenaire
- Status (Single select) — Prospect, Client, Inactif
- Notes (Long text)
- Commandes (Link to Commandes)
- CA Total (Rollup from Commandes)
```

### Sync Airtable to JADOMI Database
```javascript
async function syncProductsToDb(db) {
  const products = await listRecords('Produits', {
    filter: "{Status} = 'Actif'",
  });
  
  for (const product of products) {
    await db.query(`
      INSERT INTO products (airtable_id, name, sku, category, price, promo_price, description, stock)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (airtable_id) DO UPDATE SET
        name = EXCLUDED.name,
        price = EXCLUDED.price,
        promo_price = EXCLUDED.promo_price,
        stock = EXCLUDED.stock,
        updated_at = NOW()
    `, [
      product.id,
      product['Nom'],
      product['SKU'],
      product['Categorie'],
      product['Prix'],
      product['Prix Promo'],
      product['Description'],
      product['Stock'],
    ]);
  }
}
```

## Rate Limits & Best Practices

1. **Rate limit**: 5 requests/second per base — add 200ms delay between batch calls
2. **Max 10 records per create/update/delete** — batch in chunks of 10
3. **Max 100 records per list** — use pagination for larger datasets
4. **Use Views** — filter server-side with views for better performance
5. **Typecast: true** — automatically converts string values to the correct field type
6. **Cache aggressively** — Airtable is not a high-performance database; cache reads
7. **fieldsToMergeOn for upserts** — avoid duplicate records by using unique field matching
8. **Use RECORD_ID()** — never rely on row order; always use record IDs
9. **Attachments** — upload via URL: `[{ url: 'https://...' }]`; Airtable hosts a copy
10. **Linked records** — pass array of record IDs: `['recXXX', 'recYYY']`

## REST API Direct (without SDK)

### List with Pagination
```javascript
async function listAllRecords(baseId, tableName) {
  let records = [];
  let offset = null;
  
  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}` },
    });
    const data = await response.json();
    records.push(...data.records);
    offset = data.offset;
  } while (offset);
  
  return records;
}
```

## Airtable Automations (via Scripts)

### Script Example: Send Notification on New Order
```javascript
// Airtable Automation Script
const record = input.config();
const table = base.getTable('Commandes');
const order = await table.selectRecordAsync(record.recordId);

// Send notification via webhook
await fetch('https://jadomi.fr/api/notifications/new-order', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    orderId: order.getCellValueAsString('Numero'),
    client: order.getCellValueAsString('Client'),
    total: order.getCellValue('Total'),
    date: new Date().toISOString(),
  }),
});
```

## Field Types Reference
| Type | API Value Format | Example |
|------|-----------------|---------|
| Single line text | `"string"` | `"Fauteuil Pro"` |
| Long text | `"string"` | `"Description longue..."` |
| Number | `number` | `42` |
| Currency | `number` | `299.99` |
| Percent | `number` | `0.15` (= 15%) |
| Single select | `"string"` | `"Actif"` |
| Multiple select | `["a","b"]` | `["Tag1", "Tag2"]` |
| Date | `"YYYY-MM-DD"` | `"2026-05-15"` |
| Checkbox | `boolean` | `true` |
| Email | `"string"` | `"contact@jadomi.fr"` |
| Phone | `"string"` | `"+33320000000"` |
| URL | `"string"` | `"https://jadomi.fr"` |
| Attachment | `[{url}]` | `[{"url": "https://..."}]` |
| Link to record | `["recId"]` | `["recABC", "recDEF"]` |
