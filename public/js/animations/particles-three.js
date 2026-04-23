/**
 * JADOMI Passe 35 — Three.js Gold Particles
 * Floating ethereal gold particles for hero backgrounds
 * Desktop only (> 768px) for performance
 */

(function() {
  'use strict';

  function init() {
    if (window.innerWidth < 768) return;
    if (typeof THREE === 'undefined') return;

    const canvas = document.getElementById('hero-particles');
    if (!canvas) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Create 200 gold particles
    const count = 200;
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 12;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 8;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 6;
      velocities.push({
        x: (Math.random() - 0.5) * 0.003,
        y: (Math.random() - 0.5) * 0.003,
        z: (Math.random() - 0.5) * 0.002
      });
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xc9a961,
      size: 0.03,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // Animation loop
    let animId;
    function animate() {
      animId = requestAnimationFrame(animate);
      const pos = geometry.attributes.position.array;
      for (let i = 0; i < count; i++) {
        pos[i * 3] += velocities[i].x;
        pos[i * 3 + 1] += velocities[i].y;
        pos[i * 3 + 2] += velocities[i].z;

        // Wrap around boundaries
        if (Math.abs(pos[i * 3]) > 6) velocities[i].x *= -1;
        if (Math.abs(pos[i * 3 + 1]) > 4) velocities[i].y *= -1;
        if (Math.abs(pos[i * 3 + 2]) > 3) velocities[i].z *= -1;
      }
      geometry.attributes.position.needsUpdate = true;
      points.rotation.y += 0.0002;
      renderer.render(scene, camera);
    }

    animate();

    // Resize handler
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (window.innerWidth < 768) {
          cancelAnimationFrame(animId);
          renderer.dispose();
          return;
        }
        camera.aspect = canvas.clientWidth / canvas.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(canvas.clientWidth, canvas.clientHeight);
      }, 200);
    });

    // Pause when not visible (IntersectionObserver)
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          if (!animId) animate();
        } else {
          cancelAnimationFrame(animId);
          animId = null;
        }
      });
    }, { threshold: 0.1 });

    observer.observe(canvas);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
