/**
 * JADOMI Passe 35 — Three.js Neural Network / Data Flow
 * Connected nodes with pulsing gold lines for JADOMI Ads hero
 * Desktop only (> 768px) for performance
 */

(function() {
  'use strict';

  function init() {
    if (window.innerWidth < 768) return;
    if (typeof THREE === 'undefined') return;

    const canvas = document.querySelector('.dataflow-canvas');
    if (!canvas) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    camera.position.z = 8;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Create nodes
    const nodeCount = 80;
    const nodes = [];
    const nodeGeometry = new THREE.SphereGeometry(0.04, 8, 8);
    const nodeMaterial = new THREE.MeshBasicMaterial({ color: 0xc9a961, transparent: true, opacity: 0.8 });

    for (let i = 0; i < nodeCount; i++) {
      const mesh = new THREE.Mesh(nodeGeometry, nodeMaterial.clone());
      mesh.position.set(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 4
      );
      mesh.userData.velocity = {
        x: (Math.random() - 0.5) * 0.005,
        y: (Math.random() - 0.5) * 0.005,
        z: (Math.random() - 0.5) * 0.003
      };
      mesh.userData.pulsePhase = Math.random() * Math.PI * 2;
      scene.add(mesh);
      nodes.push(mesh);
    }

    // Create lines between nearby nodes
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0xc9a961,
      transparent: true,
      opacity: 0.12
    });

    const maxDistance = 2.5;
    let linesMesh = null;

    function updateLines() {
      if (linesMesh) {
        scene.remove(linesMesh);
        linesMesh.geometry.dispose();
      }

      const linePositions = [];
      let connectionCount = 0;
      const maxConnections = 150;

      for (let i = 0; i < nodes.length && connectionCount < maxConnections; i++) {
        for (let j = i + 1; j < nodes.length && connectionCount < maxConnections; j++) {
          const dist = nodes[i].position.distanceTo(nodes[j].position);
          if (dist < maxDistance) {
            linePositions.push(
              nodes[i].position.x, nodes[i].position.y, nodes[i].position.z,
              nodes[j].position.x, nodes[j].position.y, nodes[j].position.z
            );
            connectionCount++;
          }
        }
      }

      if (linePositions.length > 0) {
        const lineGeom = new THREE.BufferGeometry();
        lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
        linesMesh = new THREE.LineSegments(lineGeom, lineMaterial);
        scene.add(linesMesh);
      }
    }

    // Animation
    let animId;
    let frameCount = 0;

    function animate() {
      animId = requestAnimationFrame(animate);
      frameCount++;

      const time = Date.now() * 0.001;

      nodes.forEach(node => {
        node.position.x += node.userData.velocity.x;
        node.position.y += node.userData.velocity.y;
        node.position.z += node.userData.velocity.z;

        // Boundaries
        if (Math.abs(node.position.x) > 7) node.userData.velocity.x *= -1;
        if (Math.abs(node.position.y) > 4) node.userData.velocity.y *= -1;
        if (Math.abs(node.position.z) > 2) node.userData.velocity.z *= -1;

        // Pulse
        const pulse = 0.5 + 0.5 * Math.sin(time * 2 + node.userData.pulsePhase);
        node.material.opacity = 0.4 + pulse * 0.6;
        node.scale.setScalar(0.8 + pulse * 0.4);
      });

      // Update lines every 3 frames for performance
      if (frameCount % 3 === 0) {
        updateLines();
      }

      renderer.render(scene, camera);
    }

    animate();

    // Resize
    window.addEventListener('resize', () => {
      if (window.innerWidth < 768) {
        cancelAnimationFrame(animId);
        renderer.dispose();
        return;
      }
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    });

    // Pause when offscreen
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
