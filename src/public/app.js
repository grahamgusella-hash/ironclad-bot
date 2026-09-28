// Ironclad visual theme: animated galaxy, stars, shooting stars, and optional UI sounds.
(() => {
  const style = document.createElement('style');
  style.textContent = `
    html,body{min-height:100%}
    body{
      position:relative;
      overflow-x:hidden;
      background:
        radial-gradient(circle at 18% 22%,rgba(103,55,190,.34),transparent 33%),
        radial-gradient(circle at 82% 18%,rgba(31,104,214,.28),transparent 31%),
        radial-gradient(circle at 55% 78%,rgba(134,46,175,.22),transparent 36%),
        linear-gradient(145deg,#050711 0%,#090d21 38%,#100a26 70%,#03050d 100%);
      background-attachment:fixed;
    }
    body::before,body::after{
      content:"";position:fixed;inset:0;pointer-events:none;z-index:-3;
    }
    body::before{
      opacity:.8;
      background-image:
        radial-gradient(circle,#fff 0 1px,transparent 1.4px),
        radial-gradient(circle,#a7c6ff 0 1px,transparent 1.5px),
        radial-gradient(circle,#d8b7ff 0 1.2px,transparent 1.7px);
      background-size:71px 71px,113px 113px,167px 167px;
      background-position:0 0,37px 22px,74px 51px;
      animation:ironclad-stars 90s linear infinite;
    }
    body::after{
      background:
        radial-gradient(ellipse at 30% 45%,rgba(113,78,255,.12),transparent 30%),
        radial-gradient(ellipse at 75% 65%,rgba(35,124,255,.10),transparent 30%);
      filter:blur(24px);
      animation:ironclad-nebula 14s ease-in-out infinite alternate;
    }
    @keyframes ironclad-stars{to{background-position:71px 71px,150px 135px,241px 218px}}
    @keyframes ironclad-nebula{from{transform:scale(1)}to{transform:scale(1.08) translate3d(1.5%,-1%,0)}}
    header{background:rgba(9,12,29,.82)!important;backdrop-filter:blur(15px);box-shadow:0 8px 30px rgba(0,0,0,.22)}
    main{position:relative;z-index:1}
    .card,.message{background:rgba(19,24,48,.84)!important;backdrop-filter:blur(11px);box-shadow:0 10px 32px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.035);border-color:rgba(117,137,220,.30)!important}
    button,.button{transition:transform .14s ease,box-shadow .14s ease,filter .14s ease,background .14s ease;box-shadow:0 0 0 rgba(115,136,255,0)}
    button:hover:not(:disabled),.button:hover{transform:translateY(-1px);box-shadow:0 0 18px rgba(115,136,255,.38),0 5px 18px rgba(0,0,0,.22);filter:brightness(1.08)}
    button:active:not(:disabled),.button:active{transform:translateY(1px) scale(.985)}
    .brand{text-shadow:0 0 18px rgba(145,159,255,.55)}
    .ironclad-shooting-star{position:fixed;z-index:-1;width:3px;height:3px;border-radius:50%;background:#fff;pointer-events:none;box-shadow:0 0 7px 2px rgba(215,229,255,.9);animation:ironclad-shoot var(--shoot-time,1.35s) linear forwards}
    .ironclad-shooting-star::after{content:"";position:absolute;right:1px;top:1px;width:150px;height:1px;transform-origin:right center;background:linear-gradient(90deg,transparent,rgba(164,201,255,.15),rgba(255,255,255,.92));}
    @keyframes ironclad-shoot{0%{opacity:0;transform:translate3d(0,0,0) rotate(-32deg)}8%{opacity:1}100%{opacity:0;transform:translate3d(-520px,330px,0) rotate(-32deg)}}
    #ironclad-sound-toggle{position:fixed;right:18px;bottom:18px;z-index:50;padding:9px 12px;border:1px solid rgba(150,166,255,.32);border-radius:999px;background:rgba(16,20,45,.88);color:#eef1ff;font:600 13px system-ui,sans-serif;backdrop-filter:blur(10px);box-shadow:0 6px 24px rgba(0,0,0,.3);cursor:pointer}
    #ironclad-sound-toggle:hover{box-shadow:0 0 18px rgba(115,136,255,.35),0 6px 24px rgba(0,0,0,.3)}
    @media (prefers-reduced-motion:reduce){body::before,body::after{animation:none}.ironclad-shooting-star{display:none}button,.button{transition:none}}
  `;
  document.head.appendChild(style);

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function shootingStar() {
    if (reducedMotion || document.hidden) return;
    const star = document.createElement('span');
    star.className = 'ironclad-shooting-star';
    star.style.left = `${65 + Math.random() * 35}vw`;
    star.style.top = `${Math.random() * 42}vh`;
    star.style.setProperty('--shoot-time', `${1.05 + Math.random() * .75}s`);
    document.body.appendChild(star);
    setTimeout(() => star.remove(), 2200);
  }
  if (!reducedMotion) {
    setTimeout(shootingStar, 1200 + Math.random() * 2200);
    setInterval(() => { if (Math.random() < .65) shootingStar(); }, 6500);
  }

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.id = 'ironclad-sound-toggle';
  toggle.setAttribute('aria-pressed', 'false');
  document.body.appendChild(toggle);

  let soundOn = localStorage.getItem('ironclad-ui-sounds') === 'on';
  let audioContext;
  function updateToggle() {
    toggle.textContent = soundOn ? '🔊 UI Sounds: On' : '🔇 UI Sounds: Off';
    toggle.setAttribute('aria-pressed', String(soundOn));
  }
  function ctx() {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    return audioContext;
  }
  function tone(kind) {
    if (!soundOn) return;
    try {
      const ac = ctx();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      const now = ac.currentTime;
      osc.type = kind === 'click' ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(kind === 'click' ? 410 : 690, now);
      osc.frequency.exponentialRampToValueAtTime(kind === 'click' ? 260 : 545, now + (kind === 'click' ? .075 : .045));
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(kind === 'click' ? .075 : .028, now + .008);
      gain.gain.exponentialRampToValueAtTime(.0001, now + (kind === 'click' ? .09 : .055));
      osc.connect(gain); gain.connect(ac.destination);
      osc.start(now); osc.stop(now + .11);
    } catch (_) {}
  }
  toggle.addEventListener('click', () => {
    soundOn = !soundOn;
    localStorage.setItem('ironclad-ui-sounds', soundOn ? 'on' : 'off');
    updateToggle();
    if (soundOn) tone('click');
  });
  updateToggle();

  let lastHover;
  document.addEventListener('pointerover', event => {
    const target = event.target.closest('button,.button,a[href],select');
    if (!target || target === lastHover || target.disabled || target.id === 'ironclad-sound-toggle') return;
    lastHover = target;
    tone('hover');
  });
  document.addEventListener('pointerout', event => {
    const target = event.target.closest('button,.button,a[href],select');
    if (target === lastHover && !target?.contains(event.relatedTarget)) lastHover = null;
  });
  document.addEventListener('pointerdown', event => {
    const target = event.target.closest('button,.button,a[href],select');
    if (target && target.id !== 'ironclad-sound-toggle' && !target.disabled) tone('click');
  });
})();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    const button = document.getElementById('push-toggle');
    const status = document.getElementById('push-status');
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      if (!button) return;
      if (!('PushManager' in window) || !('Notification' in window)) {
        status.textContent = 'This browser does not support phone notifications.';
        button.disabled = true;
        return;
      }
      async function send(action, subscription) {
        const fields = new URLSearchParams({ action, guildId: button.dataset.guild,
          csrf: button.dataset.csrf, subscription: JSON.stringify(subscription) });
        const response = await fetch('/push', { method: 'POST', body: fields, credentials: 'same-origin' });
        if (!response.ok) throw new Error('Could not save your notification preference. Sign in again and retry.');
        return response.json();
      }
      function display(subscribed) {
        button.dataset.subscribed = subscribed ? 'yes' : 'no';
        button.textContent = subscribed ? 'Turn off notifications on this phone' : 'Enable notifications on this phone';
        status.textContent = subscribed ? 'Alerts are on for this server.' : 'Alerts are off for this server.';
      }
      const current = await registration.pushManager.getSubscription();
      if (current) display((await send('status', current.toJSON())).subscribed);
      else display(false);
      button.addEventListener('click', async () => {
        button.disabled = true;
        status.textContent = 'Updating notifications…';
        try {
          if (button.dataset.subscribed === 'yes') {
            const subscription = await registration.pushManager.getSubscription();
            if (!subscription) throw new Error('No phone subscription found. Reload and try again.');
            await send('unsubscribe', subscription.toJSON());
            display(false);
          } else {
            if (Notification.permission === 'denied') throw new Error('Allow notifications for this site in your phone settings.');
            if (Notification.permission !== 'granted' && await Notification.requestPermission() !== 'granted')
              throw new Error('Phone notification permission was not granted.');
            let subscription = await registration.pushManager.getSubscription();
            subscription ||= await registration.pushManager.subscribe({ userVisibleOnly: true,
              applicationServerKey: button.dataset.key });
            await send('subscribe', subscription.toJSON());
            display(true);
          }
        } catch (error) { status.textContent = error.message || 'Could not enable notifications.'; }
        finally { button.disabled = false; }
      });
    } catch (error) {
      if (status) status.textContent = 'Phone notifications could not start. Try reloading.';
    }
  });
}

