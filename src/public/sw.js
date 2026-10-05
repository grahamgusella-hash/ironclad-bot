// Only the generic offline page is cached. Signed-in pages and actions always use the network.
const CACHE = 'ironclad-offline-v6';
const CASINO_EXTRA = String.raw`
;(() => {
  if (location.pathname !== '/') return;
  const rand = max => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % max; };
  const fmt = n => Number(n).toLocaleString();
  const getChips = () => Math.max(0, Number(localStorage.getItem('ironclad-casino-chips') || 1000) || 0);
  const setChips = n => localStorage.setItem('ironclad-casino-chips', String(Math.max(0, Math.floor(n))));
  const history = (game, delta) => {
    let h = [];
    try { h = JSON.parse(localStorage.getItem('ironclad-casino-history') || '[]'); } catch (_) {}
    h.unshift({ game, delta, at: Date.now() });
    localStorage.setItem('ironclad-casino-history', JSON.stringify(h.slice(0, 20)));
  };
  const bet = id => {
    const amount = Number(document.getElementById(id)?.value || 0), chips = getChips();
    return Number.isSafeInteger(amount) && amount > 0 && amount <= chips ? amount : 0;
  };
  const back = () => { location.href = '/?casino=' + Date.now() + '#casino'; };
  const frame = (title, icon, html) => {
    const main = document.querySelector('main');
    if (!main) return;
    main.innerHTML = '<button id="extra-back">← Back to games</button><div class="card casino-game" style="margin-top:14px"><div class="row"><div style="font-size:44px">' + icon + '</div><div><h1 style="margin:0">' + title + '</h1><p class="muted" style="margin:4px 0">Virtual chips only · Balance: 🪙 <span id="extra-balance">' + fmt(getChips()) + '</span></p></div></div><hr class="divider">' + html + '</div>';
    document.getElementById('extra-back')?.addEventListener('click', back);
  };
  const update = () => { const e = document.getElementById('extra-balance'); if (e) e.textContent = fmt(getChips()); };
  const result = text => { const e = document.getElementById('extra-result'); if (e) e.textContent = text; };
  const settle = (game, wager, payout, text) => { const delta = payout - wager; setChips(getChips() + payout); history(game, delta); update(); result(text); };

  function blackjack() {
    frame('Blackjack', '♠️', '<p>Beat the dealer without going over 21.</p><div class="casino-actions"><div><label>Bet</label><input id="bj-bet" type="number" min="1" value="10"></div><button id="bj-deal">Deal</button><button id="bj-hit" disabled>Hit</button><button id="bj-stand" disabled>Stand</button></div><p id="bj-table" style="font-size:22px;font-weight:700"></p><p id="extra-result" class="casino-result"></p>');
    let wager=0, player=[], dealer=[], active=false;
    const card=()=>1+rand(13); const value=c=>Math.min(c,10); const total=hand=>{let t=hand.reduce((s,c)=>s+value(c),0),aces=hand.filter(c=>c===1).length;while(aces--&&t+10<=21)t+=10;return t}; const show=()=>{document.getElementById('bj-table').textContent='You: '+player.join(', ')+' ('+total(player)+')   Dealer: '+dealer.join(', ')+' ('+total(dealer)+')'};
    const end=()=>{active=false;document.getElementById('bj-hit').disabled=true;document.getElementById('bj-stand').disabled=true;};
    document.getElementById('bj-deal').onclick=()=>{wager=bet('bj-bet');if(!wager){result('Enter a valid bet.');return}setChips(getChips()-wager);update();player=[card(),card()];dealer=[card(),card()];active=true;document.getElementById('bj-hit').disabled=false;document.getElementById('bj-stand').disabled=false;show();result('Your move.');if(total(player)===21){document.getElementById('bj-stand').click()}};
    document.getElementById('bj-hit').onclick=()=>{if(!active)return;player.push(card());show();if(total(player)>21){end();settle('Blackjack',wager,0,'Bust — you lost '+fmt(wager)+' chips.')}};
    document.getElementById('bj-stand').onclick=()=>{if(!active)return;while(total(dealer)<17)dealer.push(card());show();const p=total(player),d=total(dealer);end();if(d>21||p>d)settle('Blackjack',wager,wager*2,'You win '+fmt(wager)+' chips!');else if(p===d)settle('Blackjack',wager,wager,'Push — bet returned.');else settle('Blackjack',wager,0,'Dealer wins.');};
  }
  function roulette(){
    frame('Roulette','🎡','<p>Bet on red, black, or green.</p><div class="casino-actions"><div><label>Bet</label><input id="roul-bet" type="number" min="1" value="10"></div><button data-r="red">Red</button><button data-r="black">Black</button><button data-r="green">Green</button></div><p id="roul-spin" style="font-size:46px;font-weight:900">—</p><p id="extra-result" class="casino-result"></p>');
    document.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>{const w=bet('roul-bet');if(!w){result('Enter a valid bet.');return}setChips(getChips()-w);const n=rand(37),land=n===0?'green':n%2?'red':'black';document.getElementById('roul-spin').textContent=n+' '+land.toUpperCase();const mult=land==='green'?14:2;settle('Roulette',w,b.dataset.r===land?w*mult:0,b.dataset.r===land?'Winner!':'No luck this spin.');});
  }
  function crash(){
    frame('Crash','🚀','<p>Choose a target multiplier. If the rocket crashes after your target, you win.</p><div class="casino-actions"><div><label>Bet</label><input id="crash-bet" type="number" min="1" value="10"></div><div><label>Cash-out target</label><input id="crash-target" type="number" min="1.10" max="10" step="0.10" value="2.00"></div><button id="crash-go">Launch</button></div><p id="crash-number" style="font-size:54px;font-weight:900">1.00×</p><p id="extra-result" class="casino-result"></p>');
    document.getElementById('crash-go').onclick=()=>{const w=bet('crash-bet'),target=Math.max(1.1,Math.min(10,Number(document.getElementById('crash-target').value)||2));if(!w){result('Enter a valid bet.');return}setChips(getChips()-w);const crash=Math.min(20,Math.max(1,Math.round((0.99/(1-Math.random()))*100)/100));document.getElementById('crash-number').textContent=crash.toFixed(2)+'×';const payout=crash>=target?Math.floor(w*target):0;settle('Crash',w,payout,payout?'Cashed out at '+target.toFixed(2)+'×!':'Crashed before your target.');};
  }
  function keno(){
    frame('Keno','🔢','<p>Pick 5 numbers from 1–20, then draw 5.</p><div id="keno-picks" class="casino-badges"></div><div class="casino-actions"><div><label>Bet</label><input id="keno-bet" type="number" min="1" value="10"></div><button id="keno-draw">Draw</button></div><p id="keno-out" style="font-size:22px;font-weight:700"></p><p id="extra-result" class="casino-result"></p>');
    const box=document.getElementById('keno-picks'),picked=new Set();for(let i=1;i<=20;i++){const b=document.createElement('button');b.textContent=i;b.style.padding='8px 11px';b.onclick=()=>{if(picked.has(i)){picked.delete(i);b.classList.remove('active')}else if(picked.size<5){picked.add(i);b.classList.add('active')}};box.appendChild(b)}
    document.getElementById('keno-draw').onclick=()=>{const w=bet('keno-bet');if(!w||picked.size!==5){result('Pick exactly 5 numbers and enter a valid bet.');return}setChips(getChips()-w);const drawn=new Set();while(drawn.size<5)drawn.add(1+rand(20));const hits=[...picked].filter(n=>drawn.has(n)).length,m=[0,0,0,2,5,15][hits]||0,payout=w*m;document.getElementById('keno-out').textContent='Draw: '+[...drawn].sort((a,b)=>a-b).join(', ')+' · '+hits+' matches';settle('Keno',w,payout,payout?'You won '+fmt(payout-w)+' chips!':'No payout this draw.');};
  }
  function cases(){
    frame('Cases','📦','<p>Open a 50-chip case for a random virtual prize.</p><button id="case-open">Open Case · 50</button><p id="case-prize" style="font-size:54px;font-weight:900">📦</p><p id="extra-result" class="casino-result"></p>');
    document.getElementById('case-open').onclick=()=>{if(getChips()<50){result('You need at least 50 chips.');return}setChips(getChips()-50);const prizes=[0,10,25,50,75,100,150,250],weights=[28,18,16,14,10,7,5,2],roll=rand(100);let s=0,p=0;for(let i=0;i<prizes.length;i++){s+=weights[i];if(roll<s){p=prizes[i];break}}document.getElementById('case-prize').textContent='🪙 '+fmt(p);settle('Cases',50,p,p?'You pulled '+fmt(p)+' chips!':'Empty case.');};
  }
  function battles(){
    frame('Case Battles','⚔️','<p>You and the bot each open a 50-chip case. Higher pull wins the 100-chip pot.</p><button id="battle-go">Battle · 50</button><p id="battle-out" style="font-size:24px;font-weight:800"></p><p id="extra-result" class="casino-result"></p>');
    document.getElementById('battle-go').onclick=()=>{if(getChips()<50){result('You need at least 50 chips.');return}setChips(getChips()-50);const pull=()=>rand(101),you=pull(),bot=pull();document.getElementById('battle-out').textContent='You: '+you+' 🆚 Bot: '+bot;const payout=you>bot?100:you===bot?50:0;settle('Case Battle',50,payout,you>bot?'You won the battle!':you===bot?'Tie — bet returned.':'Bot won the battle.');};
  }
  function chicken(){
    frame('Chicken','🐔','<p>Cross one lane at a time. Each safe step increases your cash-out.</p><div class="casino-actions"><div><label>Bet</label><input id="chicken-bet" type="number" min="1" value="10"></div><button id="chicken-start">Start</button><button id="chicken-step" disabled>Cross Next Lane</button><button id="chicken-cash" disabled>Cash Out</button></div><p id="chicken-road" style="font-size:34px;letter-spacing:6px">🐔 ▫️ ▫️ ▫️ ▫️ ▫️ ▫️</p><p id="extra-result" class="casino-result"></p>');
    let w=0,steps=0,active=false;const render=()=>{document.getElementById('chicken-road').textContent='🐔 '+Array.from({length:6},(_,i)=>i<steps?'✅':'▫️').join(' ')};
    document.getElementById('chicken-start').onclick=()=>{w=bet('chicken-bet');if(!w){result('Enter a valid bet.');return}setChips(getChips()-w);update();steps=0;active=true;document.getElementById('chicken-step').disabled=false;document.getElementById('chicken-cash').disabled=true;render();result('Cross the first lane.');};
    document.getElementById('chicken-step').onclick=()=>{if(!active)return;if(rand(100)<22){active=false;document.getElementById('chicken-step').disabled=true;document.getElementById('chicken-cash').disabled=true;history('Chicken',-w);update();result('💥 The chicken got hit. You lost '+fmt(w)+' chips.');return}steps++;render();document.getElementById('chicken-cash').disabled=false;result('Safe! Current cash-out: '+fmt(Math.floor(w*Math.pow(1.28,steps)))+' chips.');if(steps>=6)document.getElementById('chicken-cash').click();};
    document.getElementById('chicken-cash').onclick=()=>{if(!active||!steps)return;const payout=Math.floor(w*Math.pow(1.28,steps));active=false;document.getElementById('chicken-step').disabled=true;document.getElementById('chicken-cash').disabled=true;settle('Chicken',w,payout,'Cashed out for '+fmt(payout)+' chips!');};
  }
  function upgrader(){
    frame('Upgrader','⬆️','<p>Risk chips for a larger multiplier. Higher targets have lower success odds.</p><div class="casino-actions"><div><label>Amount</label><input id="upgrade-bet" type="number" min="1" value="10"></div><div><label>Target</label><select id="upgrade-mult"><option value="1.5">1.5×</option><option value="2">2×</option><option value="3">3×</option><option value="5">5×</option><option value="10">10×</option></select></div><button id="upgrade-go">Upgrade</button></div><p id="upgrade-chance" class="muted"></p><p id="extra-result" class="casino-result"></p>');
    const show=()=>{const m=Number(document.getElementById('upgrade-mult').value);document.getElementById('upgrade-chance').textContent='Success chance: '+Math.floor((0.95/m)*100)+'%'};document.getElementById('upgrade-mult').onchange=show;show();
    document.getElementById('upgrade-go').onclick=()=>{const w=bet('upgrade-bet'),m=Number(document.getElementById('upgrade-mult').value);if(!w){result('Enter a valid amount.');return}setChips(getChips()-w);const win=Math.random()<0.95/m,payout=win?Math.floor(w*m):0;settle('Upgrader',w,payout,win?'Upgrade succeeded! You received '+fmt(payout)+' chips.':'Upgrade failed.');};
  }

  const handlers={blackjack,roulette,crash,keno,cases,battles,chicken,upgrader};
  function enhance(){
    if(location.hash!=='#casino')return;
    Object.keys(handlers).forEach(id=>{const card=document.querySelector('.game-card[data-game="'+id+'"]');if(card){card.classList.remove('coming');const s=card.querySelector('small');if(s)s.textContent='Play now';if(!card.dataset.extraBound){card.dataset.extraBound='1';card.addEventListener('click',e=>{e.stopPropagation();handlers[id]()},{capture:true})}}});
    const games=document.querySelector('.casino-games');
    if(games&&!document.querySelector('.game-card[data-game="chicken"]')){
      [['chicken','Chicken','🐔','originals'],['upgrader','Upgrader','⬆️','originals']].forEach(g=>{const card=document.createElement('div');card.className='card game-card';card.dataset.game=g[0];card.dataset.extraBound='1';card.innerHTML='<div><div class="game-icon">'+g[2]+'</div><h2>'+g[1]+'</h2></div><small>Play now</small>';card.addEventListener('click',e=>{e.stopPropagation();handlers[g[0]]()},{capture:true});games.appendChild(card)});
    }
  }
  enhance();
  new MutationObserver(enhance).observe(document.documentElement,{subtree:true,childList:true});
})();
`;

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
    event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => caches.match('/offline.html')));
    return;
  }
  if (url.origin === self.location.origin && url.pathname === '/app.js') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).then(async response => {
      if (!response.ok) return response;
      const source = await response.text();
      return new Response(source + CASINO_EXTRA, {
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