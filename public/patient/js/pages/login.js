/* ═══════════════════════════════════════════════
   JADOMI Patient — Login Page
   Phone + OTP authentication
   ═══════════════════════════════════════════════ */

Router.register('/login', async (container) => {
  // Get cabinet from URL param
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const cabinetSlug = params.get('cabinet') || '';
  const cabinetName = cabinetSlug
    ? decodeURIComponent(cabinetSlug).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'JADOMI';

  let step = 'phone'; // phone | otp
  let phone = '';

  render();

  function render() {
    if (step === 'phone') renderPhoneStep();
    else renderOTPStep();
  }

  function renderPhoneStep() {
    container.innerHTML = `
      <div class="login-page">
        <div class="login-logo"><span>J</span></div>
        <h1 class="login-title">${cabinetName}</h1>
        <p class="login-subtitle">Connectez-vous a votre espace patient</p>

        <form class="login-form" id="phone-form">
          <div class="input-group mb-md">
            <label for="phone">Numero de telephone</label>
            <div class="phone-input-wrapper">
              <span class="phone-prefix">+33</span>
              <input
                type="tel"
                id="phone"
                inputmode="numeric"
                autocomplete="tel"
                placeholder="6 12 34 56 78"
                maxlength="14"
                value="${phone}"
                autofocus
              />
            </div>
          </div>
          <button type="submit" class="btn btn-primary btn-block" id="btn-send-otp">
            Recevoir mon code
          </button>
        </form>

        <p class="text-sm text-muted mt-lg" style="max-width:280px">
          Vous recevrez un code a 6 chiffres par SMS pour vous connecter en toute securite.
        </p>
      </div>`;

    const input = container.querySelector('#phone');
    const form = container.querySelector('#phone-form');

    // Auto-format phone number
    input.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '');
      // Remove leading 0 if present
      if (v.startsWith('0')) v = v.slice(1);
      // Format: X XX XX XX XX
      let formatted = '';
      for (let i = 0; i < v.length && i < 9; i++) {
        if (i === 1 || i === 3 || i === 5 || i === 7) formatted += ' ';
        formatted += v[i];
      }
      e.target.value = formatted;
      phone = formatted;
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const digits = phone.replace(/\D/g, '');
      if (digits.length < 9) return;

      const btn = container.querySelector('#btn-send-otp');
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner spinner-sm"></div>';

      try {
        const fullPhone = '+33' + digits;
        await JadomiAPI.post('/auth/request-otp', { phone: fullPhone, cabinet: cabinetSlug });
        step = 'otp';
        render();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Recevoir mon code';
        showError(container, err.message);
      }
    });
  }

  function renderOTPStep() {
    container.innerHTML = `
      <div class="login-page">
        <div class="login-logo"><span>J</span></div>
        <h1 class="login-title">Verification</h1>
        <p class="login-subtitle">Entrez le code envoye au +33 ${phone}</p>

        <form class="login-form" id="otp-form">
          <div class="otp-container">
            ${[0,1,2,3,4,5].map(i => `
              <input
                type="text"
                inputmode="numeric"
                class="otp-box"
                maxlength="1"
                data-index="${i}"
                autocomplete="one-time-code"
                ${i === 0 ? 'autofocus' : ''}
              />
            `).join('')}
          </div>

          <button type="submit" class="btn btn-primary btn-block" id="btn-verify" disabled>
            Verifier
          </button>
        </form>

        <button class="btn btn-ghost btn-block mt-md" id="btn-back">
          Modifier le numero
        </button>

        <button class="btn btn-ghost btn-block mt-sm text-muted" id="btn-resend" disabled>
          Renvoyer le code <span id="resend-timer"></span>
        </button>
      </div>`;

    const boxes = container.querySelectorAll('.otp-box');
    const verifyBtn = container.querySelector('#btn-verify');
    const form = container.querySelector('#otp-form');

    // OTP box behavior
    boxes.forEach((box, i) => {
      box.addEventListener('input', (e) => {
        const v = e.target.value.replace(/\D/g, '');
        e.target.value = v.slice(0, 1);

        if (v && e.target.value) {
          e.target.classList.add('filled');
          if (i < 5) boxes[i + 1].focus();
        }

        checkComplete();
      });

      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && i > 0) {
          boxes[i - 1].focus();
          boxes[i - 1].value = '';
          boxes[i - 1].classList.remove('filled');
        }
      });

      // Handle paste
      box.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
        for (let j = 0; j < 6 && j < text.length; j++) {
          boxes[j].value = text[j];
          boxes[j].classList.add('filled');
        }
        if (text.length >= 6) boxes[5].focus();
        checkComplete();
      });
    });

    function checkComplete() {
      const code = getOTP();
      verifyBtn.disabled = code.length < 6;
      // Auto-submit on 6th digit
      if (code.length === 6) submitOTP();
    }

    function getOTP() {
      return Array.from(boxes).map((b) => b.value).join('');
    }

    async function submitOTP() {
      const code = getOTP();
      if (code.length < 6) return;

      verifyBtn.disabled = true;
      verifyBtn.innerHTML = '<div class="spinner spinner-sm"></div>';

      try {
        const digits = phone.replace(/\D/g, '');
        const res = await JadomiAPI.post('/auth/verify-otp', {
          phone: '+33' + digits,
          code,
          cabinet: cabinetSlug,
        });
        JadomiAPI.setToken(res.token);
        if (res.patient) {
          localStorage.setItem('jadomi_patient', JSON.stringify(res.patient));
        }
        Router.navigate('/mes-rdv');
      } catch (err) {
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Verifier';
        // Shake animation on error
        boxes.forEach((b) => { b.classList.remove('filled'); b.value = ''; });
        boxes[0].focus();
        showError(container, err.message || 'Code invalide');
      }
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submitOTP();
    });

    // Back to phone step
    container.querySelector('#btn-back').addEventListener('click', () => {
      step = 'phone';
      render();
    });

    // Resend timer
    let resendSeconds = 30;
    const resendBtn = container.querySelector('#btn-resend');
    const timerSpan = container.querySelector('#resend-timer');
    const timer = setInterval(() => {
      resendSeconds--;
      timerSpan.textContent = resendSeconds > 0 ? `(${resendSeconds}s)` : '';
      if (resendSeconds <= 0) {
        clearInterval(timer);
        resendBtn.disabled = false;
      }
    }, 1000);
    timerSpan.textContent = `(${resendSeconds}s)`;

    resendBtn.addEventListener('click', async () => {
      resendBtn.disabled = true;
      try {
        const digits = phone.replace(/\D/g, '');
        await JadomiAPI.post('/auth/request-otp', { phone: '+33' + digits, cabinet: cabinetSlug });
        resendSeconds = 30;
        timerSpan.textContent = `(${resendSeconds}s)`;
        const t2 = setInterval(() => {
          resendSeconds--;
          timerSpan.textContent = resendSeconds > 0 ? `(${resendSeconds}s)` : '';
          if (resendSeconds <= 0) { clearInterval(t2); resendBtn.disabled = false; }
        }, 1000);
      } catch (err) {
        resendBtn.disabled = false;
        showError(container, err.message);
      }
    });
  }
});

function showError(container, msg) {
  // Remove existing
  const existing = container.querySelector('.toast-error');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast-error';
  toast.style.cssText = `
    position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%);
    background: var(--error); color: #fff; padding: 10px 20px;
    border-radius: var(--radius-full); font-size: 14px; font-weight: 500;
    z-index: 999; animation: fadeIn .2s ease;
    box-shadow: 0 4px 20px rgba(239,68,68,.3);
  `;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}