// Keep server overview, ticket list, and individual ticket conversations fresh.
(() => {
  const ticketDetail = /^\/g\/\d+\/tickets\/\d+$/.test(location.pathname);
  const livePage = ticketDetail || location.pathname === '/' || /^\/g\/\d+(?:\/tickets)?$/.test(location.pathname);
  if (!livePage) return;

  let checking = false;
  const editing = () => {
    const el = document.activeElement;
    return el && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el.tagName);
  };

  function replaceTicketMessages(nextMain, currentMain) {
    const currentMessages = [...currentMain.querySelectorAll('.message')];
    const nextMessages = [...nextMain.querySelectorAll('.message')];
    const currentSignature = currentMessages.map(node => node.innerHTML).join('\n');
    const nextSignature = nextMessages.map(node => node.innerHTML).join('\n');
    if (currentSignature === nextSignature) return;

    const firstMessage = currentMessages[0];
    const anchor = firstMessage || currentMain.querySelector('hr.divider');
    if (!anchor) return;

    currentMessages.forEach(node => node.remove());
    nextMessages.forEach(node => anchor.parentNode.insertBefore(node.cloneNode(true), anchor));
  }

  async function refreshIfChanged() {
    if (checking || document.visibilityState !== 'visible') return;
    if (!ticketDetail && editing()) return;
    checking = true;
    try {
      const response = await fetch(`${location.pathname}${location.search}${location.search ? '&' : '?'}_=${Date.now()}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'X-Ironclad-Refresh': '1' }
      });
      if (!response.ok) return;
      const html = await response.text();
      const nextMain = new DOMParser().parseFromString(html, 'text/html').querySelector('main');
      const currentMain = document.querySelector('main');
      if (!nextMain || !currentMain) return;

      if (ticketDetail) replaceTicketMessages(nextMain, currentMain);
      else if (nextMain.innerHTML !== currentMain.innerHTML) currentMain.innerHTML = nextMain.innerHTML;
    } catch (_) {
      // Temporary network issues should not interrupt the dashboard.
    } finally {
      checking = false;
    }
  }

  refreshIfChanged();
  setInterval(refreshIfChanged, 1000);
})();
