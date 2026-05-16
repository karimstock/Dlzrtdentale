// =============================================
// JADOMI Studio — Bibliothèque de thèmes flyers
// 10 catégories × ~7 thèmes = 72 thèmes premium
// Chaque thème : couleurs, fonts, gradients, style
// =============================================

const THEME_CATEGORIES = [
  { id: 'medical', label: 'Médical & Santé', icon: '🩺' },
  { id: 'luxe', label: 'Luxe & Premium', icon: '✦' },
  { id: 'moderne', label: 'Moderne & Tech', icon: '◆' },
  { id: 'nature', label: 'Nature & Éco', icon: '◎' },
  { id: 'corporate', label: 'Corporate & Business', icon: '▣' },
  { id: 'creatif', label: 'Créatif & Pop', icon: '◈' },
  { id: 'elegant', label: 'Élégant & Classique', icon: '❖' },
  { id: 'dark', label: 'Dark & Sombre', icon: '◉' },
  { id: 'minimal', label: 'Minimaliste', icon: '○' },
  { id: 'promo', label: 'Promo & Événement', icon: '★' }
];

const THEMES = [

  // ════════════════════════════════════════════
  // MÉDICAL & SANTÉ
  // ════════════════════════════════════════════
  {
    id: 'medical-teal', category: 'medical',
    name: 'Clinique Teal', description: 'Teal médical sur fond clair, confiance et sérieux',
    bg: '#F8FAFB', surface: '#EFF5F4', text: '#1A2E2B', text2: '#5A7A75', accent: '#0D7D6C', accent2: '#0A6457',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #0D7D6C, #0A6457)',
    cardBg: 'linear-gradient(170deg, #F8FAFB, #EFF5F4)',
    tagStyle: 'solid'
  },
  {
    id: 'medical-blue', category: 'medical',
    name: 'Médical Bleu', description: 'Bleu hospitalier classique, rassurant',
    bg: '#F5F8FC', surface: '#EBF0F7', text: '#1A2440', text2: '#5A6B8A', accent: '#2563EB', accent2: '#1D4ED8',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #2563EB, #1D4ED8)',
    cardBg: 'linear-gradient(170deg, #F5F8FC, #EBF0F7)',
    tagStyle: 'solid'
  },
  {
    id: 'medical-sage', category: 'medical',
    name: 'Sage & Bien-être', description: 'Vert sauge apaisant, paramédical et wellness',
    bg: '#F7F9F5', surface: '#EDF2E8', text: '#2A3325', text2: '#6B7A60', accent: '#6B8F5B', accent2: '#567A46',
    font: 'Inter', fontTitle: 'Playfair Display', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #6B8F5B, #567A46)',
    cardBg: 'linear-gradient(170deg, #F7F9F5, #EDF2E8)',
    tagStyle: 'outline'
  },
  {
    id: 'medical-clean', category: 'medical',
    name: 'Stérile & Pur', description: 'Blanc immaculé, lignes fines, ultra-clean',
    bg: '#FFFFFF', surface: '#F5F5F5', text: '#222222', text2: '#888888', accent: '#00B4D8', accent2: '#0096C7',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '600',
    gradient: 'linear-gradient(135deg, #00B4D8, #0096C7)',
    cardBg: 'linear-gradient(170deg, #FFFFFF, #F5F5F5)',
    tagStyle: 'outline'
  },
  {
    id: 'medical-coral', category: 'medical',
    name: 'Dentaire Coral', description: 'Corail chaleureux pour cabinets dentaires modernes',
    bg: '#FFF8F6', surface: '#FFEEE8', text: '#2D1810', text2: '#8A6055', accent: '#E8735A', accent2: '#D4604A',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #E8735A, #D4604A)',
    cardBg: 'linear-gradient(170deg, #FFF8F6, #FFEEE8)',
    tagStyle: 'solid'
  },
  {
    id: 'medical-violet', category: 'medical',
    name: 'Pharma Violet', description: 'Violet pharmaceutique, recherche et innovation',
    bg: '#F8F5FC', surface: '#F0EAF7', text: '#261840', text2: '#6B5A8A', accent: '#7C3AED', accent2: '#6D28D9',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #7C3AED, #6D28D9)',
    cardBg: 'linear-gradient(170deg, #F8F5FC, #F0EAF7)',
    tagStyle: 'solid'
  },
  {
    id: 'medical-mint', category: 'medical',
    name: 'Menthe Fraîche', description: 'Vert menthe frais, hygiène et propreté',
    bg: '#F2FBF9', surface: '#E0F5F0', text: '#1A3330', text2: '#4D7A72', accent: '#2DD4A8', accent2: '#14B890',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '600',
    gradient: 'linear-gradient(135deg, #2DD4A8, #14B890)',
    cardBg: 'linear-gradient(170deg, #F2FBF9, #E0F5F0)',
    tagStyle: 'solid'
  },

  // ════════════════════════════════════════════
  // LUXE & PREMIUM
  // ════════════════════════════════════════════
  {
    id: 'luxe-zendo', category: 'luxe',
    name: 'ZENDO Crème & Or', description: 'Le template validé — fond crème, or & teal premium',
    bg: '#FAF7F2', surface: '#F5F0E8', text: '#1A1A2E', text2: '#4A4A5C', accent: '#8B6914', accent2: '#0D7D6C',
    font: 'Inter', fontTitle: 'Playfair Display', fontWeight: '900',
    gradient: 'linear-gradient(135deg, #8B6914, #A67C1A)',
    cardBg: 'linear-gradient(170deg, #FAF7F2 0%, #F5F0E8 40%, #EDE7DB 100%)',
    tagStyle: 'gradient'
  },
  {
    id: 'luxe-noir-or', category: 'luxe',
    name: 'Noir & Or', description: 'Fond noir profond, accents or, ultra premium',
    bg: '#0A0A0F', surface: '#141420', text: '#F0ECE0', text2: '#A09880', accent: '#C9A84C', accent2: '#E0C06A',
    font: 'Inter', fontTitle: 'Playfair Display', fontWeight: '900',
    gradient: 'linear-gradient(135deg, #C9A84C, #E0C06A)',
    cardBg: 'linear-gradient(170deg, #0A0A0F, #141420)',
    tagStyle: 'gradient'
  },
  {
    id: 'luxe-marble', category: 'luxe',
    name: 'Marbre Blanc', description: 'Blanc marbré, or rose, haute joaillerie',
    bg: '#FAFAFA', surface: '#F0EEEC', text: '#1A1A1A', text2: '#6B6560', accent: '#B87860', accent2: '#A06850',
    font: 'Inter', fontTitle: 'Playfair Display', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #B87860, #A06850)',
    cardBg: 'linear-gradient(170deg, #FAFAFA, #F0EEEC)',
    tagStyle: 'outline'
  },
  {
    id: 'luxe-champagne', category: 'luxe',
    name: 'Champagne Rosé', description: 'Tons champagne et rosé, féminin et raffiné',
    bg: '#FDF8F4', surface: '#F8EEE6', text: '#2D1F1A', text2: '#8A6E60', accent: '#C4857A', accent2: '#B0706A',
    font: 'Inter', fontTitle: 'Playfair Display', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #C4857A, #B0706A)',
    cardBg: 'linear-gradient(170deg, #FDF8F4, #F8EEE6)',
    tagStyle: 'outline'
  },
  {
    id: 'luxe-emeraude', category: 'luxe',
    name: 'Émeraude Royal', description: 'Vert émeraude profond, or antique, majestueux',
    bg: '#0B1F1A', surface: '#0F2A22', text: '#E8E0D0', text2: '#A09878', accent: '#D4A843', accent2: '#50C878',
    font: 'Inter', fontTitle: 'Playfair Display', fontWeight: '900',
    gradient: 'linear-gradient(135deg, #D4A843, #50C878)',
    cardBg: 'linear-gradient(170deg, #0B1F1A, #0F2A22)',
    tagStyle: 'gradient'
  },
  {
    id: 'luxe-platine', category: 'luxe',
    name: 'Platine & Argent', description: 'Gris platine, accents argent, sobriété luxe',
    bg: '#F4F4F6', surface: '#E8E8EC', text: '#1A1A24', text2: '#6A6A7A', accent: '#8A8A9A', accent2: '#6A6A7A',
    font: 'Inter', fontTitle: 'Playfair Display', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #8A8A9A, #6A6A7A)',
    cardBg: 'linear-gradient(170deg, #F4F4F6, #E8E8EC)',
    tagStyle: 'outline'
  },
  {
    id: 'luxe-bordeaux', category: 'luxe',
    name: 'Bordeaux Velours', description: 'Rouge bordeaux sombre, or vieilli, vin et cigare',
    bg: '#1A0A10', surface: '#2A1420', text: '#F0E0D0', text2: '#B09080', accent: '#C0864A', accent2: '#8B2040',
    font: 'Inter', fontTitle: 'Playfair Display', fontWeight: '900',
    gradient: 'linear-gradient(135deg, #C0864A, #8B2040)',
    cardBg: 'linear-gradient(170deg, #1A0A10, #2A1420)',
    tagStyle: 'gradient'
  },

  // ════════════════════════════════════════════
  // MODERNE & TECH
  // ════════════════════════════════════════════
  {
    id: 'tech-gradient', category: 'moderne',
    name: 'Gradient Néon', description: 'Dégradé violet-bleu, style startup tech',
    bg: '#0F0B1A', surface: '#1A1430', text: '#F0EEFF', text2: '#A0A0C0', accent: '#8B5CF6', accent2: '#3B82F6',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '800',
    gradient: 'linear-gradient(135deg, #8B5CF6, #3B82F6)',
    cardBg: 'linear-gradient(170deg, #0F0B1A, #1A1430)',
    tagStyle: 'solid'
  },
  {
    id: 'tech-cyber', category: 'moderne',
    name: 'Cyber Punk', description: 'Rose fluo sur noir, futuriste et audacieux',
    bg: '#0A0A12', surface: '#12121E', text: '#F0F0FF', text2: '#8888AA', accent: '#FF2D78', accent2: '#00F0FF',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '900',
    gradient: 'linear-gradient(135deg, #FF2D78, #00F0FF)',
    cardBg: 'linear-gradient(170deg, #0A0A12, #12121E)',
    tagStyle: 'solid'
  },
  {
    id: 'tech-vercel', category: 'moderne',
    name: 'Vercel Style', description: 'Noir et blanc pur, comme Vercel — simplicité radicale',
    bg: '#000000', surface: '#111111', text: '#EDEDED', text2: '#888888', accent: '#FFFFFF', accent2: '#666666',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #EDEDED, #888888)',
    cardBg: 'linear-gradient(170deg, #000000, #111111)',
    tagStyle: 'outline'
  },
  {
    id: 'tech-linear', category: 'moderne',
    name: 'Linear Violet', description: 'Inspiré Linear app — violet doux sur sombre',
    bg: '#0D0C14', surface: '#16142A', text: '#E8E6F0', text2: '#8A88A0', accent: '#5E5CE6', accent2: '#8B88FF',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '600',
    gradient: 'linear-gradient(135deg, #5E5CE6, #8B88FF)',
    cardBg: 'linear-gradient(170deg, #0D0C14, #16142A)',
    tagStyle: 'solid'
  },
  {
    id: 'tech-ocean', category: 'moderne',
    name: 'Ocean Digital', description: 'Bleu océan profond, tech maritime, data viz',
    bg: '#0A1628', surface: '#0F2040', text: '#E0ECF8', text2: '#7A9AC0', accent: '#38BDF8', accent2: '#0EA5E9',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #38BDF8, #0EA5E9)',
    cardBg: 'linear-gradient(170deg, #0A1628, #0F2040)',
    tagStyle: 'solid'
  },
  {
    id: 'tech-aurora', category: 'moderne',
    name: 'Aurora Boréale', description: 'Vert-violet aurore, gradients magiques',
    bg: '#070B14', surface: '#0C1220', text: '#E0F0F0', text2: '#80A0A0', accent: '#22D3EE', accent2: '#A78BFA',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #22D3EE, #A78BFA)',
    cardBg: 'linear-gradient(170deg, #070B14, #0C1220)',
    tagStyle: 'solid'
  },
  {
    id: 'tech-sunrise', category: 'moderne',
    name: 'Sunrise App', description: 'Orange-rose moderne, énergie startup',
    bg: '#FFF7F0', surface: '#FFF0E6', text: '#1A1210', text2: '#8A7060', accent: '#F97316', accent2: '#EC4899',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '800',
    gradient: 'linear-gradient(135deg, #F97316, #EC4899)',
    cardBg: 'linear-gradient(170deg, #FFF7F0, #FFF0E6)',
    tagStyle: 'solid'
  },

  // ════════════════════════════════════════════
  // NATURE & ÉCO
  // ════════════════════════════════════════════
  {
    id: 'nature-foret', category: 'nature',
    name: 'Forêt Profonde', description: 'Vert forêt sur kraft, naturel et authentique',
    bg: '#F5F0E6', surface: '#EDE5D5', text: '#1A2E1A', text2: '#5A7A5A', accent: '#2D6A3F', accent2: '#1B4D2E',
    font: 'Inter', fontTitle: 'Playfair Display', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #2D6A3F, #1B4D2E)',
    cardBg: 'linear-gradient(170deg, #F5F0E6, #EDE5D5)',
    tagStyle: 'outline'
  },
  {
    id: 'nature-terre', category: 'nature',
    name: 'Terre & Argile', description: 'Ocre, terre cuite, artisanal et chaleureux',
    bg: '#FAF4EB', surface: '#F0E6D6', text: '#2D1F0F', text2: '#8A7050', accent: '#B87333', accent2: '#8B5E3C',
    font: 'Inter', fontTitle: 'Playfair Display', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #B87333, #8B5E3C)',
    cardBg: 'linear-gradient(170deg, #FAF4EB, #F0E6D6)',
    tagStyle: 'outline'
  },
  {
    id: 'nature-ocean', category: 'nature',
    name: 'Océan & Sable', description: 'Bleu mer et sable, vacances et évasion',
    bg: '#F5F9FC', surface: '#E8F0F5', text: '#0F2A3D', text2: '#5A8AA0', accent: '#0891B2', accent2: '#0E7490',
    font: 'Inter', fontTitle: 'Playfair Display', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #0891B2, #0E7490)',
    cardBg: 'linear-gradient(170deg, #F5F9FC, #E8F0F5)',
    tagStyle: 'solid'
  },
  {
    id: 'nature-botanique', category: 'nature',
    name: 'Botanique', description: 'Vert olive et lin, herboristerie et soins naturels',
    bg: '#F8F6F0', surface: '#EFEBE0', text: '#2A2820', text2: '#7A7560', accent: '#7A8B4A', accent2: '#5A6B3A',
    font: 'Inter', fontTitle: 'Playfair Display', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #7A8B4A, #5A6B3A)',
    cardBg: 'linear-gradient(170deg, #F8F6F0, #EFEBE0)',
    tagStyle: 'outline'
  },
  {
    id: 'nature-lavande', category: 'nature',
    name: 'Lavande Provence', description: 'Violet lavande, champs et aromathérapie',
    bg: '#F8F5FA', surface: '#F0EAF4', text: '#2A1F34', text2: '#7A6A8A', accent: '#9B72CF', accent2: '#7E55B0',
    font: 'Inter', fontTitle: 'Playfair Display', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #9B72CF, #7E55B0)',
    cardBg: 'linear-gradient(170deg, #F8F5FA, #F0EAF4)',
    tagStyle: 'outline'
  },
  {
    id: 'nature-bambou', category: 'nature',
    name: 'Bambou Zen', description: 'Vert bambou sur blanc cassé, zen et minéral',
    bg: '#F9FAF5', surface: '#EFF2E8', text: '#1A2A18', text2: '#6A8058', accent: '#5A8C46', accent2: '#3D6B30',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '600',
    gradient: 'linear-gradient(135deg, #5A8C46, #3D6B30)',
    cardBg: 'linear-gradient(170deg, #F9FAF5, #EFF2E8)',
    tagStyle: 'solid'
  },
  {
    id: 'nature-soleil', category: 'nature',
    name: 'Soleil & Miel', description: 'Jaune doré chaud, lumineux et optimiste',
    bg: '#FFFBF0', surface: '#FFF4DE', text: '#2A2010', text2: '#8A7A50', accent: '#E5A710', accent2: '#C48D0C',
    font: 'Inter', fontTitle: 'Playfair Display', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #E5A710, #C48D0C)',
    cardBg: 'linear-gradient(170deg, #FFFBF0, #FFF4DE)',
    tagStyle: 'solid'
  },

  // ════════════════════════════════════════════
  // CORPORATE & BUSINESS
  // ════════════════════════════════════════════
  {
    id: 'corp-navy', category: 'corporate',
    name: 'Navy Professionnel', description: 'Bleu marine classique, confiance et autorité',
    bg: '#F5F7FA', surface: '#E8ECF2', text: '#0F1B2D', text2: '#5A6B8A', accent: '#1E3A5F', accent2: '#152C48',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #1E3A5F, #152C48)',
    cardBg: 'linear-gradient(170deg, #F5F7FA, #E8ECF2)',
    tagStyle: 'solid'
  },
  {
    id: 'corp-gris', category: 'corporate',
    name: 'Gris Acier', description: 'Gris anthracite, lignes droites, industrie',
    bg: '#F2F2F4', surface: '#E5E5E8', text: '#1A1A22', text2: '#6A6A7A', accent: '#4A4A5C', accent2: '#3A3A4C',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #4A4A5C, #3A3A4C)',
    cardBg: 'linear-gradient(170deg, #F2F2F4, #E5E5E8)',
    tagStyle: 'solid'
  },
  {
    id: 'corp-stripe', category: 'corporate',
    name: 'Stripe Indigo', description: 'Inspiré Stripe — indigo vibrant, SaaS premium',
    bg: '#F6F9FC', surface: '#E3E8EF', text: '#0A2540', text2: '#425466', accent: '#635BFF', accent2: '#5851DB',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #635BFF, #5851DB)',
    cardBg: 'linear-gradient(170deg, #F6F9FC, #E3E8EF)',
    tagStyle: 'solid'
  },
  {
    id: 'corp-rouge', category: 'corporate',
    name: 'Rouge Executive', description: 'Rouge puissant, leadership et impact',
    bg: '#FAF5F5', surface: '#F0E8E8', text: '#2A0F0F', text2: '#8A5A5A', accent: '#DC2626', accent2: '#B91C1C',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '800',
    gradient: 'linear-gradient(135deg, #DC2626, #B91C1C)',
    cardBg: 'linear-gradient(170deg, #FAF5F5, #F0E8E8)',
    tagStyle: 'solid'
  },
  {
    id: 'corp-vert', category: 'corporate',
    name: 'Finance Vert', description: 'Vert finance, banque et investissement',
    bg: '#F5FAF5', surface: '#E8F0E8', text: '#0F2A0F', text2: '#5A8A5A', accent: '#16A34A', accent2: '#15803D',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #16A34A, #15803D)',
    cardBg: 'linear-gradient(170deg, #F5FAF5, #E8F0E8)',
    tagStyle: 'solid'
  },
  {
    id: 'corp-consulting', category: 'corporate',
    name: 'Cabinet Conseil', description: 'Bleu-gris sobre, consulting et audit',
    bg: '#F7F8FA', surface: '#ECEEF2', text: '#1A1F2E', text2: '#6A7088', accent: '#4B5E80', accent2: '#3A4D6E',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '600',
    gradient: 'linear-gradient(135deg, #4B5E80, #3A4D6E)',
    cardBg: 'linear-gradient(170deg, #F7F8FA, #ECEEF2)',
    tagStyle: 'outline'
  },
  {
    id: 'corp-btp', category: 'corporate',
    name: 'BTP & Chantier', description: 'Orange chantier, béton et construction',
    bg: '#FAF7F2', surface: '#F0EBE0', text: '#2A2015', text2: '#8A7555', accent: '#EA580C', accent2: '#C2410C',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '800',
    gradient: 'linear-gradient(135deg, #EA580C, #C2410C)',
    cardBg: 'linear-gradient(170deg, #FAF7F2, #F0EBE0)',
    tagStyle: 'solid'
  },

  // ════════════════════════════════════════════
  // CRÉATIF & POP
  // ════════════════════════════════════════════
  {
    id: 'creatif-rainbow', category: 'creatif',
    name: 'Rainbow Pop', description: 'Multicolore joyeux, événementiel et fêtes',
    bg: '#FFFDF5', surface: '#FFF8E8', text: '#1A1A2E', text2: '#5A5A70', accent: '#F43F5E', accent2: '#8B5CF6',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '900',
    gradient: 'linear-gradient(135deg, #F43F5E, #F97316, #EAB308, #22C55E, #3B82F6, #8B5CF6)',
    cardBg: 'linear-gradient(170deg, #FFFDF5, #FFF8E8)',
    tagStyle: 'solid'
  },
  {
    id: 'creatif-candy', category: 'creatif',
    name: 'Candy Pastel', description: 'Pastels doux, bonbon et fantaisie',
    bg: '#FFF5F9', surface: '#FFE8F0', text: '#2A1020', text2: '#8A6078', accent: '#F472B6', accent2: '#C084FC',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #F472B6, #C084FC)',
    cardBg: 'linear-gradient(170deg, #FFF5F9, #FFE8F0)',
    tagStyle: 'solid'
  },
  {
    id: 'creatif-retro', category: 'creatif',
    name: 'Rétro 70s', description: 'Orange, brun, beige rétro, vintage groovy',
    bg: '#FDF5E6', surface: '#F5E8D0', text: '#3D2B1F', text2: '#8B6B50', accent: '#D2691E', accent2: '#8B4513',
    font: 'Inter', fontTitle: 'Playfair Display', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #D2691E, #8B4513)',
    cardBg: 'linear-gradient(170deg, #FDF5E6, #F5E8D0)',
    tagStyle: 'outline'
  },
  {
    id: 'creatif-street', category: 'creatif',
    name: 'Street Art', description: 'Jaune vif sur noir, urbain et bold',
    bg: '#0A0A0A', surface: '#1A1A1A', text: '#FFFFFF', text2: '#AAAAAA', accent: '#FACC15', accent2: '#EAB308',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '900',
    gradient: 'linear-gradient(135deg, #FACC15, #EAB308)',
    cardBg: 'linear-gradient(170deg, #0A0A0A, #1A1A1A)',
    tagStyle: 'solid'
  },
  {
    id: 'creatif-tropical', category: 'creatif',
    name: 'Tropical Punch', description: 'Turquoise et corail, été et vacances',
    bg: '#F0FFFE', surface: '#E0FFFC', text: '#0A2A28', text2: '#4A8A85', accent: '#14B8A6', accent2: '#F97316',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '800',
    gradient: 'linear-gradient(135deg, #14B8A6, #F97316)',
    cardBg: 'linear-gradient(170deg, #F0FFFE, #E0FFFC)',
    tagStyle: 'solid'
  },
  {
    id: 'creatif-memphis', category: 'creatif',
    name: 'Memphis Design', description: 'Géométrie colorée, Memphis style 80s',
    bg: '#FFFEF5', surface: '#FFF8E0', text: '#1A1A2E', text2: '#6A6A80', accent: '#FF6B6B', accent2: '#4ECDC4',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '800',
    gradient: 'linear-gradient(135deg, #FF6B6B, #4ECDC4)',
    cardBg: 'linear-gradient(170deg, #FFFEF5, #FFF8E0)',
    tagStyle: 'solid'
  },
  {
    id: 'creatif-neon', category: 'creatif',
    name: 'Néon Night', description: 'Néons vifs sur sombre, nightlife et club',
    bg: '#0A0A14', surface: '#141428', text: '#F0F0FF', text2: '#8080AA', accent: '#00FF88', accent2: '#FF00AA',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '900',
    gradient: 'linear-gradient(135deg, #00FF88, #FF00AA)',
    cardBg: 'linear-gradient(170deg, #0A0A14, #141428)',
    tagStyle: 'solid'
  },

  // ════════════════════════════════════════════
  // ÉLÉGANT & CLASSIQUE
  // ════════════════════════════════════════════
  {
    id: 'elegant-ivoire', category: 'elegant',
    name: 'Ivoire & Sépia', description: 'Fond ivoire chaud, tons sépia, intemporel',
    bg: '#FEFCF5', surface: '#F8F2E5', text: '#2A2418', text2: '#7A7058', accent: '#8B7B5A', accent2: '#6A5C42',
    font: 'Inter', fontTitle: 'Playfair Display', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #8B7B5A, #6A5C42)',
    cardBg: 'linear-gradient(170deg, #FEFCF5, #F8F2E5)',
    tagStyle: 'outline'
  },
  {
    id: 'elegant-art-deco', category: 'elegant',
    name: 'Art Déco', description: 'Or géométrique, lignes Gatsby, années 20',
    bg: '#0E1117', surface: '#161B26', text: '#E8DCC8', text2: '#A09878', accent: '#D4A843', accent2: '#B8922E',
    font: 'Inter', fontTitle: 'Playfair Display', fontWeight: '900',
    gradient: 'linear-gradient(135deg, #D4A843, #B8922E)',
    cardBg: 'linear-gradient(170deg, #0E1117, #161B26)',
    tagStyle: 'gradient'
  },
  {
    id: 'elegant-blush', category: 'elegant',
    name: 'Blush Powder', description: 'Rose poudré sur blanc, doux et féminin',
    bg: '#FFFBF8', surface: '#FFF0EA', text: '#2A1A18', text2: '#8A6A60', accent: '#E8A090', accent2: '#D08878',
    font: 'Inter', fontTitle: 'Playfair Display', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #E8A090, #D08878)',
    cardBg: 'linear-gradient(170deg, #FFFBF8, #FFF0EA)',
    tagStyle: 'outline'
  },
  {
    id: 'elegant-royal', category: 'elegant',
    name: 'Royal Navy', description: 'Bleu royal, or, style britannique',
    bg: '#F5F5FA', surface: '#E8E8F2', text: '#0A0A2E', text2: '#4A4A7A', accent: '#1E3A7B', accent2: '#C9A84C',
    font: 'Inter', fontTitle: 'Playfair Display', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #1E3A7B, #C9A84C)',
    cardBg: 'linear-gradient(170deg, #F5F5FA, #E8E8F2)',
    tagStyle: 'gradient'
  },
  {
    id: 'elegant-terrazzo', category: 'elegant',
    name: 'Terrazzo Chic', description: 'Fond terrazzo, touches colorées, design intérieur',
    bg: '#F8F4EE', surface: '#F0E8DE', text: '#2A2420', text2: '#7A7068', accent: '#C17A5A', accent2: '#8A9A6A',
    font: 'Inter', fontTitle: 'Playfair Display', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #C17A5A, #8A9A6A)',
    cardBg: 'linear-gradient(170deg, #F8F4EE, #F0E8DE)',
    tagStyle: 'outline'
  },
  {
    id: 'elegant-gothic', category: 'elegant',
    name: 'Gothic Luxe', description: 'Noir profond, bordeaux, élégance sombre',
    bg: '#0E0A0E', surface: '#1A141A', text: '#E8D8D8', text2: '#9A8080', accent: '#8B2252', accent2: '#C9A84C',
    font: 'Inter', fontTitle: 'Playfair Display', fontWeight: '900',
    gradient: 'linear-gradient(135deg, #8B2252, #C9A84C)',
    cardBg: 'linear-gradient(170deg, #0E0A0E, #1A141A)',
    tagStyle: 'gradient'
  },
  {
    id: 'elegant-toscan', category: 'elegant',
    name: 'Toscan Soleil', description: 'Ocre toscan, terracotta, villa italienne',
    bg: '#FBF6EE', surface: '#F2E8D6', text: '#2E2218', text2: '#8A7458', accent: '#C4763C', accent2: '#9A5C2E',
    font: 'Inter', fontTitle: 'Playfair Display', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #C4763C, #9A5C2E)',
    cardBg: 'linear-gradient(170deg, #FBF6EE, #F2E8D6)',
    tagStyle: 'outline'
  },

  // ════════════════════════════════════════════
  // DARK & SOMBRE
  // ════════════════════════════════════════════
  {
    id: 'dark-midnight', category: 'dark',
    name: 'Midnight Blue', description: 'Bleu nuit profond, étoiles et mystère',
    bg: '#0B1121', surface: '#111B33', text: '#D0DCEA', text2: '#6A80A0', accent: '#5B8DEF', accent2: '#3D6FD1',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #5B8DEF, #3D6FD1)',
    cardBg: 'linear-gradient(170deg, #0B1121, #111B33)',
    tagStyle: 'solid'
  },
  {
    id: 'dark-carbon', category: 'dark',
    name: 'Carbon Fibre', description: 'Gris carbone texturé, mécanique de précision',
    bg: '#0E0E12', surface: '#1A1A20', text: '#D0D0D8', text2: '#7A7A88', accent: '#E0E0E8', accent2: '#A0A0B0',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '800',
    gradient: 'linear-gradient(135deg, #E0E0E8, #A0A0B0)',
    cardBg: 'linear-gradient(170deg, #0E0E12, #1A1A20)',
    tagStyle: 'outline'
  },
  {
    id: 'dark-vampire', category: 'dark',
    name: 'Rouge Sang', description: 'Noir et rouge intense, dramatique',
    bg: '#0A0608', surface: '#140C10', text: '#F0D8D8', text2: '#A07070', accent: '#DC2626', accent2: '#991B1B',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '900',
    gradient: 'linear-gradient(135deg, #DC2626, #991B1B)',
    cardBg: 'linear-gradient(170deg, #0A0608, #140C10)',
    tagStyle: 'solid'
  },
  {
    id: 'dark-forest', category: 'dark',
    name: 'Dark Forest', description: 'Vert forêt sombre, mystérieux et organique',
    bg: '#080E0A', surface: '#0E1A10', text: '#D0E8D0', text2: '#70A070', accent: '#4ADE80', accent2: '#22C55E',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #4ADE80, #22C55E)',
    cardBg: 'linear-gradient(170deg, #080E0A, #0E1A10)',
    tagStyle: 'solid'
  },
  {
    id: 'dark-obsidian', category: 'dark',
    name: 'Obsidienne', description: 'Noir absolu, reflets violets, pierre volcanique',
    bg: '#08060E', surface: '#100E18', text: '#D8D0E8', text2: '#8070A0', accent: '#A78BFA', accent2: '#8B5CF6',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #A78BFA, #8B5CF6)',
    cardBg: 'linear-gradient(170deg, #08060E, #100E18)',
    tagStyle: 'solid'
  },
  {
    id: 'dark-petroleum', category: 'dark',
    name: 'Pétrole', description: 'Bleu pétrole sombre, industriel raffiné',
    bg: '#0A1214', surface: '#101E22', text: '#D0E0E4', text2: '#6A9AA4', accent: '#2DD4BF', accent2: '#14B8A6',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '600',
    gradient: 'linear-gradient(135deg, #2DD4BF, #14B8A6)',
    cardBg: 'linear-gradient(170deg, #0A1214, #101E22)',
    tagStyle: 'solid'
  },
  {
    id: 'dark-space', category: 'dark',
    name: 'Deep Space', description: 'Cosmos profond, étoiles et galaxies',
    bg: '#050510', surface: '#0A0A1A', text: '#E0E0FF', text2: '#7070AA', accent: '#818CF8', accent2: '#F472B6',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #818CF8, #F472B6)',
    cardBg: 'linear-gradient(170deg, #050510, #0A0A1A)',
    tagStyle: 'solid'
  },

  // ════════════════════════════════════════════
  // MINIMALISTE
  // ════════════════════════════════════════════
  {
    id: 'min-blanc', category: 'minimal',
    name: 'Blanc Total', description: 'Tout blanc, un seul accent, pureté absolue',
    bg: '#FFFFFF', surface: '#FAFAFA', text: '#111111', text2: '#999999', accent: '#111111', accent2: '#444444',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '600',
    gradient: 'linear-gradient(135deg, #111111, #444444)',
    cardBg: 'linear-gradient(170deg, #FFFFFF, #FAFAFA)',
    tagStyle: 'outline'
  },
  {
    id: 'min-sand', category: 'minimal',
    name: 'Sable & Pierre', description: 'Beige sable minéral, zen japonais',
    bg: '#F5F0E8', surface: '#EDE5DA', text: '#2A2520', text2: '#8A8070', accent: '#6A6050', accent2: '#504840',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '500',
    gradient: 'linear-gradient(135deg, #6A6050, #504840)',
    cardBg: 'linear-gradient(170deg, #F5F0E8, #EDE5DA)',
    tagStyle: 'outline'
  },
  {
    id: 'min-muji', category: 'minimal',
    name: 'Muji Style', description: 'Kraft et noir, comme Muji — sans superflu',
    bg: '#F0EBE0', surface: '#E5DDD0', text: '#1A1815', text2: '#6A6458', accent: '#3A3530', accent2: '#2A2520',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '500',
    gradient: 'linear-gradient(135deg, #3A3530, #2A2520)',
    cardBg: 'linear-gradient(170deg, #F0EBE0, #E5DDD0)',
    tagStyle: 'outline'
  },
  {
    id: 'min-bleu', category: 'minimal',
    name: 'Bleu Unique', description: 'Fond blanc, un seul bleu, Apple style',
    bg: '#FFFFFF', surface: '#F5F5F7', text: '#1D1D1F', text2: '#86868B', accent: '#0071E3', accent2: '#0077ED',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '600',
    gradient: 'linear-gradient(135deg, #0071E3, #0077ED)',
    cardBg: 'linear-gradient(170deg, #FFFFFF, #F5F5F7)',
    tagStyle: 'solid'
  },
  {
    id: 'min-gris-chaud', category: 'minimal',
    name: 'Gris Chaud', description: 'Gris tiède, chaleureux et neutre',
    bg: '#F5F3F0', surface: '#EAE6E0', text: '#2A2825', text2: '#7A7570', accent: '#5A5550', accent2: '#4A4540',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '500',
    gradient: 'linear-gradient(135deg, #5A5550, #4A4540)',
    cardBg: 'linear-gradient(170deg, #F5F3F0, #EAE6E0)',
    tagStyle: 'outline'
  },
  {
    id: 'min-mono', category: 'minimal',
    name: 'Monochrome', description: 'Noir sur blanc pur, typo comme seul design',
    bg: '#FFFFFF', surface: '#F0F0F0', text: '#000000', text2: '#666666', accent: '#000000', accent2: '#333333',
    font: 'Inter', fontTitle: 'Playfair Display', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #000000, #333333)',
    cardBg: 'linear-gradient(170deg, #FFFFFF, #F0F0F0)',
    tagStyle: 'outline'
  },
  {
    id: 'min-rose', category: 'minimal',
    name: 'Rose Nude', description: 'Rose nude subtil, épuré et doux',
    bg: '#FEF7F4', surface: '#FBF0EB', text: '#2A2020', text2: '#8A7070', accent: '#C8A090', accent2: '#B08878',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '500',
    gradient: 'linear-gradient(135deg, #C8A090, #B08878)',
    cardBg: 'linear-gradient(170deg, #FEF7F4, #FBF0EB)',
    tagStyle: 'outline'
  },

  // ════════════════════════════════════════════
  // PROMO & ÉVÉNEMENT
  // ════════════════════════════════════════════
  {
    id: 'promo-soldes', category: 'promo',
    name: 'Soldes Flash', description: 'Rouge et jaune, urgence et promotion',
    bg: '#FFF8E5', surface: '#FFF0CC', text: '#1A0A00', text2: '#8A5A20', accent: '#DC2626', accent2: '#FACC15',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '900',
    gradient: 'linear-gradient(135deg, #DC2626, #FACC15)',
    cardBg: 'linear-gradient(170deg, #FFF8E5, #FFF0CC)',
    tagStyle: 'solid'
  },
  {
    id: 'promo-black-friday', category: 'promo',
    name: 'Black Friday', description: 'Noir total + jaune électrique, deal explosif',
    bg: '#000000', surface: '#0A0A0A', text: '#FFFFFF', text2: '#AAAAAA', accent: '#FACC15', accent2: '#EAB308',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '900',
    gradient: 'linear-gradient(135deg, #FACC15, #EAB308)',
    cardBg: 'linear-gradient(170deg, #000000, #0A0A0A)',
    tagStyle: 'solid'
  },
  {
    id: 'promo-noel', category: 'promo',
    name: 'Noël Premium', description: 'Rouge, vert sapin, or — fêtes de fin d\'année',
    bg: '#0F1A0F', surface: '#1A2A1A', text: '#F0E8D8', text2: '#A0B090', accent: '#DC2626', accent2: '#D4A843',
    font: 'Inter', fontTitle: 'Playfair Display', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #DC2626, #D4A843)',
    cardBg: 'linear-gradient(170deg, #0F1A0F, #1A2A1A)',
    tagStyle: 'gradient'
  },
  {
    id: 'promo-ete', category: 'promo',
    name: 'Été & Plage', description: 'Turquoise, corail, soleil — offres estivales',
    bg: '#F0FDFA', surface: '#E0FAF4', text: '#0A2A24', text2: '#4A8A7A', accent: '#0D9488', accent2: '#F97316',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '800',
    gradient: 'linear-gradient(135deg, #0D9488, #F97316)',
    cardBg: 'linear-gradient(170deg, #F0FDFA, #E0FAF4)',
    tagStyle: 'solid'
  },
  {
    id: 'promo-lancement', category: 'promo',
    name: 'Lancement Produit', description: 'Violet-bleu dynamique, nouveau produit',
    bg: '#F5F0FF', surface: '#EBE4FF', text: '#1A102E', text2: '#6A5A8A', accent: '#7C3AED', accent2: '#2563EB',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '800',
    gradient: 'linear-gradient(135deg, #7C3AED, #2563EB)',
    cardBg: 'linear-gradient(170deg, #F5F0FF, #EBE4FF)',
    tagStyle: 'solid'
  },
  {
    id: 'promo-vip', category: 'promo',
    name: 'Offre VIP', description: 'Noir et or, exclusivité et privilège',
    bg: '#0A0808', surface: '#141210', text: '#F0E8D8', text2: '#A09878', accent: '#D4A843', accent2: '#FFD700',
    font: 'Inter', fontTitle: 'Playfair Display', fontWeight: '900',
    gradient: 'linear-gradient(135deg, #D4A843, #FFD700)',
    cardBg: 'linear-gradient(170deg, #0A0808, #141210)',
    tagStyle: 'gradient'
  },
  {
    id: 'promo-rentre', category: 'promo',
    name: 'Rentrée Septembre', description: 'Bleu et orange, back to business',
    bg: '#F5F8FC', surface: '#E8EFF7', text: '#0F1A2E', text2: '#5A6A8A', accent: '#2563EB', accent2: '#F97316',
    font: 'Inter', fontTitle: 'Inter', fontWeight: '700',
    gradient: 'linear-gradient(135deg, #2563EB, #F97316)',
    cardBg: 'linear-gradient(170deg, #F5F8FC, #E8EFF7)',
    tagStyle: 'solid'
  }
];

// Helpers
function getThemeById(id) {
  return THEMES.find(t => t.id === id) || null;
}

function getThemesByCategory(categoryId) {
  return THEMES.filter(t => t.category === categoryId);
}

function getAllCategories() {
  return THEME_CATEGORIES.map(cat => ({
    ...cat,
    count: THEMES.filter(t => t.category === cat.id).length
  }));
}

function getThemeCSS(theme) {
  return `
    --bg:${theme.bg};--surface:${theme.surface};
    --text:${theme.text};--text2:${theme.text2};
    --accent:${theme.accent};--accent2:${theme.accent2};
    --gradient:${theme.gradient};
    --card-bg:${theme.cardBg};
    --font:${theme.font};--font-title:${theme.fontTitle};
    --font-weight:${theme.fontWeight};
  `;
}

module.exports = { THEMES, THEME_CATEGORIES, getThemeById, getThemesByCategory, getAllCategories, getThemeCSS };
