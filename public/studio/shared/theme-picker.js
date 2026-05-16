// =============================================
// JADOMI Studio — Composant Theme Picker partagé
// Utilisé par : flyer-builder, campagne, video-creator, tous les modules Studio
// =============================================

window.JadomiThemes = (function() {
  let ALL_THEMES = [];
  let ALL_CATEGORIES = [];
  let activeCategory = 'all';
  let selectedThemeId = null;
  let onSelectCallback = null;

  // CSS injecté une seule fois
  const STYLE_ID = 'jadomi-theme-picker-css';

  function injectCSS() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.jt-cat-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}
.jt-cat-tab{padding:8px 16px;border-radius:20px;font-size:12px;font-weight:600;color:var(--text2,#8B8BA0);background:var(--surface,#101018);border:1px solid var(--border,rgba(201,168,76,.06));cursor:pointer;transition:all .3s cubic-bezier(.16,1,.3,1);white-space:nowrap}
.jt-cat-tab:hover{border-color:rgba(201,168,76,.3);color:var(--gold,#C9A84C)}
.jt-cat-tab.active{background:var(--gold,#C9A84C);color:#08080D;border-color:var(--gold,#C9A84C)}
.jt-cat-tab .jt-count{display:inline-block;margin-left:4px;opacity:.7;font-size:10px}
.jt-search{width:100%;padding:10px 16px;border-radius:12px;background:var(--surface,#101018);border:1px solid var(--border,rgba(201,168,76,.06));color:var(--text,#E8E8ED);font-size:13px;outline:none;margin-bottom:12px;transition:border .3s}
.jt-search:focus{border-color:rgba(201,168,76,.4);box-shadow:0 0 0 3px rgba(201,168,76,.08)}
.jt-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;margin-bottom:20px}
.jt-card{cursor:pointer;border:2px solid transparent;border-radius:16px;transition:all .3s cubic-bezier(.16,1,.3,1);overflow:hidden;position:relative}
.jt-card:hover{transform:translateY(-3px);box-shadow:0 12px 32px rgba(0,0,0,.25)}
.jt-card.selected{border-color:var(--gold,#C9A84C);box-shadow:0 0 0 3px rgba(201,168,76,.3)}
.jt-card .jt-preview{padding:20px 16px;min-height:140px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden}
.jt-card .jt-preview::after{content:'';position:absolute;top:0;left:-50%;width:40%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.06),transparent);transform:skewX(-20deg);pointer-events:none}
.jt-card .jt-swatches{display:flex;gap:5px;margin-bottom:10px}
.jt-card .jt-swatch{width:16px;height:16px;border-radius:50%;border:1.5px solid rgba(255,255,255,.2)}
.jt-card .jt-title{font-size:18px;margin-bottom:3px;line-height:1.2}
.jt-card .jt-body{font-size:9px;opacity:.6;line-height:1.4;margin-bottom:8px}
.jt-card .jt-bar{height:3px;width:40px;border-radius:2px}
.jt-card .jt-footer{padding:10px 14px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--border,rgba(201,168,76,.06));background:var(--surface,#101018)}
.jt-card .jt-name{font-size:12px;font-weight:600}
.jt-card .jt-cat{font-size:10px;color:var(--text3,#5A5A6E)}
.jt-empty{color:var(--text3,#5A5A6E);text-align:center;padding:40px;grid-column:1/-1}
.jt-stats{font-size:13px;color:var(--text2,#8B8BA0);margin-bottom:12px;display:flex;align-items:center;gap:8px}
.jt-stats strong{color:var(--gold,#C9A84C)}
    `;
    document.head.appendChild(style);
  }

  function isColorDark(hex) {
    hex = (hex || '#000').replace('#', '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    var r = parseInt(hex.substring(0,2), 16);
    var g = parseInt(hex.substring(2,4), 16);
    var b = parseInt(hex.substring(4,6), 16);
    return (r * 0.299 + g * 0.587 + b * 0.114) < 128;
  }

  async function load() {
    try {
      const resp = await fetch('/api/studio/flyer/themes');
      const data = await resp.json();
      if (data.ok) {
        ALL_THEMES = data.themes;
        ALL_CATEGORIES = data.categories;
      }
    } catch(e) {
      console.warn('[JadomiThemes] API error:', e.message);
    }
    return { themes: ALL_THEMES, categories: ALL_CATEGORIES };
  }

  function renderTabs(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var html = '<div class="jt-cat-tab active" onclick="JadomiThemes.filterCategory(\'all\',this,\'' + containerId.replace('-tabs', '-gallery') + '\')">Tous<span class="jt-count">(' + ALL_THEMES.length + ')</span></div>';
    ALL_CATEGORIES.forEach(function(cat) {
      html += '<div class="jt-cat-tab" onclick="JadomiThemes.filterCategory(\'' + cat.id + '\',this,\'' + containerId.replace('-tabs', '-gallery') + '\')">' + cat.icon + ' ' + cat.label + '<span class="jt-count">(' + cat.count + ')</span></div>';
    });
    el.innerHTML = html;
  }

  function renderGallery(containerId, themes) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var list = themes || ALL_THEMES;
    if (!list.length) {
      el.innerHTML = '<div class="jt-empty">Aucun thème trouvé</div>';
      return;
    }
    el.innerHTML = list.map(function(t) {
      var dark = isColorDark(t.bg);
      return '<div class="jt-card' + (selectedThemeId === t.id ? ' selected' : '') + '" data-theme-id="' + t.id + '" onclick="JadomiThemes.select(\'' + t.id + '\',this)">' +
        '<div class="jt-preview" style="background:' + t.cardBg + ';color:' + t.text + '">' +
          '<div class="jt-swatches">' +
            '<div class="jt-swatch" style="background:' + t.accent + '"></div>' +
            '<div class="jt-swatch" style="background:' + (t.accent2 || t.accent) + '"></div>' +
            '<div class="jt-swatch" style="background:' + t.bg + ';border-color:' + (dark ? 'rgba(255,255,255,.15)' : 'rgba(0,0,0,.1)') + '"></div>' +
          '</div>' +
          '<div>' +
            '<div class="jt-title" style="font-family:' + (t.fontTitle || 'Inter') + ',serif;font-weight:' + (t.fontWeight || '700') + '">' + t.name + '</div>' +
            '<div class="jt-body">Votre contenu ici avec ce style</div>' +
            '<div class="jt-bar" style="background:' + t.gradient + '"></div>' +
          '</div>' +
        '</div>' +
        '<div class="jt-footer">' +
          '<span class="jt-name">' + t.name + '</span>' +
          '<span class="jt-cat">' + (ALL_CATEGORIES.find(function(c){return c.id===t.category})?.label || '') + '</span>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function select(themeId, el) {
    selectedThemeId = themeId;
    document.querySelectorAll('.jt-card').forEach(function(c) { c.classList.remove('selected'); });
    if (el) el.classList.add('selected');
    if (onSelectCallback) onSelectCallback(themeId, getTheme(themeId));
  }

  function filterCategory(catId, el, galleryId) {
    activeCategory = catId;
    var parent = el ? el.parentElement : null;
    if (parent) parent.querySelectorAll('.jt-cat-tab').forEach(function(t) { t.classList.remove('active'); });
    if (el) el.classList.add('active');
    var filtered = catId === 'all' ? ALL_THEMES : ALL_THEMES.filter(function(t) { return t.category === catId; });
    renderGallery(galleryId || 'jt-gallery', filtered);
  }

  function searchFilter(query, galleryId) {
    var q = (query || '').toLowerCase().trim();
    var base = activeCategory === 'all' ? ALL_THEMES : ALL_THEMES.filter(function(t) { return t.category === activeCategory; });
    if (!q) { renderGallery(galleryId || 'jt-gallery', base); return; }
    renderGallery(galleryId || 'jt-gallery', base.filter(function(t) {
      return t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.category.includes(q);
    }));
  }

  function getTheme(id) {
    return ALL_THEMES.find(function(t) { return t.id === id; }) || null;
  }

  function getSelected() {
    return selectedThemeId ? getTheme(selectedThemeId) : null;
  }

  function onSelect(callback) {
    onSelectCallback = callback;
  }

  // Initialisation complète dans un container
  async function init(options) {
    var opts = options || {};
    injectCSS();
    await load();

    if (opts.tabsId) renderTabs(opts.tabsId);
    if (opts.galleryId) renderGallery(opts.galleryId);
    if (opts.searchId) {
      var searchEl = document.getElementById(opts.searchId);
      if (searchEl) {
        searchEl.addEventListener('input', function() {
          searchFilter(this.value, opts.galleryId);
        });
      }
    }
    if (opts.onSelect) onSelectCallback = opts.onSelect;

    return { themes: ALL_THEMES, categories: ALL_CATEGORIES };
  }

  return {
    load: load,
    init: init,
    renderTabs: renderTabs,
    renderGallery: renderGallery,
    select: select,
    filterCategory: filterCategory,
    searchFilter: searchFilter,
    getTheme: getTheme,
    getSelected: getSelected,
    onSelect: onSelect,
    get themes() { return ALL_THEMES; },
    get categories() { return ALL_CATEGORIES; },
    get selectedId() { return selectedThemeId; }
  };
})();
