/* ═══════════════════════════════════════════════
   JADOMI Labo — Login Page
   Email + OTP authentication
   ═══════════════════════════════════════════════ */

Router.register('/login', async (container) => {
  let step = 'email'; // email | otp
  let email = '';

  render();

  function render() {
    if (step === 'email') renderEmailStep();
    else renderOTPStep();
  }

  function renderEmailStep() {
    container.innerHTML = `
      <div class="login-page">
        <div class="login-logo"><span>L</span></div>
        <h1 class="login-title">JADOMI Labo</h1>
        <p class="login-subtitle">Votre espace prothesiste professionnel</p>

        <form class="login-form" id="email-form">
          <div class="input-group mb-md">
            <label for="login-email">Adresse email professionnelle</label>
            <input
              class="input"
              type="email"
              id="login-email"
              placeholder="contact@monlabo.fr"
              autocomplete="email"
              value="${email}"
              autofocus
            />
          </div>
          <button type="submit" class="btn btn-primary btn-block" id="btn-send-otp">
            Recevoir mon code
          </button>
        </form>

        <p class="text-sm text-muted mt-lg" style="max-width:280px">
          Un code a 6 chiffres vous sera envoye par email pour une connexion securisee.
        </p>

        <p class="text-xs text-muted mt-lg" style="opacity:.4">
          JADOMI Labo v1.0.0
        </p>
      </div>`;

    const form = container.querySelector('#email-form');
    const input = container.querySelector('#login-email');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      email = input.value.trim();
      if (!email || !email.includes('@')) return;

      const btn = container.querySelector('#btn-send-otp');
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner spinner-sm"></div>';

      try {
        await LaboAPI.post('/auth/request-otp', { email });
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
        <div class="login-logo"><span>L</span></div>
        <h1 class="login-title">Verification</h1>
        <p class="login-subtitle">Entrez le code envoye a ${email}</p>

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
          Modifier l'adresse email
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
        const res = await LaboAPI.post('/auth/verify-otp', { email, code });
        LaboAPI.setToken(res.token);
        if (res.labo) {
          localStorage.setItem('jadomi_labo', JSON.stringify(res.labo));
        }
        Router.navigate('/mes-cas');
      } catch (err) {
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Verifier';
        boxes.forEach((b) => { b.classList.remove('filled'); b.value = ''; });
        boxes[0].focus();
        showError(container, err.message || 'Code invalide');
      }
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submitOTP();
    });

    // Back to email step
    container.querySelector('#btn-back').addEventListener('click', () => {
      step = 'email';
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
        await LaboAPI.post('/auth/request-otp', { email });
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
  const existing = document.querySelector('.toast-error');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast-error';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function showSuccess(msg) {
  const existing = document.querySelector('.toast-success');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast-success';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}
