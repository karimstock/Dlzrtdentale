// =============================================
// JADOMI RAG — Store vectoriel local (SQLite + sqlite-vec)
// 238K+ produits du comparateur, embeddings nomic 768 dims.
// Fichier : data/rag/products.db (NVMe local, zéro cloud)
// =============================================
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const sqliteVec = require('sqlite-vec');

const DB_DIR = path.join(__dirname, '../../data/rag');
const DB_PATH = path.join(DB_DIR, 'products.db');

let _db = null;

function getDb() {
  if (_db) return _db;
  fs.mkdirSync(DB_DIR, { recursive: true });
  _db = new Database(DB_PATH);
  sqliteVec.load(_db);
  _db.pragma('journal_mode = WAL'); // lectures concurrentes pendant l'indexation
  _db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      rowid INTEGER PRIMARY KEY,
      sb_id TEXT UNIQUE,            -- uuid de la ligne scraped_prices (Supabase)
      product_name TEXT NOT NULL,
      brand TEXT,
      category TEXT,
      supplier_name TEXT,
      reference TEXT,
      price_ttc REAL,
      url TEXT
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  // Table vectorielle (sqlite-vec) — rowid aligné sur products.rowid
  _db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_products USING vec0(
      embedding float[768]
    );
  `);
  return _db;
}

/** Insère un lot de produits + leurs embeddings (transaction unique). */
function insertBatch(items, embeddings) {
  const db = getDb();
  const insProd = db.prepare(`
    INSERT INTO products (sb_id, product_name, brand, category, supplier_name, reference, price_ttc, url)
    VALUES (@sb_id, @product_name, @brand, @category, @supplier_name, @reference, @price_ttc, @url)
    ON CONFLICT(sb_id) DO NOTHING
  `);
  const insVec = db.prepare('INSERT INTO vec_products (rowid, embedding) VALUES (?, ?)');

  const tx = db.transaction(() => {
    for (let i = 0; i < items.length; i++) {
      const info = insProd.run(items[i]);
      if (info.changes > 0) {
        // sqlite-vec exige un BigInt pour le rowid (sinon "Only integers are allowed")
        insVec.run(BigInt(info.lastInsertRowid), Buffer.from(embeddings[i].buffer));
      }
    }
  });
  tx();
}

/** Recherche KNN : vecteur requête → top N produits. */
function searchByVector(queryVec, limit = 10) {
  const db = getDb();
  return db.prepare(`
    SELECT p.product_name, p.brand, p.category, p.supplier_name, p.reference,
           p.price_ttc, p.url, v.distance
    FROM vec_products v
    JOIN products p ON p.rowid = v.rowid
    WHERE v.embedding MATCH ? AND k = ?
    ORDER BY v.distance
  `).all(Buffer.from(queryVec.buffer), limit);
}

function getMeta(key) {
  const row = getDb().prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setMeta(key, value) {
  getDb().prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
}

function countProducts() {
  return getDb().prepare('SELECT COUNT(*) AS n FROM products').get().n;
}

module.exports = { getDb, insertBatch, searchByVector, getMeta, setMeta, countProducts, DB_PATH };
