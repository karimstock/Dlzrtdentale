# JADOMI Homepage v3 — Plan Exceptionnel
## Objectif : Awwwards Site of the Year level

### Pattern principal
**Cinematic Storytelling Vertical** — Inspiré Linear + Anthropic + Apple Vision Pro.
Chaque section = un acte. Le scroll = la narration.
Le visiteur ne scrolle pas une page, il traverse une expérience.

### Palette FINALE (5 couleurs signature)
| Token | Hex | Usage |
|-------|-----|-------|
| `--nuit` | `#0A1628` | Dominant sombre, hero, sections immersives |
| `--creme` | `#FAF5EB` | Dominant clair, sections "air" |
| `--or` | `#C9A961` | Accent luxe, CTAs, soulignages, particules |
| `--noir` | `#0A0A0F` | CTA final, footer, profondeur absolue |
| `--blanc` | `#FFFFFF` | Textes sur fonds sombres |

### Typography stack
- Display : Fraunces Italic 700 (hero 96-120px, H2 64-80px)
- Body : Inter 400/500/600 (16-24px)
- Accent : Syne 700 (badges, small caps, chiffres clés)
- Mono : JetBrains Mono (compteurs data)

### 6 animations signature
1. **Split Text Reveal** — H1/H2 apparaissent mot par mot avec rotation subtile
2. **Gold Line Draw** — Ligne dorée qui se dessine au scroll entre sections
3. **Parallax Cards** — Cards qui flottent avec profondeur au scroll
4. **Counter Tachymeter** — Chiffres qui comptent avec effet digital
5. **Magnetic CTA** — Boutons qui attirent subtilement le curseur
6. **Grain + Gradient** — Texture film grain sur fonds gradient (CSS)

### Références croisées
- Hero typography : anthropic.com (Fraunces massive, fade par mot)
- Gradients : linear.app (bleu profond → chaud)
- Section spacing : apple.com/vision-pro (respiration entre sections)
- Cards : stripe.com (elevation + hover)
- Footer : vercel.com (minimal, classe)
- Scroll feel : framer.com (Lenis smooth, natural)

### Anti-patterns
- PAS de particles.js spam (subtil uniquement via CSS)
- PAS de Three.js lourd (pas de WebGL pour la homepage)
- PAS de carousel/slider (scroll vertical uniquement)
- PAS d'animations > 600ms pour micro-interactions
- PAS de fontes > 4 familles
- PAS de vidéos > 5MB chacune
