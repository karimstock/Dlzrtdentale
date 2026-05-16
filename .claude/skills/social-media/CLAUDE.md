# Social Media Content Skill for Claude Code

## Overview
This skill enables Claude to generate professional social media content for JADOMI across all major platforms: Instagram, LinkedIn, Facebook, Twitter/X, TikTok, and Pinterest. Covers image sizing, copywriting, hashtag strategies, posting schedules, and carousel/story generation.

## Platform Image Specifications (2026)

### Instagram
| Format | Size (px) | Aspect Ratio | Use Case |
|--------|-----------|-------------|----------|
| Feed Post (Square) | 1080 x 1080 | 1:1 | Standard posts |
| Feed Post (Portrait) | 1080 x 1350 | 4:5 | Best engagement |
| Feed Post (Landscape) | 1080 x 566 | 1.91:1 | Panoramic |
| Story / Reel | 1080 x 1920 | 9:16 | Stories & Reels |
| Carousel | 1080 x 1080 or 1080 x 1350 | 1:1 or 4:5 | Multi-slide |
| Profile Photo | 320 x 320 | 1:1 | Avatar |
| IGTV Cover | 420 x 654 | 1:1.55 | Video thumbnail |

### LinkedIn
| Format | Size (px) | Aspect Ratio | Use Case |
|--------|-----------|-------------|----------|
| Single Image Post | 1200 x 627 | 1.91:1 | Standard posts |
| Portrait Post | 1080 x 1350 | 4:5 | Higher engagement |
| Carousel (PDF) | 1080 x 1080 or 1080 x 1350 | 1:1 or 4:5 | Slide decks |
| Company Page Banner | 1128 x 191 | 5.9:1 | Header |
| Profile Photo | 400 x 400 | 1:1 | Avatar |
| Article Cover | 1200 x 644 | 1.86:1 | Blog posts |

### Facebook
| Format | Size (px) | Aspect Ratio | Use Case |
|--------|-----------|-------------|----------|
| Feed Post | 1200 x 630 | 1.91:1 | Link previews |
| Square Post | 1080 x 1080 | 1:1 | Photos |
| Story | 1080 x 1920 | 9:16 | Stories |
| Cover Photo | 820 x 312 | 2.63:1 | Page header |
| Event Cover | 1200 x 628 | 1.91:1 | Events |
| Profile Photo | 170 x 170 | 1:1 | Avatar |

### Twitter/X
| Format | Size (px) | Aspect Ratio | Use Case |
|--------|-----------|-------------|----------|
| Single Image | 1200 x 675 | 16:9 | Standard tweet |
| Two Images | 700 x 800 each | 7:8 | Multi-image |
| Header Photo | 1500 x 500 | 3:1 | Profile banner |
| Profile Photo | 400 x 400 | 1:1 | Avatar |

### TikTok
| Format | Size (px) | Aspect Ratio | Use Case |
|--------|-----------|-------------|----------|
| Video | 1080 x 1920 | 9:16 | Standard video |
| Profile Photo | 200 x 200 | 1:1 | Avatar |

### Pinterest
| Format | Size (px) | Aspect Ratio | Use Case |
|--------|-----------|-------------|----------|
| Standard Pin | 1000 x 1500 | 2:3 | Best performance |
| Long Pin | 1000 x 2100 | 1:2.1 | Infographics |
| Square Pin | 1000 x 1000 | 1:1 | Minimal |

## Content Templates

### Instagram Post Template
```javascript
function generateInstagramPost(product, options = {}) {
  return {
    image: {
      width: 1080,
      height: options.portrait ? 1350 : 1080,
      format: 'jpg',
      quality: 95,
    },
    caption: buildCaption({
      hook: options.hook || `Decouvrez le ${product.name}`,
      body: product.shortDescription,
      cta: options.cta || 'Lien en bio pour commander',
      hashtags: generateHashtags(product, 'instagram'),
      emojis: true,
    }),
    altText: `${product.name} - ${product.category} JADOMI`,
  };
}

function buildCaption({ hook, body, cta, hashtags, emojis }) {
  const emoji = emojis ? ' ✨' : '';
  return `${hook}${emoji}\n\n${body}\n\n👉 ${cta}\n\n.\n.\n.\n${hashtags.join(' ')}`;
}
```

