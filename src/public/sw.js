// Only the generic offline page is cached. Signed-in pages and actions always use the network.
const CACHE = 'ironclad-offline-v3';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add('/offline.html')).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
    return;
  }
  // Patch the main browser script with website-only UI features. Keeping these
  // here lets us add navigation/home/casino without touching Discord bot logic.
  if (url.origin === self.location.origin && url.pathname === '/app.js') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).then(async response => {
      if (!response.ok) return response;
      const source = await response.text();
      const patch = `
;(() => {
  // Keep application-created channels out of the normal Tickets list.
  if (/^\\/g\\/\\d+\\/tickets$/.test(location.pathname)) {
    function hideApplicationTickets() {
      const main = document.querySelector('main');
      if (!main) return;
      main.querySelectorAll('.card').forEach(card => {
        const type = card.querySelector('b')?.textContent?.trim();
        if (type === 'Application') card.remove();
      });
    }
    hideApplicationTickets();
    const ticketsMain = document.querySelector('main');
    if (ticketsMain) new MutationObserver(hideApplicationTickets).observe(ticketsMain, { childList: true, subtree: true });
  }

  const style = document.createElement('style');
  style.textContent = \`
    #ironclad-site-menu{position:fixed;right:18px;bottom:66px;z-index:80;font:600 14px system-ui,sans-serif}
    #ironclad-site-menu summary{list-style:none;cursor:pointer;padding:10px 14px;border-radius:999px;border:1px solid rgba(150,166,255,.35);background:rgba(16,20,45,.92);color:#eef1ff;box-shadow:0 7px 24px rgba(0,0,0,.35);backdrop-filter:blur(12px)}
    #ironclad-site-menu summary::-webkit-details-marker{display:none}
    #ironclad-site-menu[open] summary{border-radius:12px 12px 0 0}
    #ironclad-site-menu .site-menu-links{display:grid;min-width:170px;padding:7px;background:rgba(12,16,36,.97);border:1px solid rgba(150,166,255,.35);border-top:0;border-radius:0 0 12px 12px;box-shadow:0 12px 32px rgba(0,0,0,.4)}
    #ironclad-site-menu a{display:block;padding:10px 12px;border-radius:8px;color:#eef1ff;text-decoration:none}
    #ironclad-site-menu a:hover{background:rgba(120,140,255,.18);text-decoration:none}
    .ironclad-hero{text-align:center;padding:54px 20px 30px}
    .ironclad-hero h1{font-size:clamp(42px,8vw,78px);margin:0 0 12px;text-shadow:0 0 28px rgba(125,145,255,.45)}
    .ironclad-hero p{max-width:720px;margin:0 auto 24px;font-size:18px}
    .casino-balance{font-size:26px;font-weight:800;margin:12px 0 6px}
    .casino-result{min-height:28px;font-weight:700;margin-top:14px}
    .casino-game .slots{font-size:44px;letter-spacing:8px;margin:16px 0}
    .casino-game input{max-width:180px}
    .casino-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:end}
    .casino-note{font-size:13px;color:#a5aec6}
    @media(max-width:680px){#ironclad-site-menu{right:10px;bottom:62px}.ironclad-hero{padding-top:28px}}
  \`;
  document.head.appendChild(style);

  const menu = document.createElement('details');
  menu.id = 'ironclad-site-menu';
  menu.innerHTML = '<summary>☰ Menu</summary><div class="site-menu-links"><a href="/#home">🏠 Home</a><a href="/#casino">🎰 Casino</a><a href="/#dashboard">🛠 Dashboard</a></div>';
  document.body.appendChild(menu);

  // On the root page we use hash views. Preserve the server dashboard HTML so
  // it can be restored instantly without another login.
  if (location.pathname !== '/') return;
  const main = document.querySelector('main');
  if (!main) return;
  const dashboardHtml = main.innerHTML;

  // The existing dashboard auto-refresh also runs on /. When Home or Casino is
  // selected, return the current page to that refresh request so it cannot
  // overwrite the selected view.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const isRefresh = init?.headers && (init.headers['X-Ironclad-Refresh'] === '1' || init.headers instanceof Headers && init.headers.get('X-Ironclad-Refresh') === '1');
    if (isRefresh && ['#home', '#casino'].includes(location.hash)) {
      return Promise.resolve(new Response(document.documentElement.outerHTML, { status: 200, headers: { 'Content-Type': 'text/html' } }));
    }
    return nativeFetch(input, init);
  };

  const safeChips = value => Math.max(0, Math.min(1000000000, Number.isFinite(value) ? Math.floor(value) : 1000));
  let chips = safeChips(Number(localStorage.getItem('ironclad-casino-chips') || 1000));
  const saveChips = () => localStorage.setItem('ironclad-casino-chips', String(chips));
  const randomInt = max => {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % max;
  };

  function home() {
    main.innerHTML = \`
      <section class="ironclad-hero">
        <span class="pill">IRONCLAD</span>
        <h1>Your server. One place.</h1>
        <p class="muted">Manage your Discord community, jump into the play-money casino, and keep everything together on one site.</p>
        <p class="row" style="justify-content:center"><a class="button" href="/#dashboard">Open Dashboard</a><a class="button" href="/#casino">Play Casino</a></p>
      </section>
      <div class="grid">
        <div class="card"><h2>🛠 Discord Dashboard</h2><p>Tickets, applications, vouches, giveaways, polls, and server tools.</p><a href="/#dashboard">Go to dashboard →</a></div>
        <div class="card"><h2>🎰 Virtual Casino</h2><p>Play Coin Flip and Slots with virtual chips. No real money or cash value.</p><a href="/#casino">Enter casino →</a></div>
        <div class="card"><h2>✨ Custom Themes</h2><p>Galaxy, Cyber Neon, Minecraft Night, Deep Ocean, and Ember backgrounds.</p></div>
      </div>\`;
  }

  function casino(message = '') {
    main.innerHTML = \`
      <div class="row"><h1>🎰 Ironclad Casino</h1><span class="pill">Play money only</span></div>
      <p class="muted">Virtual chips have no cash value and cannot be bought, sold, deposited, or withdrawn.</p>
      <div class="card"><div class="casino-balance">🪙 <span id="casino-chip-count">${chips.toLocaleString()}</span> chips</div><p class="casino-note">Your demo-chip balance is stored on this browser.</p><button type="button" id="casino-reset">Reset to 1,000 chips</button></div>
      <div class="grid">
        <div class="card casino-game"><h2>🪙 Coin Flip</h2><p>Pick heads or tails. A win pays 2× your bet.</p><div class="casino-actions"><div><label for="coin-bet">Bet</label><input id="coin-bet" type="number" min="1" max="1000000" value="10"></div><button type="button" data-coin="heads">Heads</button><button type="button" data-coin="tails">Tails</button></div><p id="coin-result" class="casino-result">${message}</p></div>
        <div class="card casino-game"><h2>🎰 Slots</h2><p>Three matching symbols pay 6×. Two matching symbols pay 2×.</p><div id="slot-reels" class="slots">🍒 ⭐ 💎</div><div class="casino-actions"><div><label for="slot-bet">Bet</label><input id="slot-bet" type="number" min="1" max="1000000" value="10"></div><button type="button" id="slot-spin">Spin</button></div><p id="slot-result" class="casino-result"></p></div>
      </div>\`;

    const update = () => { const el = document.getElementById('casino-chip-count'); if (el) el.textContent = chips.toLocaleString(); saveChips(); };
    const betFrom = id => {
      const bet = Number(document.getElementById(id)?.value || 0);
      return Number.isSafeInteger(bet) && bet > 0 && bet <= chips ? bet : 0;
    };
    document.querySelectorAll('[data-coin]').forEach(button => button.addEventListener('click', () => {
      const bet = betFrom('coin-bet');
      const result = document.getElementById('coin-result');
      if (!bet) { result.textContent = 'Enter a valid bet that is no more than your chip balance.'; return; }
      const landed = randomInt(2) ? 'heads' : 'tails';
      chips -= bet;
      if (button.dataset.coin === landed) { chips += bet * 2; result.textContent = 'It landed ' + landed + ' — you won ' + bet.toLocaleString() + ' chips!'; }
      else result.textContent = 'It landed ' + landed + ' — you lost ' + bet.toLocaleString() + ' chips.';
      update();
    }));
    document.getElementById('slot-spin')?.addEventListener('click', () => {
      const bet = betFrom('slot-bet');
      const result = document.getElementById('slot-result');
      if (!bet) { result.textContent = 'Enter a valid bet that is no more than your chip balance.'; return; }
      const symbols = ['🍒','⭐','💎','🍀','7️⃣'];
      const reels = [symbols[randomInt(symbols.length)], symbols[randomInt(symbols.length)], symbols[randomInt(symbols.length)]];
      document.getElementById('slot-reels').textContent = reels.join(' ');
      chips -= bet;
      const counts = reels.map(s => reels.filter(x => x === s).length);
      let payout = 0;
      if (counts.includes(3)) payout = bet * 6;
      else if (counts.includes(2)) payout = bet * 2;
      chips += payout;
      result.textContent = payout ? 'You won ' + (payout - bet).toLocaleString() + ' chips!' : 'No match — you lost ' + bet.toLocaleString() + ' chips.';
      update();
    });
    document.getElementById('casino-reset')?.addEventListener('click', () => { chips = 1000; update(); casino('Balance reset to 1,000 demo chips.'); });
  }

  function showView() {
    const view = location.hash || '#home';
    menu.open = false;
    if (view === '#casino') casino();
    else if (view === '#dashboard') main.innerHTML = dashboardHtml;
    else home();
  }
  addEventListener('hashchange', showView);
  showView();
})();
`;
      return new Response(source + patch, {
        status: response.status,
        statusText: response.statusText,
        headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' }
      });
    }));
  }
});
self.addEventListener('push', event => {
  if (!event.data) return;
  try {
    const message = event.data.json();
    const url = typeof message.url === 'string' && /^\/g\/\d{17,22}\/(tickets|vouches)(\/\d{17,22})?$/.test(message.url) ? message.url : '/';
    event.waitUntil(self.registration.showNotification(message.title || 'Ironclad', {
      body: message.body || 'New server activity', icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png', tag: message.tag || 'ironclad', data: { url }
    }));
  } catch { /* Ignore malformed push payloads. */ }
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    const existing = clients.find(client => client.url.startsWith(self.location.origin) && 'focus' in client);
    if (existing) { await existing.navigate(url); return existing.focus(); }
    return self.clients.openWindow(url);
  }));
});
