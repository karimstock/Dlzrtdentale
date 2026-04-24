# Design System JADOMI Homepage v2
## Source : UI/UX Pro Max + Brand + Design-System skills

---

### Style recommande
**Editorial Minimalism** — Elegance medicale/juridique premium.
Inspire de : Stripe.com, Linear.app, Vercel.com, Apple.com
- Layout aere, grandes marges, hierarchie claire
- Fond clair (pas dark pour homepage publique — plus rassurant premier contact)
- Accents de couleur mesures, jamais criards
- Images haute qualite, pas d'emoji systeme
- Icones SVG coherentes (style outline, stroke 1.5px)

### Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg` | `#FAFAF8` | Fond principal (creme chaud) |
| `--bg-alt` | `#F0EDE6` | Fond sections alternees |
| `--surface` | `#FFFFFF` | Cards, modales |
| `--text` | `#1A1A2E` | Texte principal |
| `--text-secondary` | `#5C5C70` | Sous-titres, descriptions |
| `--text-tertiary` | `#8E8E9E` | Labels, meta |
| `--primary` | `#2D3A8C` | Bleu profond — confiance |
| `--primary-light` | `#4F5BD5` | Hover, liens |
| `--accent` | `#8A7239` | Or profond — premium |
| `--accent-light` | `#D4A853` | Badges, highlights |
| `--success` | `#16A34A` | Validations |
| `--border` | `#E5E2DB` | Bordures subtiles |
| `--border-hover` | `#C9C5BB` | Bordures hover |

Dark mode : reserve pour le dashboard (pas la homepage).

### Typography

| Role | Font | Weight | Size |
|------|------|--------|------|
| Display (H1) | Fraunces | 700 italic | 56px desktop / 36px mobile |
| Heading (H2) | Inter | 700 | 36px / 28px |
| Subheading (H3) | Inter | 600 | 24px / 20px |
| Body | Inter | 400 | 16px / 15px |
| Small / Labels | Inter | 500 | 13px / 12px |
| Prix / Chiffres | Syne | 800 | 48px / 36px |

Line-height : 1.5 body, 1.2 headings.
Letter-spacing : -0.02em headings, normal body.

Google Fonts import :
```
Fraunces:ital,wght@1,700&family=Inter:wght@400;500;600;700;800&family=Syne:wght@700;800
```

### Tokens spacing (base 8px)
- `--space-xs` : 4px
- `--space-sm` : 8px
- `--space-md` : 16px
- `--space-lg` : 24px
- `--space-xl` : 32px
- `--space-2xl` : 48px
- `--space-3xl` : 64px
- `--space-4xl` : 96px
- `--space-5xl` : 128px

### Composants de base

**Buttons**
- Primary : bg `--primary`, text white, radius 8px, padding 14px 28px, hover brightness 1.1
- Secondary : bg transparent, border 1px `--border`, text `--text`, hover border `--primary`
- Gold (Expert) : bg gradient `--accent` to `--accent-light`, text `--text`, font-weight 700

**Cards**
- bg `--surface`, border 1px `--border`, radius 16px, padding 32px
- Shadow : `0 1px 3px rgba(0,0,0,0.04), 0 6px 24px rgba(0,0,0,0.04)`
- Hover : translateY(-4px), shadow intensifie, border `--border-hover`

**Nav**
- Sticky top, bg `--bg` avec backdrop-filter blur(12px) + opacity 0.95
- Height 72px, max-width 1200px center
- Logo left, nav center, CTAs right
- Dropdown : bg `--surface`, shadow, radius 12px, 200ms ease

### Animations (GSAP ScrollTrigger)
- Fade-in au scroll : opacity 0→1, translateY 30→0, duration 0.8s
- Parallax hero : vitesse 0.3 (subtil)
- Compteurs : CountUp.js ou GSAP, duration 2s, ease power2.out
- Cards hover : translateY(-4px), duration 300ms, cubic-bezier(.16,1,.3,1)
- Stagger grids : 80ms entre elements
- Respect `prefers-reduced-motion` : desactiver tout sauf opacity

### Anti-patterns a eviter (UI/UX Pro Max)
- NO emoji comme icones structurelles (rule no-emoji-icons)
- NO animations > 500ms pour micro-interactions
- NO texte < 16px body sur mobile (iOS auto-zoom)
- NO hover-only interactions (rule hover-vs-tap)
- NO horizontal scroll mobile
- NO particules/effets 3D lourds
- NO couleur seule pour info (rule color-not-only)
- NO placeholder-only labels dans les forms
- TOUJOURS focus rings visibles sur interactifs
- TOUJOURS alt text sur images significatives
- TOUJOURS contrast ratio >= 4.5:1 texte normal

### Z-index scale
- `--z-base` : 0
- `--z-dropdown` : 10
- `--z-sticky` : 20
- `--z-overlay` : 40
- `--z-modal` : 100
- `--z-toast` : 1000

### Breakpoints
- Mobile : 375px
- Tablet : 768px
- Desktop : 1024px
- Wide : 1440px
- Container max-width : 1200px