### LinkedIn Post Template
```javascript
function generateLinkedInPost(topic, options = {}) {
  const post = {
    hook: '', // First 2 lines visible before "see more"
    body: '',
    cta: '',
    hashtags: [],
  };

  // LinkedIn best practices: hook in first 2 lines
  post.hook = options.hook || `${topic.headline}\n\nVoici pourquoi c'est important 👇`;
  
  // Body: short paragraphs, 1-2 sentences each
  post.body = topic.points.map((point, i) => {
    return `${i + 1}. ${point}`;
  }).join('\n\n');

  post.cta = options.cta || '\nQu\'en pensez-vous ? Partagez votre experience en commentaire.';
  
  // LinkedIn: max 3-5 hashtags
  post.hashtags = generateHashtags(topic, 'linkedin').slice(0, 5);

  return `${post.hook}\n\n${post.body}\n\n${post.cta}\n\n${post.hashtags.map(h => `#${h}`).join(' ')}`;
}
```

### Carousel Generator (Instagram/LinkedIn)
```javascript
function generateCarousel(content, platform = 'instagram') {
  const slides = [];
  const size = platform === 'linkedin' 
    ? { width: 1080, height: 1080 }  // LinkedIn carousel = PDF
    : { width: 1080, height: 1350 }; // Instagram 4:5

  // Slide 1: Cover
  slides.push({
    type: 'cover',
    title: content.title,
    subtitle: content.subtitle || 'Swipez pour decouvrir →',
    background: content.brandColor || '#0066CC',
    ...size,
  });

  // Content slides
  for (const point of content.points) {
    slides.push({
      type: 'content',
      number: slides.length,
      title: point.title,
      body: point.description,
      icon: point.icon || null,
      ...size,
    });
  }

  // Final slide: CTA
  slides.push({
    type: 'cta',
    title: content.ctaTitle || 'Pret a passer a l\'action ?',
    body: content.ctaBody || 'Visitez jadomi.fr',
    buttonText: content.ctaButton || 'En savoir plus',
    ...size,
  });

  return {
    platform,
    slideCount: slides.length,
    slides,
    exportFormat: platform === 'linkedin' ? 'pdf' : 'images',
  };
}
```

## Hashtag Strategy

### Hashtag Tiers (Instagram)
```javascript
const HASHTAG_STRATEGY = {
  // Branded (always include)
  branded: ['jadomi', 'jadomifr', 'jadomisante'],
  
  // Industry (medium competition)
  industry: {
    fauteuil_roulant: ['fauteuilroulant', 'wheelchair', 'mobilite', 'handicap', 'accessibilite', 'pmr'],
    medical: ['materielmedical', 'sante', 'bienetre', 'aideatechnique', 'readaptation'],
    dental: ['dentaire', 'cabinetdentaire', 'chirurgiedentaire', 'prothesedentaire'],
  },
  
  // Location (local visibility)
  location: ['roubaix', 'lillemetropole', 'hautsdefrance', 'nord', 'lille'],
  
  // Engagement (high volume)
  engagement: ['instahealth', 'healthtech', 'medtech', 'innovation', 'madeinfrance'],
};

