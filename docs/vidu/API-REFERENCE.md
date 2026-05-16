# Vidu API — Reference Complete

> Source : documentation officielle platform.vidu.com (mai 2026)
> NE JAMAIS perdre ce fichier — c'est LA reference

## BASE URL
```
https://api.vidu.com/ent/v2/
```

## AUTHENTIFICATION
```
Authorization: Token {VIDU_API_KEY}
Content-Type: application/json
```

## MODELES DISPONIBLES (NOMS EXACTS)

### Video
- `viduq3-pro` — meilleur qualite, audio-video sync
- `viduq3-pro-fast` — rapide, bon rapport qualite/prix  
- `viduq3-turbo` — le plus rapide Q3
- `viduq2-pro` — video reference, editing
- `viduq2-pro-fast` — rapide, pas cher
- `viduq2-turbo` — rapide, bon effet
- `viduq1` — image claire, transition smooth
- `viduq1-classic` — transitions plus riches
- `vidu2.0` — generation rapide

### Image
- `viduq2` — text-to-image, reference-to-image, editing
- `viduq1` — reference-to-image

### Audio
- `audio1.0` — effets sonores + BGM

## ENDPOINTS

### VIDEO
| Endpoint | Description |
|---|---|
| POST /text2video | Texte → video |
| POST /img2video | Image → video |
| POST /reference2video | Multi-images ref → video coherente |
| POST /start-end2video | First frame + last frame → video |
| POST /template | Templates predefinies (hugging, kissing...) |
| POST /template-story | Stories (love_story, one_shot...) |

### IMAGE
| Endpoint | Description |
|---|---|
| POST /reference2image | Texte/images → image (text2image si 0 images) |

### AUDIO
| Endpoint | Description |
|---|---|
| POST /text2audio | Texte → effet sonore/BGM |
| POST /timing2audio | Timeline → effets sonores |
| POST /audio-tts | Texte → voix parlee |
| POST /audio-clone | Clone de voix |

### OTHER
| Endpoint | Description |
|---|---|
| POST /image2dance | Motion sync (photo+video ref) |
| POST /lip-sync | Lip sync (video + audio/texte) |
| POST /digital-human | Avatar parlant (photo + texte/audio) |
| POST /img2video-prompt-recommendation | Suggestions prompts |
| POST /extend | Extension video |
| POST /multiframe | Multi-frame intelligent |
| POST /upscale-pro | Upscale 2K/4K/8K |

### SOLUTIONS
| Endpoint | Description |
|---|---|
| POST /one-click/general_one_click | Film auto-genere |
| POST /one-click/ad_film | Pub automatique |
| POST /one-click/trending_replicate | Replique tendance |
| POST /one-click/ai_mv | Clip musical IA |

### TASK MANAGEMENT
| Endpoint | Description |
|---|---|
| GET /tasks/{id} | Status d'une tache |
| GET /tasks | Liste des taches |
| POST /tasks/{id}/cancel | Annuler une tache |
| GET /credits | Solde credits |
| POST /tools/v2/files/uploads | Upload image |

## EXEMPLES CURL

### Text to Video (le moins cher)
```bash
curl -X POST -H "Authorization: Token YOUR_KEY" -H "Content-Type: application/json" -d '{
    "model": "viduq3-turbo",
    "prompt": "Professional dental loupes rotating slowly on dark studio background",
    "duration": 5,
    "resolution": "720p",
    "off_peak": true
}' https://api.vidu.com/ent/v2/text2video
```

### Image to Video
```bash
curl -X POST -H "Authorization: Token YOUR_KEY" -H "Content-Type: application/json" -d '{
    "model": "viduq3-turbo",
    "images": ["https://url-de-limage.jpg"],
    "prompt": "The product rotates slowly, golden light reflections",
    "duration": 5,
    "resolution": "720p"
}' https://api.vidu.com/ent/v2/img2video
```

### Reference to Image (GENERATION D'IMAGE)
```bash
curl -X POST -H "Authorization: Token YOUR_KEY" -H "Content-Type: application/json" -d '{
    "model": "viduq2",
    "prompt": "Beautiful blonde female dentist wearing dental loupes, bright studio",
    "aspect_ratio": "16:9",
    "resolution": "1080p"
}' https://api.vidu.com/ent/v2/reference2image
```

### Digital Human (avatar parlant)
```bash
curl -X POST -H "Authorization: Token YOUR_KEY" -H "Content-Type: application/json" -d '{
    "model": "viduq2-turbo",
    "image": "https://url-photo-visage.jpg",
    "text": "Bonjour, bienvenue dans notre cabinet",
    "voice_id": "professional_host",
    "resolution": "720p"
}' https://api.vidu.com/ent/v2/digital-human
```

### Lip Sync
```bash
curl -X POST -H "Authorization: Token YOUR_KEY" -H "Content-Type: application/json" -d '{
    "video_url": "https://url-video.mp4",
    "text": "Bonjour, bienvenue",
    "voice_id": "professional_host"
}' https://api.vidu.com/ent/v2/lip-sync
```

### Solde credits
```bash
curl -X GET -H "Authorization: Token YOUR_KEY" https://api.vidu.com/ent/v2/credits
```

## REPONSE TYPE
```json
{
  "task_id": "xxx",
  "state": "created|queueing|processing|success|failed",
  "credits": 60,
  "created_at": "2025-01-01T15:41:31Z"
}
```

## POLLING RESULTAT
```bash
# Methode 1 : GET /tasks avec task_id
curl -X GET -H "Authorization: Token YOUR_KEY" "https://api.vidu.com/ent/v2/tasks?task_ids=TASK_ID"

# La video est dans : response.tasks[0].creations[0].url
```

## ERREURS COURANTES
- "model is not supported" → utiliser les noms EXACTS (viduq3-turbo, pas q3-turbo)
- 403 → mauvais hostname (utiliser api.vidu.com, pas platform.vidu.com)
- "CreditInsufficient" → recharger
