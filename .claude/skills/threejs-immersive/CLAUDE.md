---
name: threejs-immersive
description: Three.js expériences immersives — particules, shaders, modèles 3D, scroll animations, visite virtuelle cabinet
---

# Three.js Immersif — Expériences 3D JADOMI

## Stack
- Three.js v0.184 (installé dans JADOMI)
- GSAP 3.15 + ScrollTrigger (installé)
- Lottie Web 5.13 (installé)
- model-viewer (web component Google, CDN)

## Scene de base
```js
import * as THREE from 'three';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById('container').appendChild(renderer.domElement);
```

## Particules flottantes (hero section)
```js
function createParticles(count = 500, colors = ['#0D7D6C', '#C9A84C']) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const cols = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    pos[i*3] = (Math.random() - 0.5) * 40;
    pos[i*3+1] = (Math.random() - 0.5) * 40;
    pos[i*3+2] = (Math.random() - 0.5) * 40;

    const c = new THREE.Color(colors[Math.floor(Math.random() * colors.length)]);
    cols[i*3] = c.r; cols[i*3+1] = c.g; cols[i*3+2] = c.b;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));

  return new THREE.Points(geo, new THREE.PointsMaterial({
    size: 1.5, vertexColors: true, transparent: true,
    opacity: 0.7, blending: THREE.AdditiveBlending
  }));
}
```

## Chargement modèle 3D (GLB/GLTF)
```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const loader = new GLTFLoader();
loader.load('/models/dental-chair.glb', (gltf) => {
  const model = gltf.scene;
  model.scale.set(0.5, 0.5, 0.5);
  scene.add(model);

  // Animation rotation lente
  function animate() {
    requestAnimationFrame(animate);
    model.rotation.y += 0.003;
    renderer.render(scene, camera);
  }
  animate();
});
```

## model-viewer (solution simple pour produits 3D)
```html
<!-- CDN, pas besoin d'installer -->
<script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js"></script>

<model-viewer
  src="/models/loupe-zendo.glb"
  alt="Loupe ZENDO MultiVision"
  auto-rotate
  camera-controls
  shadow-intensity="1"
  style="width:100%;height:400px"
  poster="/images/loupe-poster.jpg"
  loading="eager"
  ar ar-modes="webxr scene-viewer quick-look"
>
  <button slot="hotspot-1" data-position="0 0.1 0" data-normal="0 1 0">
    Barillet rotatif 3-en-1
  </button>
</model-viewer>
```

## Scroll-triggered 3D (GSAP + Three.js)
```js
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);

// La caméra avance dans la scène au scroll
ScrollTrigger.create({
  trigger: '#scene-container',
  start: 'top top',
  end: '+=3000',
  pin: true,
  scrub: 1,
  onUpdate: (self) => {
    camera.position.z = 30 - self.progress * 25;
    camera.position.y = 5 + self.progress * 3;
    camera.lookAt(0, 0, 0);
  }
});
```

## Shader personnalisé (effet glow)
```js
const glowMaterial = new THREE.ShaderMaterial({
  uniforms: {
    time: { value: 0 },
    color1: { value: new THREE.Color('#0D7D6C') },
    color2: { value: new THREE.Color('#C9A84C') }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float time;
    uniform vec3 color1;
    uniform vec3 color2;
    varying vec2 vUv;
    void main() {
      float t = sin(time + vUv.x * 3.0) * 0.5 + 0.5;
      vec3 color = mix(color1, color2, t);
      float alpha = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
      gl_FragColor = vec4(color, alpha * 0.8);
    }
  `,
  transparent: true
});
```

## Performance (60 FPS obligatoire)
```js
// 1. Limiter les pixels
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// 2. LOD (Level of Detail)
const lod = new THREE.LOD();
lod.addLevel(highDetailMesh, 0);
lod.addLevel(mediumDetailMesh, 50);
lod.addLevel(lowDetailMesh, 200);

// 3. Frustum culling (automatique avec Three.js)
mesh.frustumCulled = true;

// 4. Instancing (milliers d'objets identiques)
const instancedMesh = new THREE.InstancedMesh(geometry, material, 1000);

// 5. Dispose quand on quitte la section
function cleanup() {
  scene.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });
  renderer.dispose();
}
```

## Templates immersifs JADOMI créés
| Template | Fichier | Techno |
|----------|---------|--------|
| Particules 3D | `/studio/templates/immersive/hero-3d-particles.html` | Three.js + GSAP |
| Pièce 3D | `/studio/templates/immersive/hero-room-3d.html` | CSS 3D Transforms |
| Vidéo Parallax | `/studio/templates/immersive/hero-video-parallax.html` | GSAP ScrollTrigger |

## Cas d'usage JADOMI
1. **Hero site dentiste** : particules + texte animé (Expert tier)
2. **Showcase produit** : model-viewer avec hotspots (loupes ZENDO)
3. **Visite virtuelle cabinet** : CSS 3D room avec parallax souris
4. **Carte 3D** : MapLibre + Three.js overlay pour GPS coursier
5. **Flyer interactif** : produit rotatif 3D dans le flyer web