function generateHashtags(content, platform) {
  const tags = [...HASHTAG_STRATEGY.branded];
  
  if (content.category && HASHTAG_STRATEGY.industry[content.category]) {
    tags.push(...HASHTAG_STRATEGY.industry[content.category]);
  }
  tags.push(...HASHTAG_STRATEGY.location.slice(0, 3));
  tags.push(...HASHTAG_STRATEGY.engagement.slice(0, 3));
  
  // Platform limits
  const limits = { instagram: 30, linkedin: 5, twitter: 3, facebook: 10, tiktok: 5 };
  return tags.slice(0, limits[platform] || 10).map(t => `#${t}`);
}
```

## Posting Schedule (Optimal Times — France)

### Recommended Schedule
```javascript
const POSTING_SCHEDULE = {
  instagram: {
    bestDays: ['mardi', 'mercredi', 'jeudi'],
    bestTimes: ['08:00', '12:00', '18:00'],
    frequency: '4-5 posts/semaine',
    stories: '1-3/jour',
    reels: '2-3/semaine',
  },
  linkedin: {
    bestDays: ['mardi', 'mercredi', 'jeudi'],
    bestTimes: ['08:00', '10:00', '17:00'],
    frequency: '3-4 posts/semaine',
    articles: '1/semaine',
  },
  facebook: {
    bestDays: ['mercredi', 'jeudi', 'vendredi'],
    bestTimes: ['09:00', '13:00', '16:00'],
    frequency: '3-5 posts/semaine',
    stories: '1-2/jour',
  },
  twitter: {
    bestDays: ['lundi', 'mardi', 'mercredi', 'jeudi'],
    bestTimes: ['09:00', '12:00', '17:00'],
    frequency: '1-3 tweets/jour',
    threads: '1-2/semaine',
  },
  tiktok: {
    bestDays: ['mardi', 'jeudi', 'samedi'],
    bestTimes: ['12:00', '19:00', '21:00'],
    frequency: '3-5 videos/semaine',
  },
  pinterest: {
    bestDays: ['samedi', 'dimanche'],
    bestTimes: ['20:00', '21:00'],
    frequency: '5-10 pins/semaine',
  },
};
```

## Content Calendar Generator
```javascript
function generateContentCalendar(month, year, themes) {
  const calendar = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dayName = date.toLocaleDateString('fr-FR', { weekday: 'long' });
    
    // Skip weekends for LinkedIn
    const isWeekday = date.getDay() !== 0 && date.getDay() !== 6;
    
    const dayPlan = { date: date.toISOString().split('T')[0], dayName, posts: [] };
    
    // Instagram: Tue, Wed, Thu
    if ([2, 3, 4].includes(date.getDay())) {
      dayPlan.posts.push({
        platform: 'instagram',
        type: day % 3 === 0 ? 'carousel' : day % 3 === 1 ? 'reel' : 'post',
        time: '12:00',
        theme: themes[day % themes.length],
      });
    }
    
    // LinkedIn: Tue, Wed, Thu
    if (isWeekday && [2, 3, 4].includes(date.getDay())) {
      dayPlan.posts.push({
        platform: 'linkedin',
        type: day % 4 === 0 ? 'carousel' : 'post',
        time: '08:00',
        theme: themes[day % themes.length],
      });
    }
    
    // Facebook: Wed, Thu, Fri
    if ([3, 4, 5].includes(date.getDay())) {
      dayPlan.posts.push({
        platform: 'facebook',
        type: 'post',
        time: '13:00',
        theme: themes[day % themes.length],
      });
    }
    
    if (dayPlan.posts.length > 0) calendar.push(dayPlan);
  }
  
  return calendar;
}
```

## Content Pillars for JADOMI

### Pillar 1: Produits & Solutions (40%)
- Product showcases with features
- Before/after customer stories
- Product comparisons and guides
- New arrivals and promotions

### Pillar 2: Education & Expertise (30%)
- Tips for choosing medical equipment
- Accessibility guides
- Industry news and regulations
- FAQ answered in carousel format

### Pillar 3: Marque & Valeurs (20%)
- Behind the scenes at JADOMI Roubaix
- Team introductions
- Community engagement
- Partnerships and events

### Pillar 4: Engagement & UGC (10%)
- Customer testimonials
- Polls and questions
- User-generated content reshares
- Seasonal campaigns

## Copywriting Formulas

### AIDA (Attention-Interest-Desire-Action)
```javascript
function aidaCopy(product) {
  return {
    attention: `Stop ! Vous cherchez ${product.category} de qualite ?`,
    interest: `Le ${product.name} combine ${product.keyFeature1} et ${product.keyFeature2}.`,
    desire: `Imagine: ${product.benefitStatement}. Deja ${product.socialProof} clients satisfaits.`,
    action: `Commandez maintenant sur jadomi.fr — livraison gratuite !`,
  };
}
```

### PAS (Problem-Agitate-Solution)
```javascript
function pasCopy(product) {
  return {
    problem: `${product.painPoint}`,
    agitate: `Chaque jour sans solution, c'est ${product.agitation}.`,
    solution: `Le ${product.name} resout ce probleme. ${product.howItWorks}.`,
  };
}
```

### Hook Formulas (First Line)
```javascript
const HOOKS = [
  (topic) => `${topic} : voici ce que personne ne vous dit`,
  (topic) => `J'ai teste ${topic} pendant 30 jours. Resultat :`,
  (topic) => `Arretez de faire cette erreur avec ${topic}`,
  (topic) => `3 raisons de choisir ${topic} en 2026`,
  (topic) => `${topic} : le guide complet (fil a sauvegarder)`,
  (topic) => `Pourquoi 90% des gens se trompent sur ${topic}`,
  (topic) => `La verite sur ${topic} que les pros ne disent pas`,
  (topic) => `${topic} : avant/apres qui parle de lui-meme`,
];
```

## Story Templates

### Instagram Story Sequence (Product Launch)
```javascript
function productLaunchStorySequence(product) {
  return [
    {
      slide: 1,
      type: 'teaser',
      text: 'Quelque chose arrive... 👀',
      background: 'gradient',
      duration: 5,
    },
    {
      slide: 2,
      type: 'reveal',
      image: product.heroImage,
      text: `Nouveau : ${product.name}`,
      sticker: 'countdown',
      duration: 5,
    },
    {
      slide: 3,
      type: 'features',
      text: product.topFeatures.join('\n✅ '),
      background: product.brandColor,
      duration: 7,
    },
    {
      slide: 4,
      type: 'price',
      text: `A partir de ${product.price} EUR`,
      cta: 'Voir le lien',
      sticker: 'link',
      link: product.url,
      duration: 5,
    },
    {
      slide: 5,
      type: 'poll',
      question: 'Ca vous interesse ?',
      options: ['Oui, je veux !', 'Dites-m\'en plus'],
      sticker: 'poll',
      duration: 0, // until dismissed
    },
  ];
}
```

## Multi-Platform Content Adapter
```javascript
function adaptContent(masterContent, targetPlatform) {
  const limits = {
    instagram: { captionMax: 2200, hashtagMax: 30 },
    linkedin: { captionMax: 3000, hashtagMax: 5 },
    facebook: { captionMax: 63206, hashtagMax: 10 },
    twitter: { captionMax: 280, hashtagMax: 3 },
    tiktok: { captionMax: 2200, hashtagMax: 5 },
  };

  const config = limits[targetPlatform];
  let adapted = { ...masterContent };

  // Truncate caption
  if (adapted.caption.length > config.captionMax) {
    adapted.caption = adapted.caption.substring(0, config.captionMax - 3) + '...';
  }

  // Limit hashtags
  adapted.hashtags = adapted.hashtags.slice(0, config.hashtagMax);

  // Platform-specific adjustments
  switch (targetPlatform) {
    case 'linkedin':
      adapted.tone = 'professional';
      adapted.caption = adapted.caption.replace(/!+/g, '.').replace(/😍|🔥|💯/g, '');
      break;
    case 'twitter':
      adapted.caption = adapted.caption.split('\n')[0]; // First line only
      break;
    case 'tiktok':
      adapted.caption = `${adapted.caption.split('\n')[0]} #pourtoi #fyp`;
      break;
  }

  return adapted;
}
```

## Best Practices

1. **Consistency over volume** — better 3 quality posts than 7 mediocre ones
2. **4:5 portrait format** — takes more screen space on Instagram, higher engagement
3. **Hook in first 125 characters** — that is what shows before "see more" on Instagram
4. **LinkedIn: no external links in post** — put links in first comment for better reach
5. **Alt text always** — accessibility matters for medical equipment brand
6. **Video captions** — always add subtitles (85% watch without sound)
7. **Respond within 1 hour** — engagement in first hour determines reach
8. **User-generated content** — reshare customer photos (with permission) for authenticity
9. **A/B test visuals** — test product-only vs lifestyle vs infographic formats
10. **CTA clarity** — one clear call-to-action per post, not three
11. **Accents corrects** — ZERO TOLERANCE on spelling for B2B medical brand
12. **Never use AI-generated medical claims** — only verified product specifications
