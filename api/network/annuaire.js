// =============================================
// JADOMI — Annuaire : recherche publique cross-profils
// =============================================
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vsbomwjzehnfinfjvhqp.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_RcfR0_sq5Z-oWK97ij27Yw_tGfur7UF';

let _sb = null;
function sb() {
  if (!_sb) _sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  return _sb;
}

// Tables et leur type/page_url + colonnes specifiques
const PROFIL_TABLES = [
  {
    table: 'juridique_profil', type: 'juridique', page_url: '/expert/',
    col_nom: 'nom',             // nom + prenom
    col_profession: 'type_professionnel',
    col_search: ['nom', 'prenom', 'type_professionnel', 'ville'],
    col_profession_search: ['type_professionnel'],
    col_ville: ['ville', 'code_postal'],
    has_nom_prenom: true
  },
  {
    table: 'services_profil', type: 'services', page_url: '/booking/',
    col_nom: 'metier',          // pas de colonne nom
    col_profession: 'metier',
    col_search: ['metier', 'sous_metier', 'ville'],
    col_profession_search: ['metier', 'sous_metier'],
    col_ville: ['ville', 'code_postal'],
    has_nom_prenom: false
  },
  {
    table: 'btp_profil', type: 'btp', page_url: '/artisan/',
    col_nom: 'nom_entreprise',
    col_profession: 'metier',
    col_search: ['nom_entreprise', 'metier', 'ville'],
    col_profession_search: ['metier'],
    col_ville: ['ville', 'code_postal'],
    has_nom_prenom: false
  },
  {
    table: 'showroom_profil', type: 'showroom', page_url: '/showroom/',
    col_nom: 'nom_boutique',
    col_profession: 'type_createur',
    col_search: ['nom_boutique', 'type_createur', 'ville'],
    col_profession_search: ['type_createur'],
    col_ville: ['ville', 'code_postal'],
    has_nom_prenom: false
  }
];

function normalise(row, cfg) {
  let nom = '';
  if (cfg.has_nom_prenom) {
    nom = [row.nom, row.prenom].filter(Boolean).join(' ');
  } else {
    nom = row[cfg.col_nom] || '';
  }

  return {
    type: cfg.type,
    slug: row.slug || null,
    nom,
    profession: row[cfg.col_profession] || '',
    ville: row.ville || '',
    code_postal: row.code_postal || '',
    note: row.note_moyenne != null ? parseFloat(row.note_moyenne) : null,
    nb_avis: row.nb_avis || 0,
    photo: row.photo_url || row.logo_url || row.banniere_url || null,
    prix_min: row.prix_min != null ? parseFloat(row.prix_min) : (row.taux_horaire_default != null ? parseFloat(row.taux_horaire_default) : null),
    disponible_today: false,
    visio: false,
    page_url: cfg.page_url
  };
}

// Construit un filtre .or() a partir de colonnes existantes
function buildOr(cols, op, value) {
  return cols.map(c => `${c}.${op}.${value}`).join(',');
}

module.exports = function (router) {

  // ---- GET /search ----
  router.get('/search', async (req, res) => {
    try {
      const { q, profession, ville, note_min } = req.query;
      let allResults = [];

      for (const cfg of PROFIL_TABLES) {
        try {
          let query = sb().from(cfg.table).select('*');

          if (q) {
            query = query.or(buildOr(cfg.col_search, 'ilike', `%${q}%`));
          }
          if (profession) {
            query = query.or(buildOr(cfg.col_profession_search, 'ilike', `%${profession}%`));
          }
          if (ville) {
            query = query.or(buildOr(cfg.col_ville, 'ilike', `%${ville}%`));
          }
          if (note_min) {
            query = query.gte('note_moyenne', parseFloat(note_min));
          }

          query = query.eq('actif', true).limit(50);

          const { data, error } = await query;
          if (error) {
            console.warn(`[annuaire] Erreur ${cfg.table}:`, error.message);
            continue;
          }
          if (data) {
            allResults = allResults.concat(data.map(r => normalise(r, cfg)));
          }
        } catch (tableErr) {
          console.warn(`[annuaire] Skip ${cfg.table}:`, tableErr.message);
        }
      }

      // Tri par note descendante
      allResults.sort((a, b) => (b.note || 0) - (a.note || 0));

      res.json({ ok: true, count: allResults.length, results: allResults });
    } catch (e) {
      console.error('[annuaire/search]', e.message);
      res.status(500).json({ error: 'search_error', message: e.message });
    }
  });

  // ---- GET /categories ----
  router.get('/categories', async (req, res) => {
    try {
      const counts = {};

      for (const cfg of PROFIL_TABLES) {
        try {
          const { data, error } = await sb().from(cfg.table).select(cfg.col_profession);
          if (error) { console.warn(`[annuaire/categories] ${cfg.table}:`, error.message); continue; }
          if (!data) continue;
          for (const row of data) {
            const prof = row[cfg.col_profession] || 'Autre';
            counts[prof] = (counts[prof] || 0) + 1;
          }
        } catch (tableErr) {
          console.warn(`[annuaire/categories] Skip ${cfg.table}:`, tableErr.message);
        }
      }

      const categories = Object.entries(counts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      res.json({ ok: true, categories });
    } catch (e) {
      console.error('[annuaire/categories]', e.message);
      res.status(500).json({ error: 'categories_error', message: e.message });
    }
  });

  // ---- GET /nearby ----
  router.get('/nearby', async (req, res) => {
    try {
      const { cp, rayon } = req.query;
      if (!cp) return res.status(400).json({ error: 'missing_cp' });

      const prefixLen = rayon ? Math.max(1, Math.min(5, parseInt(rayon))) : 2;
      const prefix = String(cp).substring(0, prefixLen);

      let allResults = [];

      for (const cfg of PROFIL_TABLES) {
        try {
          const { data, error } = await sb()
            .from(cfg.table)
            .select('*')
            .like('code_postal', `${prefix}%`)
            .eq('actif', true)
            .limit(30);

          if (error) { console.warn(`[annuaire/nearby] ${cfg.table}:`, error.message); continue; }
          if (data) {
            allResults = allResults.concat(data.map(r => normalise(r, cfg)));
          }
        } catch (tableErr) {
          console.warn(`[annuaire/nearby] Skip ${cfg.table}:`, tableErr.message);
        }
      }

      allResults.sort((a, b) => (b.note || 0) - (a.note || 0));

      res.json({ ok: true, count: allResults.length, prefix, results: allResults });
    } catch (e) {
      console.error('[annuaire/nearby]', e.message);
      res.status(500).json({ error: 'nearby_error', message: e.message });
    }
  });
};
