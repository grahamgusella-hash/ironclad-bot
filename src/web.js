const { randomBytes, timingSafeEqual } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { PermissionFlagsBits, ChannelType } = require('discord.js');
const polls = require('./polls');
const applications = require('./applications');

const sessions = new Map();
const states = new Map();
const SESSION_MS = 12 * 60 * 60 * 1000;
const STATE_MS = 10 * 60 * 1000;
const idPattern = /^\d{17,22}$/;
const origin = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || 'https://ironclad-bot.onrender.com').replace(/\/$/, '');
const callback = `${origin}/auth/callback`;
const secure = origin.startsWith('https:') ? '; Secure' : '';
const token = () => randomBytes(32).toString('hex');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const params = url => new URL(url, origin);
const publicFiles = new Map([
  ['/manifest.webmanifest', ['manifest.webmanifest', 'application/manifest+json']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/sw.js', ['sw.js', 'text/javascript; charset=utf-8']],
  ['/offline.html', ['offline.html', 'text/html; charset=utf-8']],
  ['/icons/icon-192.png', ['icon-192.png', 'image/png']],
  ['/icons/icon-512.png', ['icon-512.png', 'image/png']]
]);

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(part => part.trim().split('=')).filter(pair => pair.length === 2));
}
function setCookie(res, name, value, age) {
  res.setHeader('Set-Cookie', `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure}`);
}
function html(res, body, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
  });
  res.end(body);
}
function redirect(res, location) { res.writeHead(303, { Location: location, 'Cache-Control': 'no-store' }); res.end(); }
function page(title, body, session) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#161b29"><link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/icons/icon-192.png" sizes="192x192" type="image/png"><link rel="apple-touch-icon" href="/icons/icon-192.png"><script src="/app.js" defer></script><title>${esc(title)} · Ironclad</title><style>
  :root{color-scheme:dark;font:16px system-ui,sans-serif;background:#0d1018;color:#eef1fa}*{box-sizing:border-box}body{margin:0}a{color:#9badff;text-decoration:none}a:hover{text-decoration:underline}header{padding:18px max(24px,calc((100vw - 1100px)/2));background:#161b29;border-bottom:1px solid #31394e;display:flex;justify-content:space-between;align-items:center;gap:16px}.brand{font-size:22px;font-weight:800;color:white;letter-spacing:.02em}main{max-width:1100px;margin:34px auto;padding:0 24px 72px}h1{font-size:34px;letter-spacing:-.03em;margin:0 0 10px}h2{font-size:20px;margin:0 0 16px}p{line-height:1.55}.muted{color:#a5aec6}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(285px,1fr));gap:18px;margin:24px 0}.card,.message{border:1px solid #303950;background:#181f2f;border-radius:14px;padding:20px}.card p{margin:9px 0}.pill{font-size:12px;padding:4px 9px;border-radius:99px;background:#303d64;color:#dce2ff}button,.button{border:0;display:inline-block;border-radius:9px;padding:11px 16px;background:#627df3;color:white;font:inherit;font-weight:650;cursor:pointer}button:hover,.button:hover{background:#7990ff;text-decoration:none}button:disabled{opacity:.5;cursor:not-allowed}label{display:block;margin:16px 0 6px;color:#cbd3e6;font-weight:600}input,select,textarea{width:100%;font:inherit;color:#fff;background:#101725;border:1px solid #435070;border-radius:9px;padding:11px}textarea{min-height:115px;resize:vertical}.row{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.row form{margin:0}.message{margin:12px 0;white-space:pre-wrap;overflow-wrap:anywhere}.message small{color:#b4bdd6}.message p{margin:9px 0 0}.alert{background:#3b2832;border:1px solid #a25870;border-radius:10px;padding:14px}.success{background:#1c382f;border-color:#428b6c}nav{display:flex;gap:16px;flex-wrap:wrap;margin:22px 0}.divider{border:0;border-top:1px solid #303950;margin:25px 0}
  </style></head><body><header><a class="brand" href="/">◆ IRONCLAD</a>${session ? `<div class="row"><span class="muted">${esc(session.username)}</span><form method="post" action="/logout"><input type="hidden" name="csrf" value="${session.csrf}"><button>Sign out</button></form></div>` : ''}</header><main>${body}</main></body></html>`;
}
function errorPage(res, message, status = 400, session) { html(res, page('Error', `<h1>Something went wrong</h1><p class="alert">${esc(message)}</p><p><a href="/">Back to dashboard</a></p>`, session), status); }
function sessionFor(req) {
  const key = cookies(req).ironclad_session;
  const value = key && sessions.get(key);
  if (!value) return null;
  if (value.expires <= Date.now()) { sessions.delete(key); return null; }
  return value;
}
async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 8192) throw new Error('Form is too large.');
  }
  return new URLSearchParams(raw);
}
function verifyPost(req, fields, session) {
  // Render may serve a configured hostname that differs from PUBLIC_URL.
  // Browser fetch metadata proves the form came from this exact origin;
  // the per-session token below still prevents forged submissions.
  if (req.headers['sec-fetch-site'] === 'cross-site' || req.headers['sec-fetch-site'] === 'same-site' ||
      (req.headers['sec-fetch-site'] !== 'same-origin' && req.headers.origin !== origin))
    throw new Error('Request origin did not match the dashboard.');
  const actual = fields.get('csrf') || '';
  if (!session || actual.length !== session.csrf.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(session.csrf))) throw new Error('Session expired. Sign in again.');
}
async function discord(path, options = {}) {
  const response = await fetch(`https://discord.com/api/v10${path}`, { ...options, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Discord sign-in failed. Try again.');
  return response.json();
}
function numbers(raw, max) { const n = Number(raw); if (!/^\d+$/.test(String(raw)) || !Number.isSafeInteger(n) || n < 1 || n > max) throw new Error(`Enter a whole number between 1 and ${max}.`); return n; }
function nav(guild) { const base = `/g/${guild.id}`; return `<nav><a href="${base}">Overview</a><a href="${base}/tickets">Tickets</a><a href="${base}/applications">Applications</a><a href="${base}/vouches">Vouches</a><a href="${base}/giveaways">Giveaways</a><a href="${base}/polls">Polls</a></nav>`; }
async function reviewForm(guild, member, app, userId, actionUrl, csrf, availableRoles) {
  if (app.status !== 'pending') return `<p class="muted">${esc(app.status)}${app.assignedRoleId ? ` · role ID ${esc(app.assignedRoleId)}` : ''}</p>`;
  const roles = availableRoles || (applications.reviewerCanAssign(guild, member) ? await applications.assignableRoles(guild, member) : []);
  return `<form method="post" action="${actionUrl}"><input type="hidden" name="csrf" value="${csrf}"><label for="role-${userId}">Role to give if approved</label><select id="role-${userId}" name="roleId"><option value="">Select a role</option>${roles.map(role => `<option value="${role.id}">${esc(role.name)}</option>`).join('')}</select><p class="row"><button name="decision" value="approved" ${roles.length ? '' : 'disabled'}>Approve and give role</button><button name="decision" value="rejected">Decline</button></p>${roles.length ? '' : '<p class="muted">Approving requires Manage Roles permission and a role below yours and the bot’s role. The bot also needs Manage Roles.</p>'}</form>`;
}

