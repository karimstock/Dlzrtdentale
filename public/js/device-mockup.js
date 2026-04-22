// =============================================
// JADOMI — Device Mockup Component
// MacBook + Browser frames for premium display
// Passe 28
// =============================================
(function() {
  'use strict';

  const CSS = `
/* ===== DEVICE MOCKUP — MACBOOK ===== */
.device-mockup{position:relative;width:100%;margin:0 auto}
.device-mockup.macbook{max-width:100%;perspective:2000px}
.macbook-frame{position:relative;background:linear-gradient(145deg,#2a2a2a,#111);border-radius:16px 16px 0 0;padding:20px 16px 0;transform:rotateX(4deg) rotateY(-3deg);transform-style:preserve-3d;transition:transform 1.2s cubic-bezier(.16,1,.3,1);box-shadow:0 50px 100px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.04),inset 0 1px 0 rgba(255,255,255,.06)}
.device-mockup.macbook:hover .macbook-frame{transform:rotateX(1deg) rotateY(-1deg)}
.macbook-notch{position:absolute;top:5px;left:50%;transform:translateX(-50%);width:100px;height:14px;background:#000;border-radius:0 0 10px 10px;z-index:3}
.macbook-notch::after{content:'';position:absolute;top:4px;left:50%;transform:translateX(-50%);width:6px;height:6px;border-radius:50%;background:#1a1a1a;border:1px solid #333}
.macbook-screen{position:relative;aspect-ratio:16/10;background:#000;border-radius:2px;overflow:hidden;border:1px solid rgba(255,255,255,.08)}
.macbook-screen>*{position:relative;z-index:1}
.screen-reflection{position:absolute;inset:0;z-index:10;background:linear-gradient(135deg,rgba(255,255,255,.1) 0%,transparent 30%,transparent 70%,rgba(255,255,255,.03) 100%);pointer-events:none;mix-blend-mode:overlay}
.macbook-base{position:relative;width:108%;left:-4%;height:12px;background:linear-gradient(180deg,#2a2a2a,#1a1a1a 40%,#111);border-radius:0 0 10px 10px;margin-top:-1px}
.macbook-base::after{content:'';position:absolute;top:0;left:50%;transform:translateX(-50%);width:60px;height:5px;background:linear-gradient(180deg,#333,#222);border-radius:0 0 6px 6px}
.macbook-shadow{position:absolute;bottom:-20px;left:12%;right:12%;height:30px;background:radial-gradient(ellipse,rgba(0,0,0,.45),transparent 70%);filter:blur(15px);z-index:-1}

/* ===== DEVICE MOCKUP — BROWSER ===== */
.device-mockup.browser{max-width:100%;border-radius:14px;overflow:hidden;box-shadow:0 50px 100px rgba(0,0,0,.4),0 0 0 1px rgba(255,255,255,.08),0 0 60px rgba(201,169,97,.08);background:rgba(20,20,24,.95);transform:perspective(1500px) rotateX(2deg);transition:transform .8s cubic-bezier(.16,1,.3,1)}
.device-mockup.browser:hover{transform:perspective(1500px) rotateX(0) translateY(-4px)}
.browser-chrome{display:flex;align-items:center;padding:12px 16px;background:linear-gradient(180deg,#2a2a2e,#202024);border-bottom:1px solid rgba(255,255,255,.05)}
.browser-dots{display:flex;gap:7px;flex-shrink:0}
.browser-dots span{width:12px;height:12px;border-radius:50%}
.browser-dots .d-red{background:#ff5f57}.browser-dots .d-yellow{background:#febc2e}.browser-dots .d-green{background:#28c840}
.browser-url-bar{flex:1;max-width:480px;margin:0 16px;padding:6px 12px;background:rgba(0,0,0,.25);border-radius:7px;display:flex;align-items:center;gap:6px;color:rgba(255,255,255,.6);font-size:.82rem;font-family:-apple-system,'SF Pro',sans-serif}
.browser-url-bar svg{width:12px;height:12px;fill:#22c55e;flex-shrink:0}
.browser-actions{display:flex;gap:8px}
.browser-actions svg{width:16px;height:16px;fill:rgba(255,255,255,.35)}
.browser-viewport{position:relative;aspect-ratio:16/10;background:#0a0a0f;overflow:hidden}
.browser-viewport>*{position:relative;z-index:1}
.browser-reflection{position:absolute;inset:0;z-index:10;background:linear-gradient(135deg,rgba(255,255,255,.06) 0%,transparent 25%);pointer-events:none}

/* ===== SHARED ===== */
.device-mockup .slider-frame{border-radius:0!important;box-shadow:none!important;border:none!important}
.device-mockup .slide-mockup{border-radius:0!important;border:none!important;box-shadow:none!important;height:100%}
.device-mockup .mockup-body{min-height:auto!important}
.device-mockup .slide-caption{position:relative;bottom:auto;padding:1rem 1.5rem;background:rgba(0,0,0,.6);backdrop-filter:blur(8px);text-align:left;opacity:1!important}
.device-mockup .slider-dots{position:relative;bottom:auto;padding:.75rem 0;display:flex;justify-content:center;gap:.4rem;background:rgba(0,0,0,.3)}

/* ===== VIDEO INSIDE DEVICE ===== */
.device-video{width:100%;height:100%;object-fit:cover;display:block}
.video-play-btn{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:20;width:72px;height:72px;border-radius:50%;background:rgba(201,169,97,.9);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 30px rgba(201,169,97,.4);transition:all .4s cubic-bezier(.16,1,.3,1)}
.video-play-btn:hover{transform:translate(-50%,-50%) scale(1.1);box-shadow:0 12px 50px rgba(201,169,97,.6)}
.video-play-btn svg{width:24px;height:24px;fill:#1a1a1a;margin-left:3px}
.video-play-btn .pulse-ring{position:absolute;inset:-10px;border-radius:50%;border:2px solid rgba(201,169,97,.5);animation:vpPulse 2s ease-out infinite}
.video-play-btn.hidden{display:none}
@keyframes vpPulse{0%{transform:scale(.9);opacity:1}100%{transform:scale(1.5);opacity:0}}

/* ===== DEMO VIDEO SECTION ===== */
.demo-video-section{padding:6rem 5%;text-align:center;position:relative}
.demo-video-section h2{font-family:'Syne',serif;font-size:clamp(1.8rem,4vw,3rem);color:#fff;margin-bottom:.75rem}
.demo-video-section .section-sub{color:rgba(255,255,255,.65);font-size:1.1rem;margin-bottom:3rem;max-width:600px;margin-left:auto;margin-right:auto}
.video-chapters{display:flex;gap:.6rem;justify-content:center;flex-wrap:wrap;margin-top:1.5rem}
.chapter{padding:.45rem .9rem;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:99px;color:rgba(255,255,255,.6);font-size:.82rem;cursor:pointer;transition:all .3s;font-family:inherit}
.chapter:hover,.chapter.active{background:rgba(201,169,97,.12);color:#c9a961;border-color:rgba(201,169,97,.25)}

@media(max-width:768px){.macbook-frame{padding:12px 10px 0;border-radius:10px 10px 0 0;transform:rotateX(2deg) rotateY(0)}.macbook-base{width:104%;left:-2%;height:8px}.browser-url-bar{display:none}.browser-chrome{padding:10px 12px}}
@media(prefers-reduced-motion:reduce){.macbook-frame,.device-mockup.browser{transform:none!important;transition:none!important}}
`;

  // Inject CSS once
  if (!document.getElementById('device-mockup-css')) {
    const s = document.createElement('style');
    s.id = 'device-mockup-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // Scroll parallax for MacBook frames
  function initParallax() {
    const macbooks = document.querySelectorAll('.device-mockup.macbook');
    if (!macbooks.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const onScroll = () => {
      macbooks.forEach(mb => {
        const rect = mb.getBoundingClientRect();
        const vh = window.innerHeight;
        if (rect.top > vh || rect.bottom < 0) return;
        const progress = Math.max(0, Math.min(1, (vh - rect.top) / (vh * 0.7)));
        const rotX = 4 - (progress * 4);
        const rotY = -3 + (progress * 3);
        const frame = mb.querySelector('.macbook-frame');
        if (frame) frame.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
      });
    };
    window.addEventListener('scroll', () => requestAnimationFrame(onScroll), { passive: true });
    onScroll();
  }

  // Video play/pause
  function initVideoPlayers() {
    document.querySelectorAll('.device-mockup [data-video-play]').forEach(btn => {
      btn.addEventListener('click', () => {
        const container = btn.closest('.macbook-screen, .browser-viewport');
        const video = container?.querySelector('.device-video');
        if (!video) return;
        video.play();
        btn.classList.add('hidden');
        video.addEventListener('pause', () => btn.classList.remove('hidden'), { once: false });
        video.addEventListener('ended', () => btn.classList.remove('hidden'), { once: false });
      });
    });
  }

  // Chapter navigation
  function initChapters() {
    document.querySelectorAll('.chapter[data-time]').forEach(ch => {
      ch.addEventListener('click', () => {
        const section = ch.closest('.demo-video-section');
        const video = section?.querySelector('.device-video');
        if (!video) return;
        video.currentTime = parseFloat(ch.dataset.time);
        video.play();
        const playBtn = section.querySelector('[data-video-play]');
        if (playBtn) playBtn.classList.add('hidden');
      });
    });
  }

  // Init on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    initParallax();
    initVideoPlayers();
    initChapters();
  });

  // Export for manual use
  window.JadomiDevice = { initParallax, initVideoPlayers, initChapters };
})();
