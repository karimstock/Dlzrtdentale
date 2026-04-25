/**
 * JADOMI Triangle - Photo Tools Module
 * Camera guides, annotation, templates, voice/video recording
 * Works on mobile (touch) and desktop (mouse). Dark theme compatible.
 * Namespace: window.JADOMI_PHOTO_TOOLS
 */
(function () {
  'use strict';

  // ─────────────────────────────────────────────
  // 1. PHOTO GUIDE OVERLAYS
  // ─────────────────────────────────────────────

  const PHOTO_GUIDES = {
    teinte: {
      title: 'Photo teinte',
      instructions: 'Placez le teintier VITA a cote de la dent',
      overlaySVG: function (w, h) {
        var cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.22;
        return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" stroke="#00e5ff" stroke-width="2" fill="none" stroke-dasharray="8 4"/>' +
          '<line x1="' + (cx + r + 10) + '" y1="' + cy + '" x2="' + (cx + r + 50) + '" y2="' + (cy - 30) + '" stroke="#00e5ff" stroke-width="2" marker-end="url(#arrowhead)"/>' +
          '<text x="' + (cx + r + 55) + '" y="' + (cy - 35) + '" fill="#00e5ff" font-size="14" font-family="sans-serif">VITA</text>';
      },
      tips: ['Eclairage naturel', 'Pas de flash', 'Fond neutre gris']
    },
    urgence_dent: {
      title: 'Photo urgence dentaire',
      instructions: 'Ouvrez la bouche et photographiez la zone concernee',
      overlaySVG: function (w, h) {
        var cx = w / 2, cy = h / 2, rx = Math.min(w, h) * 0.25, ry = rx * 0.6;
        return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" stroke="#ff5252" stroke-width="2" fill="none" stroke-dasharray="8 4"/>' +
          '<circle cx="' + cx + '" cy="' + (cy - ry * 0.3) + '" r="' + (ry * 0.35) + '" stroke="#ffab40" stroke-width="1.5" fill="none" stroke-dasharray="4 3"/>' +
          '<text x="' + cx + '" y="' + (cy + ry + 25) + '" fill="#ff5252" font-size="13" font-family="sans-serif" text-anchor="middle">Zone cible</text>';
      },
      tips: ['Bonne lumiere', 'Aussi pres que possible', 'Plusieurs angles']
    },
    plaie: {
      title: 'Photo plaie',
      instructions: 'Placez une regle graduee a cote de la plaie',
      overlaySVG: function (w, h) {
        var cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.18;
        var rx = cx + r + 20, ry1 = cy - r, ry2 = cy + r;
        var svg = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" stroke="#ff5252" stroke-width="2" fill="none" stroke-dasharray="8 4"/>';
        svg += '<rect x="' + rx + '" y="' + ry1 + '" width="20" height="' + (ry2 - ry1) + '" stroke="#00e5ff" stroke-width="1.5" fill="none" rx="2"/>';
        for (var i = 0; i <= 5; i++) {
          var yy = ry1 + i * ((ry2 - ry1) / 5);
          svg += '<line x1="' + rx + '" y1="' + yy + '" x2="' + (rx + 10) + '" y2="' + yy + '" stroke="#00e5ff" stroke-width="1"/>';
        }
        svg += '<text x="' + (rx + 10) + '" y="' + (ry1 - 8) + '" fill="#00e5ff" font-size="11" font-family="sans-serif" text-anchor="middle">cm</text>';
        return svg;
      },
      tips: ['Regle visible', 'Eclairage direct', 'Fond propre']
    },
    intra_oral: {
      title: 'Photo intra-orale',
      instructions: 'Utilisez un ecarteur ou ouvrez grand',
      overlaySVG: function (w, h) {
        var cx = w / 2, cy = h / 2, s = Math.min(w, h) * 0.28;
        return '<path d="M' + (cx - s) + ',' + cy + ' Q' + (cx - s * 0.8) + ',' + (cy - s) + ' ' + cx + ',' + (cy - s * 0.9) +
          ' Q' + (cx + s * 0.8) + ',' + (cy - s) + ' ' + (cx + s) + ',' + cy +
          ' Q' + (cx + s * 0.8) + ',' + (cy + s * 0.6) + ' ' + cx + ',' + (cy + s * 0.5) +
          ' Q' + (cx - s * 0.8) + ',' + (cy + s * 0.6) + ' ' + (cx - s) + ',' + cy + ' Z"' +
          ' stroke="#00e5ff" stroke-width="2" fill="none" stroke-dasharray="8 4"/>';
      },
      tips: ['Miroir intra-oral si possible', 'Flash annulaire ideal']
    },
    fabrication: {
      title: 'Photo fabrication',
      instructions: 'Photographiez la prothese sur le modele',
      overlaySVG: function (w, h) {
        var cx = w / 2, cy = h / 2, s = Math.min(w, h) * 0.25;
        return '<rect x="' + (cx - s) + '" y="' + (cy - s * 0.6) + '" width="' + (s * 2) + '" height="' + (s * 1.2) + '" rx="12" stroke="#00e5ff" stroke-width="2" fill="none" stroke-dasharray="8 4"/>' +
          '<text x="' + cx + '" y="' + (cy + s * 0.6 + 22) + '" fill="#00e5ff" font-size="12" font-family="sans-serif" text-anchor="middle">Modele</text>';
      },
      tips: ['Fond neutre', 'Plusieurs angles', 'Avec teintier si teinte']
    },
    visage: {
      title: 'Photo visage (gonflement)',
      instructions: 'Photo de face, bien eclairee',
      overlaySVG: function (w, h) {
        var cx = w / 2, cy = h / 2, rx = Math.min(w, h) * 0.2, ry = rx * 1.3;
        return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" stroke="#00e5ff" stroke-width="2" fill="none" stroke-dasharray="8 4"/>' +
          '<line x1="' + cx + '" y1="' + (cy - ry - 10) + '" x2="' + cx + '" y2="' + (cy + ry + 10) + '" stroke="#ffab40" stroke-width="1" stroke-dasharray="4 4"/>' +
          '<text x="' + cx + '" y="' + (cy + ry + 28) + '" fill="#ffab40" font-size="11" font-family="sans-serif" text-anchor="middle">Axe de symetrie</text>';
      },
      tips: ['Face + profil', 'Avec et sans sourire', 'Bonne lumiere']
    }
  };

  // Inject base styles once
  function injectStyles() {
    if (document.getElementById('jadomi-photo-tools-css')) return;
    var style = document.createElement('style');
    style.id = 'jadomi-photo-tools-css';
    style.textContent = [
      '.jpt-overlay{position:fixed;inset:0;z-index:99999;background:#000;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#fff;touch-action:none;}',
      '.jpt-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:rgba(0,0,0,.85);flex-shrink:0;}',
      '.jpt-header h3{margin:0;font-size:16px;font-weight:600;}',
      '.jpt-close{background:none;border:none;color:#fff;font-size:28px;cursor:pointer;padding:0 8px;line-height:1;}',
      '.jpt-body{flex:1;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;}',
      '.jpt-video{width:100%;height:100%;object-fit:cover;}',
      '.jpt-guide-svg{position:absolute;inset:0;pointer-events:none;}',
      '.jpt-instructions{position:absolute;top:12px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.7);padding:8px 16px;border-radius:20px;font-size:14px;text-align:center;max-width:90%;backdrop-filter:blur(4px);}',
      '.jpt-tips{padding:10px 16px;background:rgba(0,0,0,.85);display:flex;gap:8px;flex-wrap:wrap;flex-shrink:0;justify-content:center;}',
      '.jpt-tip{background:rgba(0,229,255,.15);color:#00e5ff;padding:4px 12px;border-radius:12px;font-size:12px;white-space:nowrap;}',
      '.jpt-controls{display:flex;align-items:center;justify-content:center;gap:24px;padding:20px 16px 32px;background:rgba(0,0,0,.85);flex-shrink:0;}',
      '.jpt-capture-btn{width:68px;height:68px;border-radius:50%;border:4px solid #fff;background:transparent;cursor:pointer;position:relative;transition:transform .1s;}',
      '.jpt-capture-btn:active{transform:scale(.9);}',
      '.jpt-capture-btn::after{content:"";position:absolute;inset:6px;border-radius:50%;background:#fff;transition:background .15s;}',
      '.jpt-capture-btn.recording::after{background:#ff5252;}',
      '.jpt-secondary-btn{background:rgba(255,255,255,.15);border:none;color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;cursor:pointer;backdrop-filter:blur(4px);}',
      '.jpt-secondary-btn:hover{background:rgba(255,255,255,.25);}',
      /* Annotation */
      '.jpt-anno-toolbar{display:flex;align-items:center;gap:6px;padding:10px 12px;background:rgba(0,0,0,.9);flex-shrink:0;flex-wrap:wrap;justify-content:center;}',
      '.jpt-anno-btn{width:40px;height:40px;border-radius:8px;border:2px solid transparent;background:rgba(255,255,255,.12);color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;}',
      '.jpt-anno-btn.active{border-color:#00e5ff;background:rgba(0,229,255,.2);}',
      '.jpt-anno-btn:hover{background:rgba(255,255,255,.2);}',
      '.jpt-color-dot{width:22px;height:22px;border-radius:50%;border:2px solid transparent;cursor:pointer;transition:transform .1s;}',
      '.jpt-color-dot.active{border-color:#fff;transform:scale(1.2);}',
      /* Template selector */
      '.jpt-modal-bg{position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(2px);}',
      '.jpt-modal{background:#1e1e2e;color:#fff;border-radius:20px 20px 0 0;width:100%;max-width:480px;max-height:80vh;overflow-y:auto;padding:0;animation:jptSlideUp .25s ease-out;}',
      '.jpt-modal-full{border-radius:16px;max-height:90vh;margin:20px;}',
      '@keyframes jptSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}',
      '.jpt-modal-header{padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.1);display:flex;justify-content:space-between;align-items:center;}',
      '.jpt-modal-header h3{margin:0;font-size:17px;}',
      '.jpt-modal-body{padding:12px 20px 24px;}',
      '.jpt-tpl-btn{display:block;width:100%;text-align:left;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;padding:14px 16px;border-radius:12px;margin-bottom:8px;cursor:pointer;font-size:14px;transition:background .15s;}',
      '.jpt-tpl-btn:hover{background:rgba(255,255,255,.12);}',
      '.jpt-tpl-btn strong{display:block;margin-bottom:4px;color:#00e5ff;}',
      '.jpt-tpl-btn span{opacity:.7;font-size:13px;}',
      /* Recording indicator */
      '.jpt-rec-indicator{display:flex;align-items:center;gap:8px;font-size:14px;color:#ff5252;font-weight:600;}',
      '.jpt-rec-dot{width:12px;height:12px;border-radius:50%;background:#ff5252;animation:jptBlink 1s infinite;}',
      '@keyframes jptBlink{0%,100%{opacity:1}50%{opacity:.3}}',
      /* Consent */
      '.jpt-consent-body label{display:flex;align-items:flex-start;gap:10px;margin:16px 0;cursor:pointer;font-size:14px;}',
      '.jpt-consent-body input[type=checkbox]{width:20px;height:20px;flex-shrink:0;margin-top:2px;accent-color:#00e5ff;}',
      '.jpt-consent-body .jpt-rgpd{font-size:12px;opacity:.6;margin-top:12px;line-height:1.5;}',
      '.jpt-consent-actions{display:flex;gap:10px;margin-top:16px;}',
      '.jpt-btn-primary{flex:1;padding:12px;border:none;border-radius:10px;background:#00e5ff;color:#000;font-weight:600;font-size:15px;cursor:pointer;transition:opacity .15s;}',
      '.jpt-btn-primary:disabled{opacity:.4;cursor:not-allowed;}',
      '.jpt-btn-cancel{flex:1;padding:12px;border:1px solid rgba(255,255,255,.2);border-radius:10px;background:transparent;color:#fff;font-size:15px;cursor:pointer;}',
      /* Preview */
      '.jpt-preview-img{max-width:100%;max-height:60vh;object-fit:contain;border-radius:8px;display:block;margin:0 auto;}',
      '.jpt-timer{font-size:14px;color:#fff;font-variant-numeric:tabular-nums;}',
      /* Fallback guide */
      '.jpt-fallback{padding:24px;text-align:center;}',
      '.jpt-fallback svg{max-width:280px;margin:0 auto 16px;display:block;}',
      '.jpt-fallback p{font-size:14px;opacity:.8;margin:8px 0;}'
    ].join('\n');
    document.head.appendChild(style);
  }

  // Utility: create element shorthand
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'className') e.className = attrs[k];
      else if (k === 'textContent') e.textContent = attrs[k];
      else if (k === 'innerHTML') e.innerHTML = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    if (children) children.forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

  // Remove overlay helper
  function removeOverlay(overlay, stream) {
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  // ─────────────────────────────────────────────
  // showCameraGuide(photoType) -> Promise<Blob|null>
  // ─────────────────────────────────────────────
  function showCameraGuide(photoType) {
    injectStyles();
    var guide = PHOTO_GUIDES[photoType] || PHOTO_GUIDES.intra_oral;

    return new Promise(function (resolve) {
      var stream = null;
      var overlay = el('div', { className: 'jpt-overlay' });

      // Header
      var header = el('div', { className: 'jpt-header' }, [
        el('h3', { textContent: guide.title }),
        el('button', { className: 'jpt-close', textContent: '\u00d7', onClick: function () { removeOverlay(overlay, stream); resolve(null); } })
      ]);
      overlay.appendChild(header);

      // Body container
      var body = el('div', { className: 'jpt-body' });
      overlay.appendChild(body);

      // Tips
      var tipsBar = el('div', { className: 'jpt-tips' });
      guide.tips.forEach(function (tip) {
        tipsBar.appendChild(el('span', { className: 'jpt-tip', textContent: tip }));
      });
      overlay.appendChild(tipsBar);

      // Controls
      var controls = el('div', { className: 'jpt-controls' });
      var captureBtn = el('button', { className: 'jpt-capture-btn', onClick: capturePhoto });
      controls.appendChild(captureBtn);
      overlay.appendChild(controls);

      document.body.appendChild(overlay);

      // Try camera
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } })
          .then(function (s) {
            stream = s;
            var video = el('video', { className: 'jpt-video', autoplay: '', playsinline: '' });
            video.srcObject = stream;
            video.play();
            body.appendChild(video);

            // SVG overlay
            var svgWrap = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svgWrap.setAttribute('class', 'jpt-guide-svg');
            svgWrap.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';

            function updateSVG() {
              var w = body.offsetWidth, h = body.offsetHeight;
              svgWrap.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
              svgWrap.innerHTML = '<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#00e5ff"/></marker></defs>' +
                (guide.overlaySVG ? guide.overlaySVG(w, h) : '');
            }
            updateSVG();
            body.appendChild(svgWrap);
            window.addEventListener('resize', updateSVG);

            // Instructions badge
            body.appendChild(el('div', { className: 'jpt-instructions', textContent: guide.instructions }));

            // Capture function
            function capturePhoto() {
              var canvas = document.createElement('canvas');
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              canvas.getContext('2d').drawImage(video, 0, 0);
              canvas.toBlob(function (blob) {
                removeOverlay(overlay, stream);
                window.removeEventListener('resize', updateSVG);
                resolve(blob);
              }, 'image/jpeg', 0.92);
            }
            captureBtn.onclick = capturePhoto;
          })
          .catch(function () {
            showFallbackGuide(body, guide, overlay, resolve);
          });
      } else {
        showFallbackGuide(body, guide, overlay, resolve);
      }
    });
  }

  // Fallback: file input with static guide
  function showFallbackGuide(body, guide, overlay, resolve) {
    body.innerHTML = '';
    var fallback = el('div', { className: 'jpt-fallback' });

    // Static guide SVG
    var svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.setAttribute('viewBox', '0 0 300 200');
    svgEl.setAttribute('width', '280');
    svgEl.style.cssText = 'display:block;margin:0 auto 16px;';
    svgEl.innerHTML = '<rect width="300" height="200" rx="12" fill="#2a2a3e"/>' +
      (guide.overlaySVG ? guide.overlaySVG(300, 200) : '') +
      '<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#00e5ff"/></marker></defs>';
    fallback.appendChild(svgEl);

    fallback.appendChild(el('p', { innerHTML: '<strong>' + guide.title + '</strong>' }));
    fallback.appendChild(el('p', { textContent: guide.instructions }));

    var fileInput = el('input', { type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none' });
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) {
        resolve(fileInput.files[0]);
        removeOverlay(overlay, null);
      }
    });
    fallback.appendChild(fileInput);

    var btn = el('button', { className: 'jpt-secondary-btn', textContent: 'Choisir une photo', onClick: function () { fileInput.click(); } });
    fallback.appendChild(btn);
    body.appendChild(fallback);

    // Update the main capture button too
    var mainCapture = overlay.querySelector('.jpt-capture-btn');
    if (mainCapture) mainCapture.onclick = function () { fileInput.click(); };
  }

  // ─────────────────────────────────────────────
  // 2. ANNOTATION TOOL
  // openAnnotationEditor(imageUrl) -> Promise<Blob|null>
  // ─────────────────────────────────────────────
  function openAnnotationEditor(imageUrl) {
    injectStyles();

    return new Promise(function (resolve) {
      var overlay = el('div', { className: 'jpt-overlay' });
      var currentTool = 'circle';
      var currentColor = '#ff5252';
      var history = [];
      var drawing = false;
      var startX = 0, startY = 0;

      // Header
      overlay.appendChild(el('div', { className: 'jpt-header' }, [
        el('h3', { textContent: 'Annoter la photo' }),
        el('button', { className: 'jpt-close', textContent: '\u00d7', onClick: function () { removeOverlay(overlay, null); resolve(null); } })
      ]));

      // Body
      var body = el('div', { className: 'jpt-body' });
      overlay.appendChild(body);

      // Load image
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        var containerW = body.offsetWidth || window.innerWidth;
        var containerH = body.offsetHeight || window.innerHeight - 160;
        var scale = Math.min(containerW / img.width, containerH / img.height, 1);
        var cw = Math.round(img.width * scale);
        var ch = Math.round(img.height * scale);

        // Background canvas (image)
        var bgCanvas = document.createElement('canvas');
        bgCanvas.width = cw;
        bgCanvas.height = ch;
        bgCanvas.style.cssText = 'position:absolute;border-radius:4px;';
        bgCanvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
        body.appendChild(bgCanvas);

        // Drawing canvas
        var drawCanvas = document.createElement('canvas');
        drawCanvas.width = cw;
        drawCanvas.height = ch;
        drawCanvas.style.cssText = 'position:absolute;border-radius:4px;cursor:crosshair;touch-action:none;';
        body.appendChild(drawCanvas);

        var ctx = drawCanvas.getContext('2d');

        // Snapshot current state
        function saveState() {
          history.push(ctx.getImageData(0, 0, cw, ch));
          if (history.length > 30) history.shift();
        }

        function getPos(e) {
          var rect = drawCanvas.getBoundingClientRect();
          var touch = e.touches ? e.touches[0] : e;
          return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
        }

        function onStart(e) {
          e.preventDefault();
          drawing = true;
          var p = getPos(e);
          startX = p.x;
          startY = p.y;
          if (currentTool === 'text') {
            saveState();
            var text = prompt('Texte :');
            if (text) {
              ctx.font = 'bold 16px sans-serif';
              ctx.fillStyle = currentColor;
              ctx.fillText(text, startX, startY);
            }
            drawing = false;
          }
        }

        function onMove(e) {
          if (!drawing) return;
          e.preventDefault();
        }

        function onEnd(e) {
          if (!drawing) return;
          drawing = false;
          var p;
          if (e.changedTouches) p = { x: e.changedTouches[0].clientX - drawCanvas.getBoundingClientRect().left, y: e.changedTouches[0].clientY - drawCanvas.getBoundingClientRect().top };
          else p = getPos(e);

          saveState();
          ctx.strokeStyle = currentColor;
          ctx.lineWidth = 2.5;
          ctx.fillStyle = 'transparent';

          if (currentTool === 'circle') {
            var rx = Math.abs(p.x - startX) / 2;
            var ry = Math.abs(p.y - startY) / 2;
            var cx = (startX + p.x) / 2;
            var cy = (startY + p.y) / 2;
            ctx.beginPath();
            ctx.ellipse(cx, cy, Math.max(rx, 5), Math.max(ry, 5), 0, 0, Math.PI * 2);
            ctx.stroke();
          } else if (currentTool === 'arrow') {
            var angle = Math.atan2(p.y - startY, p.x - startX);
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            // Arrowhead
            var headLen = 14;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - headLen * Math.cos(angle - 0.4), p.y - headLen * Math.sin(angle - 0.4));
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - headLen * Math.cos(angle + 0.4), p.y - headLen * Math.sin(angle + 0.4));
            ctx.stroke();
          }
        }

        // Events (touch + mouse)
        drawCanvas.addEventListener('mousedown', onStart);
        drawCanvas.addEventListener('mousemove', onMove);
        drawCanvas.addEventListener('mouseup', onEnd);
        drawCanvas.addEventListener('touchstart', onStart, { passive: false });
        drawCanvas.addEventListener('touchmove', onMove, { passive: false });
        drawCanvas.addEventListener('touchend', onEnd);

        // Undo
        function undo() {
          if (history.length > 0) {
            ctx.putImageData(history.pop(), 0, 0);
          } else {
            ctx.clearRect(0, 0, cw, ch);
          }
        }

        // Done - merge canvases
        function done() {
          var merged = document.createElement('canvas');
          merged.width = img.width;
          merged.height = img.height;
          var mctx = merged.getContext('2d');
          mctx.drawImage(img, 0, 0);
          mctx.drawImage(drawCanvas, 0, 0, img.width, img.height);
          merged.toBlob(function (blob) {
            removeOverlay(overlay, null);
            resolve(blob);
          }, 'image/jpeg', 0.92);
        }

        // Toolbar
        var toolbar = el('div', { className: 'jpt-anno-toolbar' });

        var tools = [
          { id: 'circle', icon: '\u25ef' },
          { id: 'arrow', icon: '\u2191' },
          { id: 'text', icon: 'T' }
        ];
        var toolBtns = {};
        tools.forEach(function (t) {
          var btn = el('button', {
            className: 'jpt-anno-btn' + (t.id === currentTool ? ' active' : ''),
            textContent: t.icon,
            onClick: function () {
              currentTool = t.id;
              Object.keys(toolBtns).forEach(function (k) { toolBtns[k].classList.toggle('active', k === t.id); });
            }
          });
          toolBtns[t.id] = btn;
          toolbar.appendChild(btn);
        });

        // Separator
        toolbar.appendChild(el('div', { style: 'width:1px;height:28px;background:rgba(255,255,255,.2);margin:0 4px;' }));

        // Colors
        var colors = ['#ff5252', '#448aff', '#69f0ae', '#ffffff'];
        colors.forEach(function (c) {
          var dot = el('div', {
            className: 'jpt-color-dot' + (c === currentColor ? ' active' : ''),
            style: 'background:' + c,
            onClick: function () {
              currentColor = c;
              toolbar.querySelectorAll('.jpt-color-dot').forEach(function (d) { d.classList.remove('active'); });
              dot.classList.add('active');
            }
          });
          toolbar.appendChild(dot);
        });

        // Separator
        toolbar.appendChild(el('div', { style: 'width:1px;height:28px;background:rgba(255,255,255,.2);margin:0 4px;' }));

        // Undo
        toolbar.appendChild(el('button', { className: 'jpt-anno-btn', textContent: '\u21a9', onClick: undo }));

        // Done
        toolbar.appendChild(el('button', { className: 'jpt-anno-btn', style: 'background:#00e5ff;color:#000;font-weight:700;width:auto;padding:0 16px;', textContent: 'OK', onClick: done }));

        overlay.appendChild(toolbar);
      };

      img.onerror = function () {
        removeOverlay(overlay, null);
        resolve(null);
      };

      if (imageUrl instanceof Blob) {
        img.src = URL.createObjectURL(imageUrl);
      } else {
        img.src = imageUrl;
      }

      document.body.appendChild(overlay);
    });
  }

  // ─────────────────────────────────────────────
  // 3. REQUEST TEMPLATES
  // showTemplateSelector(profession) -> Promise<{label, message, photo_type}|null>
  // ─────────────────────────────────────────────

  var TEMPLATES = {
    dentiste: [
      { label: 'Photo teinte', message: 'Merci de m\'envoyer une photo teinte avec le teintier VITA place a cote de la dent {dent}', photo_type: 'teinte' },
      { label: 'Photo situation clinique', message: 'Merci de photographier la preparation de la dent {dent}, vue occlusale et vestibulaire', photo_type: 'clinique' },
      { label: 'Photo essayage', message: 'Merci de photographier l\'essayage sur le modele avant cuisson', photo_type: 'essayage' },
      { label: 'Urgence patient', message: 'Pouvez-vous m\'envoyer une photo de la zone douloureuse ? Ouvrez bien la bouche.', photo_type: 'urgence' }
    ],
    kine: [
      { label: 'Photo amplitude', message: 'Photographiez votre amplitude de mouvement maximale', photo_type: 'suivi' },
      { label: 'Photo posture', message: 'Prenez une photo debout de face et de profil', photo_type: 'clinique' }
    ],
    infirmier: [
      { label: 'Photo plaie', message: 'Photographiez la plaie avec une regle a cote pour l\'echelle', photo_type: 'plaie' },
      { label: 'Photo pansement', message: 'Photo du pansement apres le soin', photo_type: 'suivi' }
    ],
    dermatologue: [
      { label: 'Photo lesion', message: 'Photographiez la lesion avec un eclairage naturel, en gros plan', photo_type: 'clinique' },
      { label: 'Photo evolution', message: 'Prenez une photo au meme angle que la derniere fois', photo_type: 'suivi' }
    ]
  };

  function showTemplateSelector(profession) {
    injectStyles();
    var templates = TEMPLATES[profession] || TEMPLATES.dentiste;

    return new Promise(function (resolve) {
      var bg = el('div', { className: 'jpt-modal-bg', onClick: function (e) { if (e.target === bg) { bg.remove(); resolve(null); } } });
      var modal = el('div', { className: 'jpt-modal' });

      modal.appendChild(el('div', { className: 'jpt-modal-header' }, [
        el('h3', { textContent: 'Demander une photo' }),
        el('button', { className: 'jpt-close', textContent: '\u00d7', onClick: function () { bg.remove(); resolve(null); } })
      ]));

      var body = el('div', { className: 'jpt-modal-body' });
      templates.forEach(function (tpl) {
        var btn = el('button', { className: 'jpt-tpl-btn', onClick: function () {
          bg.remove();
          resolve({ label: tpl.label, message: tpl.message, photo_type: tpl.photo_type });
        } }, [
          el('strong', { textContent: tpl.label }),
          el('span', { textContent: tpl.message })
        ]);
        body.appendChild(btn);
      });
      modal.appendChild(body);
      bg.appendChild(modal);
      document.body.appendChild(bg);
    });
  }

  // ─────────────────────────────────────────────
  // 4. VOICE NOTE RECORDER
  // recordVoiceNote() -> Promise<Blob|null>
  // ─────────────────────────────────────────────
  function recordVoiceNote() {
    injectStyles();

    return new Promise(function (resolve) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Enregistrement audio non supporte sur ce navigateur.');
        return resolve(null);
      }

      var overlay = el('div', { className: 'jpt-overlay' });
      overlay.style.background = 'rgba(0,0,0,.92)';
      var recorder = null;
      var chunks = [];
      var timerInterval = null;
      var seconds = 0;
      var maxSeconds = 60;
      var stream = null;

      // Header
      overlay.appendChild(el('div', { className: 'jpt-header' }, [
        el('h3', { textContent: 'Note vocale' }),
        el('button', { className: 'jpt-close', textContent: '\u00d7', onClick: cancel })
      ]));

      // Body with big indicator
      var body = el('div', { className: 'jpt-body', style: 'flex-direction:column;gap:20px;' });

      var recIndicator = el('div', { className: 'jpt-rec-indicator', style: 'font-size:18px;' }, [
        el('div', { className: 'jpt-rec-dot' }),
        el('span', { textContent: 'Enregistrement...' })
      ]);
      recIndicator.style.display = 'none';
      body.appendChild(recIndicator);

      var timerDisplay = el('div', { className: 'jpt-timer', style: 'font-size:48px;font-weight:300;' });
      timerDisplay.textContent = '0:00';
      body.appendChild(timerDisplay);

      var progressBar = el('div', { style: 'width:80%;max-width:300px;height:4px;background:rgba(255,255,255,.15);border-radius:2px;overflow:hidden;' });
      var progressFill = el('div', { style: 'width:0%;height:100%;background:#ff5252;transition:width 1s linear;border-radius:2px;' });
      progressBar.appendChild(progressFill);
      body.appendChild(progressBar);

      overlay.appendChild(body);

      // Controls
      var controls = el('div', { className: 'jpt-controls' });
      var recordBtn = el('button', { className: 'jpt-capture-btn recording', onClick: stopRecording });
      controls.appendChild(recordBtn);
      overlay.appendChild(controls);

      document.body.appendChild(overlay);

      function cancel() {
        clearInterval(timerInterval);
        if (recorder && recorder.state !== 'inactive') recorder.stop();
        removeOverlay(overlay, stream);
        resolve(null);
      }

      function formatTime(s) {
        return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
      }

      function stopRecording() {
        clearInterval(timerInterval);
        if (recorder && recorder.state !== 'inactive') recorder.stop();
      }

      // Start recording
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
        stream = s;
        recorder = new MediaRecorder(s, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm' });
        recorder.ondataavailable = function (e) { if (e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = function () {
          var blob = new Blob(chunks, { type: recorder.mimeType });
          removeOverlay(overlay, stream);
          resolve(blob);
        };
        recorder.start();
        recIndicator.style.display = 'flex';

        timerInterval = setInterval(function () {
          seconds++;
          timerDisplay.textContent = formatTime(seconds);
          progressFill.style.width = Math.min((seconds / maxSeconds) * 100, 100) + '%';
          if (seconds >= maxSeconds) stopRecording();
        }, 1000);
      }).catch(function () {
        alert('Impossible d\'acceder au microphone.');
        removeOverlay(overlay, null);
        resolve(null);
      });
    });
  }

  // ─────────────────────────────────────────────
  // 5. VIDEO CLIP RECORDER
  // recordVideoClip() -> Promise<Blob|null>
  // ─────────────────────────────────────────────
  function recordVideoClip() {
    injectStyles();

    return new Promise(function (resolve) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Enregistrement video non supporte.');
        return resolve(null);
      }

      var overlay = el('div', { className: 'jpt-overlay' });
      var recorder = null;
      var chunks = [];
      var timerInterval = null;
      var seconds = 0;
      var maxSeconds = 15;
      var stream = null;
      var isRecording = false;

      // Header
      overlay.appendChild(el('div', { className: 'jpt-header' }, [
        el('h3', { textContent: 'Video clip (15s max)' }),
        el('button', { className: 'jpt-close', textContent: '\u00d7', onClick: cancel })
      ]));

      // Body
      var body = el('div', { className: 'jpt-body' });
      overlay.appendChild(body);

      // Timer + rec indicator bar
      var statusBar = el('div', { style: 'position:absolute;top:12px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;background:rgba(0,0,0,.7);padding:6px 14px;border-radius:20px;z-index:2;' });
      var recDot = el('div', { className: 'jpt-rec-dot', style: 'display:none;' });
      var timerDisplay = el('span', { className: 'jpt-timer', textContent: '0:15' });
      statusBar.appendChild(recDot);
      statusBar.appendChild(timerDisplay);
      body.appendChild(statusBar);

      // Controls
      var controls = el('div', { className: 'jpt-controls' });
      var captureBtn = el('button', { className: 'jpt-capture-btn', onClick: toggleRecording });
      controls.appendChild(captureBtn);
      overlay.appendChild(controls);

      document.body.appendChild(overlay);

      function cancel() {
        clearInterval(timerInterval);
        if (recorder && recorder.state !== 'inactive') recorder.stop();
        removeOverlay(overlay, stream);
        resolve(null);
      }

      function formatTime(s) {
        return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
      }

      function toggleRecording() {
        if (!isRecording) {
          startRecording();
        } else {
          stopRecording();
        }
      }

      function startRecording() {
        isRecording = true;
        captureBtn.classList.add('recording');
        recDot.style.display = 'block';
        seconds = 0;

        recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm' });
        recorder.ondataavailable = function (e) { if (e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = function () {
          clearInterval(timerInterval);
          var blob = new Blob(chunks, { type: recorder.mimeType });
          showPreview(blob);
        };
        recorder.start();

        timerInterval = setInterval(function () {
          seconds++;
          timerDisplay.textContent = formatTime(maxSeconds - seconds);
          if (seconds >= maxSeconds) stopRecording();
        }, 1000);
      }

      function stopRecording() {
        isRecording = false;
        captureBtn.classList.remove('recording');
        recDot.style.display = 'none';
        if (recorder && recorder.state !== 'inactive') recorder.stop();
      }

      function showPreview(blob) {
        // Replace body content with preview
        body.innerHTML = '';
        statusBar.remove();
        var videoPreview = el('video', { className: 'jpt-video', controls: '', playsinline: '', autoplay: '', style: 'max-height:100%;object-fit:contain;' });
        videoPreview.src = URL.createObjectURL(blob);
        body.appendChild(videoPreview);

        // Replace controls
        controls.innerHTML = '';
        controls.appendChild(el('button', { className: 'jpt-secondary-btn', textContent: 'Reprendre', onClick: function () {
          chunks = [];
          body.innerHTML = '';
          body.appendChild(statusBar);
          recDot.style.display = 'none';
          timerDisplay.textContent = formatTime(maxSeconds);
          var v = el('video', { className: 'jpt-video', autoplay: '', playsinline: '', muted: '' });
          v.srcObject = stream;
          v.play();
          body.appendChild(v);
          controls.innerHTML = '';
          captureBtn.classList.remove('recording');
          controls.appendChild(captureBtn);
        } }));
        controls.appendChild(el('button', { className: 'jpt-secondary-btn', style: 'background:#00e5ff;color:#000;font-weight:600;', textContent: 'Envoyer', onClick: function () {
          removeOverlay(overlay, stream);
          resolve(blob);
        } }));
      }

      // Get camera
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true }).then(function (s) {
        stream = s;
        var video = el('video', { className: 'jpt-video', autoplay: '', playsinline: '', muted: '' });
        video.srcObject = stream;
        video.play();
        body.appendChild(video);
      }).catch(function () {
        alert('Impossible d\'acceder a la camera.');
        removeOverlay(overlay, null);
        resolve(null);
      });
    });
  }

  // ─────────────────────────────────────────────
  // Export namespace
  // ─────────────────────────────────────────────
  window.JADOMI_PHOTO_TOOLS = {
    PHOTO_GUIDES: PHOTO_GUIDES,
    TEMPLATES: TEMPLATES,
    showCameraGuide: showCameraGuide,
    openAnnotationEditor: openAnnotationEditor,
    showTemplateSelector: showTemplateSelector,
    recordVoiceNote: recordVoiceNote,
    recordVideoClip: recordVideoClip
  };

})();