module.exports = (bot, store, giveaways, push) => async (req, res) => {
  let session;
  try {
    const url = params(req.url);
    const path = url.pathname;
    if (publicFiles.has(path)) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
      const [filename, contentType] = publicFiles.get(path);
      const contents = readFileSync(join(__dirname, 'public', filename));
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': contents.length,
        'Cache-Control': path === '/sw.js' ? 'no-cache' : 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
        ...(path === '/sw.js' ? { 'Service-Worker-Allowed': '/' } : {})
      });
      return res.end(req.method === 'HEAD' ? undefined : contents);
    }
    session = sessionFor(req);
    if (path === '/health' || path === '/') {
      if (path === '/health') { const ready = bot.isReady(); res.writeHead(ready ? 200 : 503, { 'Content-Type': 'text/plain' }); return res.end(ready ? 'Ironclad Bot is online' : 'Connecting to Discord'); }
      if (!process.env.DISCORD_CLIENT_SECRET || !process.env.CLIENT_ID)
        return html(res, page('Setup', '<h1>Ironclad dashboard</h1><p>Discord sign-in needs the bot application’s OAuth2 Client Secret added to Render as <code>DISCORD_CLIENT_SECRET</code>, and this redirect URL added in the Discord Developer Portal:</p><p><code>' + esc(callback) + '</code></p>'));
      if (!session) return html(res, page('Welcome', '<h1>Run your server in one place.</h1><p class="muted">Reply to tickets, see vouches, and launch giveaways from the same service as your Discord bot.</p><p><a class="button" href="/auth/login">Sign in with Discord</a></p>'));
      const cards = [];
      for (const guild of bot.guilds.cache.values()) {
        const data = store.guild(guild.id);
        if (!data.config.staffRoleId) continue;
        const member = await guild.members.fetch({ user: session.userId, force: true }).catch(() => null);
        const roles = member?.roles.cache;
        if (member && (member.permissions.has(PermissionFlagsBits.ManageGuild) || [data.config.staffRoleId, data.config.ownerRoleId, data.config.coOwnerRoleId].some(id => id && roles.has(id))))
          cards.push(`<div class="card"><h2>${esc(guild.name)}</h2><p>${Object.values(data.tickets).filter(t => t.status === 'open').length} open tickets</p><a class="button" href="/g/${guild.id}">Open dashboard</a></div>`);
      }
      return html(res, page('Servers', `<h1>Your servers</h1><p class="muted">Servers where you have a configured staff, Owner, or Co-Owner role.</p><div class="grid">${cards.join('') || '<p>No configured servers with staff access were found. Run /setup in Discord first.</p>'}</div>`, session));
    }
    if (path === '/auth/login' && req.method === 'GET') {
      if (!process.env.DISCORD_CLIENT_SECRET || !process.env.CLIENT_ID) return redirect(res, '/');
      const state = token(); states.set(state, Date.now() + STATE_MS);
      setCookie(res, 'ironclad_oauth', state, 600);
      const authorize = new URL('https://discord.com/oauth2/authorize');
      authorize.search = new URLSearchParams({ client_id: process.env.CLIENT_ID, redirect_uri: callback, response_type: 'code', scope: 'identify', state });
      return redirect(res, authorize.toString());
    }
    if (path === '/auth/callback' && req.method === 'GET') {
      const state = url.searchParams.get('state') || '';
      if (!states.has(state) || states.get(state) <= Date.now() || state !== cookies(req).ironclad_oauth || !url.searchParams.get('code')) return errorPage(res, 'Discord sign-in expired. Try again.');
      states.delete(state);
      const payload = new URLSearchParams({ client_id: process.env.CLIENT_ID, client_secret: process.env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code: url.searchParams.get('code'), redirect_uri: callback });
      const auth = await discord('/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: payload });
      const user = await discord('/users/@me', { headers: { Authorization: `Bearer ${auth.access_token}` } });
      const key = token(); sessions.set(key, { userId: user.id, username: user.global_name || user.username, csrf: token(), expires: Date.now() + SESSION_MS });
      setCookie(res, 'ironclad_session', key, SESSION_MS / 1000);
      return redirect(res, '/');
    }
    if (path === '/logout' && req.method === 'POST') {
      verifyPost(req, await body(req), session);
      await push?.removeUser(session.userId);
      sessions.delete(cookies(req).ironclad_session);
      setCookie(res, 'ironclad_session', '', 0);
      return redirect(res, '/');
    }
    if (!session) return redirect(res, '/');
    if (path === '/push' && req.method === 'POST') {
      const fields = await body(req); verifyPost(req, fields, session);
      const guildId = fields.get('guildId');
      const guild = bot.guilds.cache.get(guildId);
      if (!guild) return errorPage(res, 'Server not found.', 404, session);
      const cfg = store.guild(guildId).config;
      const member = await guild.members.fetch({ user: session.userId, force: true }).catch(() => null);
      if (!push?.isStaff(member, cfg)) return errorPage(res, 'Staff access required.', 403, session);
      const subscription = JSON.parse(fields.get('subscription') || '{}');
      const subscribed = await push.update(fields.get('action'), session.userId, guildId, subscription);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      return res.end(JSON.stringify({ subscribed }));
    }
    const match = /^\/g\/(\d{17,22})(?:\/(tickets|applications|vouches|giveaways|polls))?(?:\/(\d{17,22}|start|create))?(?:\/(reply|review))?$/.exec(path);
    if (!match) return errorPage(res, 'Page not found.', 404, session);
    let [, guildId, section, ticketId, action] = match;
    if (section === 'giveaways' && ticketId === 'start') { ticketId = undefined; action = 'start'; }
    if (section === 'polls' && ticketId === 'create') { ticketId = undefined; action = 'create'; }
    const guild = bot.guilds.cache.get(guildId);
    if (!guild) return errorPage(res, 'The bot is not in this server.', 404, session);
    const data = store.guild(guildId), cfg = data.config;
    const member = await guild.members.fetch({ user: session.userId, force: true }).catch(() => null);
    const roleIds = member?.roles.cache;
    const manager = !!member && (member.permissions.has(PermissionFlagsBits.ManageGuild) || [cfg.ownerRoleId, cfg.coOwnerRoleId].some(id => id && roleIds.has(id)));
    const staff = manager || !!(cfg.staffRoleId && roleIds?.has(cfg.staffRoleId));
    if (!staff || !cfg.staffRoleId) return errorPage(res, 'You need this server’s staff, Owner, or Co-Owner role.', 403, session);
    const base = `/g/${guildId}`;
    const heading = `<div class="row"><h1>${esc(guild.name)}</h1><span class="pill">Staff dashboard</span></div>${nav(guild)}`;
    if (req.method === 'POST') {
      const fields = await body(req); verifyPost(req, fields, session);
      if (section === 'tickets' && ticketId && action === 'reply') {
        const ticket = data.tickets[ticketId];
        if (!ticket || ticket.status !== 'open') throw new Error('This ticket is closed or unavailable.');
        const reply = (fields.get('reply') || '').trim();
        if (!reply || reply.length > 1800) throw new Error('Reply must be between 1 and 1,800 characters.');
        const channel = await guild.channels.fetch(ticketId).catch(() => null);
        if (!channel?.isTextBased()) throw new Error('Ticket channel unavailable.');
        if (!channel.permissionsFor(member)?.has(PermissionFlagsBits.ViewChannel)) return errorPage(res, 'You cannot view this ticket.', 403, session);
        await channel.send({ content: `**${session.username.replace(/[@*`_~|>]/g, '')} · staff**\n${reply}`, allowedMentions: { parse: [] } });
        return redirect(res, `${base}/tickets/${ticketId}`);
      }
      if (section === 'applications' && ticketId && action === 'review') {
        const decision = fields.get('decision');
        if (!['approved', 'rejected'].includes(decision)) throw new Error('Choose an application decision.');
        const app = data.applications[ticketId];
        const reviewChannel = app && await guild.channels.fetch(app.channelId).catch(() => null);
        if (!reviewChannel?.permissionsFor(member)?.has(PermissionFlagsBits.ViewChannel)) return errorPage(res, 'You cannot view this application.', 403, session);
        await applications.decide({ guild, data, store, bot, userId: ticketId, decision, reviewer: member, roleId: fields.get('roleId') });
        return redirect(res, `${base}/applications`);
      }
      if (section === 'giveaways' && action === 'start' && !ticketId) {
        const kind = fields.get('kind') === 'levels' ? 'levels' : 'standard';
        if (kind === 'levels' && !manager) throw new Error('Only Owner or Co-Owner can start level giveaways.');
        const channelId = fields.get('channel');
        if (!idPattern.test(channelId || '')) throw new Error('Choose a channel.');
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (!channel || channel.type !== ChannelType.GuildText) throw new Error('Choose a text channel in this server.');
        const minutes = numbers(fields.get('minutes'), 10080), winners = numbers(fields.get('winners'), 10);
        const levelAmount = kind === 'levels' ? numbers(fields.get('levels'), 1000000) : null;
        const prize = (fields.get('prize') || '').trim();
        if (kind === 'standard' && (!prize || prize.length > 200)) throw new Error('Prize must be between 1 and 200 characters.');
        await giveaways.start(guild, channel, data, { kind, prize, levels: levelAmount, minutes, winners, hostId: session.userId, hostName: session.username });
        return redirect(res, `${base}/giveaways`);
      }
      if (section === 'polls' && action === 'create' && !ticketId) {
        const channelId = fields.get('channel');
        if (!idPattern.test(channelId || '')) throw new Error('Choose a channel.');
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (!channel?.permissionsFor(member)?.has(PermissionFlagsBits.ViewChannel)) return errorPage(res, 'You cannot view that channel.', 403, session);
        const answers = (fields.get('answers') || '').split(/\r?\n/);
        const message = await polls.create(guild, channel, fields.get('question'), answers, fields.get('hours'));
        await polls.record(data, store, message, session.userId);
        return redirect(res, `${base}/polls?created=${message.id}&channel=${channel.id}`);
      }
      return errorPage(res, 'Action not found.', 404, session);
    }
    if (req.method !== 'GET') return errorPage(res, 'Method not allowed.', 405, session);
    if (!section) {
      const open = Object.values(data.tickets).filter(t => t.status === 'open').length;
      const vouches = Object.values(data.vouches).reduce((total, list) => total + list.length, 0);
      const notificationPanel = push?.enabled ? `<div class="card"><h2>Phone notifications</h2><p>Get alerts for new tickets, vouches, and withdrawals in this server.</p><button type="button" id="push-toggle" data-guild="${guildId}" data-csrf="${session.csrf}" data-key="${esc(push.publicKey)}">Enable notifications on this phone</button><p id="push-status" class="muted" role="status"></p></div>` : '<div class="card"><h2>Phone notifications</h2><p>Phone notifications are not configured yet.</p></div>';
      return html(res, page(guild.name, `${heading}<p class="muted">Manage this server’s tickets, applications, giveaways, and polls directly through Ironclad Bot.</p>${notificationPanel}<div class="grid"><div class="card"><h2>${open} open tickets</h2><a href="${base}/tickets">Answer tickets →</a></div><div class="card"><h2>${Object.values(data.applications).filter(app => app.status === 'pending').length} pending applications</h2><a href="${base}/applications">Review applications →</a></div><div class="card"><h2>${vouches} vouches</h2><a href="${base}/vouches">See vouches →</a></div><div class="card"><h2>${Object.values(data.giveaways).filter(g => g.status === 'open').length} active giveaways</h2><a href="${base}/giveaways">Manage giveaways →</a></div><div class="card"><h2>Polls</h2><a href="${base}/polls">Create and see polls →</a></div></div>`, session));
    }
    if (section === 'tickets') {
      if (ticketId) {
        const ticket = data.tickets[ticketId];
        if (!ticket) return errorPage(res, 'Ticket not found.', 404, session);
        const channel = await guild.channels.fetch(ticketId).catch(() => null);
        if (!channel?.isTextBased()) return errorPage(res, 'Ticket channel unavailable.', 404, session);
        if (!channel.permissionsFor(member)?.has(PermissionFlagsBits.ViewChannel)) return errorPage(res, 'You cannot view this ticket.', 403, session);
        const messages = [...(await channel.messages.fetch({ limit: 50 })).values()].reverse();
        const lines = messages.map(msg => `<div class="message"><small>${esc(msg.author?.globalName || msg.author?.username || 'Unknown')} · ${esc(new Date(msg.createdTimestamp).toLocaleString())}</small><p>${esc(msg.content || msg.embeds?.[0]?.description || '[attachment or embed]')}</p>${(msg.embeds || []).flatMap(embed => embed.fields || []).map(field => `<p><b>${esc(field.name)}:</b> ${esc(field.value)}</p>`).join('')}${msg.attachments.size ? '<small>Attachments are available in Discord.</small>' : ''}</div>`).join('');
        const form = ticket.status === 'open' ? `<form method="post" action="${base}/tickets/${ticketId}/reply"><input type="hidden" name="csrf" value="${session.csrf}"><label for="reply">Reply as staff</label><textarea id="reply" name="reply" maxlength="1800" required></textarea><p><button>Send reply to Discord</button></p></form>` : '<p class="muted">This ticket is closed. Reopen it in Discord to reply.</p>';
        const application = ticket.type === 'application' && data.applications[ticket.ownerId]?.channelId === ticketId ? data.applications[ticket.ownerId] : null;
        const review = application ? `<hr class="divider"><h2>Application: ${esc(application.status)}</h2>${await reviewForm(guild, member, application, ticket.ownerId, `${base}/applications/${ticket.ownerId}/review`, session.csrf)}` : '';
        return html(res, page('Ticket', `${heading}<h2>#${esc(channel.name)} <span class="pill">${esc(ticket.status)}</span></h2><p class="muted">Opened by <code>${esc(ticket.ownerId)}</code>${ticket.type === 'withdrawal' ? ` · Withdrawal: ${esc(ticket.amount)} levels` : ''}</p><p><a href="https://discord.com/channels/${guildId}/${ticketId}">Open in Discord ↗</a></p>${lines || '<p>No messages yet.</p>'}${review}<hr class="divider">${form}`, session));
      }
      const rows = Object.entries(data.tickets).sort((a, b) => b[1].createdAt.localeCompare(a[1].createdAt)).slice(0, 100).map(([id, ticket]) => `<div class="card"><span class="pill">${esc(ticket.status)}</span> <b>${ticket.type === 'withdrawal' ? 'Withdrawal' : ticket.type === 'application' ? 'Application' : 'Ticket'}</b><p>${esc(ticket.ownerId)}${ticket.amount ? ` · ${esc(ticket.amount)} levels` : ''}</p><a href="${base}/tickets/${id}">Read and reply →</a></div>`).join('');
      return html(res, page('Tickets', `${heading}<h2>Tickets</h2><div class="grid">${rows || '<p>No tickets yet.</p>'}</div>`, session));
    }
    if (section === 'applications' && !ticketId) {
      const roles = applications.reviewerCanAssign(guild, member) ? await applications.assignableRoles(guild, member) : [];
      const rows = await Promise.all(Object.entries(data.applications).sort((a, b) => (b[1].submittedAt || '').localeCompare(a[1].submittedAt || '')).slice(0, 100).map(async ([userId, app]) => {
        const channel = await guild.channels.fetch(app.channelId).catch(() => null);
        if (!channel?.permissionsFor(member)?.has(PermissionFlagsBits.ViewChannel)) return '';
        const form = await reviewForm(guild, member, app, userId, `${base}/applications/${userId}/review`, session.csrf, roles);
        return `<div class="card"><span class="pill">${esc(app.status)}</span><h2>Application from ${esc(userId)}</h2><p><b>Requested role:</b> ${esc(app.role || 'Not specified')}</p><p><b>Experience:</b> ${esc(app.experience || 'See application in Discord')}</p><p><b>Why:</b> ${esc(app.why || 'See application in Discord')}</p><p><a href="https://discord.com/channels/${guildId}/${app.channelId}">Open in Discord ↗</a>${data.tickets[app.channelId] ? ` · <a href="${base}/tickets/${app.channelId}">Read and reply →</a>` : ''}</p>${form}</div>`;
      }));
      return html(res, page('Applications', `${heading}<h2>Applications</h2><div class="grid">${rows.join('') || '<p>No applications yet.</p>'}</div>`, session));
    }
    if (section === 'vouches' && !ticketId) {
      const rows = Object.entries(data.vouches).flatMap(([user, list]) => list.map(v => ({ user, ...v }))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 150).map(v => `<div class="card"><b>For ${esc(v.user)}</b><p>${esc(v.reason)}</p><small class="muted">From ${esc(v.authorId)} · ${esc(new Date(v.at).toLocaleString())}</small></div>`).join('');
      return html(res, page('Vouches', `${heading}<h2>Vouches</h2><div class="grid">${rows || '<p>No vouches yet.</p>'}</div>`, session));
    }
    if (section === 'giveaways' && !ticketId) {
      const self = await guild.members.fetchMe();
      const channels = [...guild.channels.cache.values()].filter(ch => ch.type === ChannelType.GuildText && ch.permissionsFor(self)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory])).sort((a, b) => a.name.localeCompare(b.name));
      const form = `<div class="card"><h2>Start a giveaway</h2><form method="post" action="${base}/giveaways/start"><input type="hidden" name="csrf" value="${session.csrf}"><label for="channel">Channel</label><select id="channel" name="channel" required>${channels.map(ch => `<option value="${ch.id}">#${esc(ch.name)}</option>`).join('')}</select><label for="kind">Type</label><select id="kind" name="kind"><option value="standard">Prize giveaway</option>${manager ? '<option value="levels">Level giveaway (levels per winner)</option>' : ''}</select><label for="prize">Prize (for a prize giveaway)</label><input id="prize" name="prize" maxlength="200" placeholder="e.g. Nitro"><label for="levels">Levels per winner (for a level giveaway)</label><input id="levels" name="levels" type="number" min="1" max="1000000" placeholder="e.g. 5"><label for="minutes">Duration in minutes</label><input id="minutes" name="minutes" type="number" min="1" max="10080" required value="60"><label for="winners">Winners</label><input id="winners" name="winners" type="number" min="1" max="10" required value="1"><p><button ${channels.length ? '' : 'disabled'}>Post giveaway in Discord</button></p></form></div>`;
      const list = Object.entries(data.giveaways).sort((a, b) => b[1].endAt - a[1].endAt).slice(0, 40).map(([id, g]) => `<div class="card"><span class="pill">${esc(g.status)}</span> <b>${esc(g.prize)}</b><p>${g.entries.length} entries · ${g.winnerCount} winners</p><p class="muted">Ends ${esc(new Date(g.endAt).toLocaleString())}</p><a href="https://discord.com/channels/${guildId}/${g.channelId}/${id}">Open in Discord ↗</a></div>`).join('');
      return html(res, page('Giveaways', `${heading}${form}<h2>Recent giveaways</h2><div class="grid">${list || '<p>No giveaways yet.</p>'}</div>`, session));
    }
    if (section === 'polls' && !ticketId) {
      const self = await guild.members.fetchMe();
      const viewable = [...guild.channels.cache.values()].filter(ch => ch.type === ChannelType.GuildText &&
        ch.permissionsFor(self)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]) &&
        ch.permissionsFor(member)?.has(PermissionFlagsBits.ViewChannel))
        .sort((a, b) => a.name.localeCompare(b.name));
      const channels = viewable.filter(ch => ch.permissionsFor(self)?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.SendPolls]));
      await polls.discover(guild, data, store, viewable);
      const created = url.searchParams.get('created');
      const createdChannel = url.searchParams.get('channel');
      const success = idPattern.test(created || '') && idPattern.test(createdChannel || '') && data.polls?.[created]?.channelId === createdChannel ?
        `<p class="card success">Poll posted. <a href="https://discord.com/channels/${guildId}/${createdChannel}/${created}">View it in Discord ↗</a></p>` : '';
      const form = `<div class="card"><h2>Create a poll</h2><p class="muted">Votes and results are handled by Discord.</p>${channels.length ? '' : '<p class="alert">No channels are available for polls. Give the bot View Channel, Send Messages, Read Message History, and Create Polls in a text channel.</p>'}<form method="post" action="${base}/polls/create"><input type="hidden" name="csrf" value="${session.csrf}"><label for="poll-channel">Channel</label><select id="poll-channel" name="channel" required>${channels.map(ch => `<option value="${ch.id}">#${esc(ch.name)}</option>`).join('')}</select><label for="question">Question</label><input id="question" name="question" maxlength="300" required><label for="answers">Answers (one per line, 2–10)</label><textarea id="answers" name="answers" required placeholder="Yes&#10;No"></textarea><label for="hours">Duration in hours (1–768)</label><input id="hours" name="hours" type="number" min="1" max="768" required value="24"><p><button ${channels.length ? '' : 'disabled'}>Post poll in Discord</button></p></form></div>`;
      const recent = await Promise.all(Object.entries(data.polls || {}).sort((a, b) => (b[1].createdAt || '').localeCompare(a[1].createdAt || '')).slice(0, 40).map(async ([messageId, saved]) => {
        const channel = viewable.find(ch => ch.id === saved.channelId);
        if (!channel) return '';
        const message = await channel.messages.fetch(messageId).catch(() => null);
        const poll = message?.poll;
        const answers = poll?.answers ? [...poll.answers.values()].map(answer => `<li>${esc(answer.text || 'Answer')} — ${Number(answer.voteCount || 0).toLocaleString()} votes</li>`).join('') : '';
        const ended = poll?.resultsFinalized || (poll?.expiresTimestamp && poll.expiresTimestamp <= Date.now());
        return `<div class="card"><span class="pill">${message ? ended ? 'ended' : 'open' : 'unavailable'}</span><h2>${esc(poll?.question?.text || saved.question)}</h2><p class="muted">#${esc(channel.name)} · ${esc(new Date(saved.createdAt).toLocaleString())}</p>${answers ? `<ul>${answers}</ul>` : ''}<a href="https://discord.com/channels/${guildId}/${saved.channelId}/${messageId}">Open poll in Discord ↗</a></div>`;
      }));
      return html(res, page('Polls', `${heading}${success}${form}<h2>Recent polls</h2><div class="grid">${recent.join('') || '<p>No polls found yet. Create one above.</p>'}</div>`, session));
    }
    return errorPage(res, 'Page not found.', 404, session);
  } catch (err) {
    console.error('Dashboard request failed:', err);
    return errorPage(res, err.message?.startsWith('I need ') || /^(Enter|Choose|Prize|Reply|Session|Request|This ticket|This application|The applicant|Manage Roles|Only Owner|Ticket channel|Poll)/.test(err.message || '') ? err.message : 'The dashboard could not complete that request. Check the bot permissions and try again.', 400, session);
  }
};
