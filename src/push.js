const webpush = require('web-push');
const { createHash } = require('node:crypto');
const { PermissionFlagsBits } = require('discord.js');

module.exports = (bot, store) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY || '';
  const enabled = !!(publicKey && privateKey);
  if (enabled) webpush.setVapidDetails(process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || 'https://ironclad-bot.onrender.com', publicKey, privateKey);
  const saved = () => store.state.pushSubscriptions ||= {};
  const keyFor = endpoint => createHash('sha256').update(endpoint).digest('hex');
  const isStaff = (member, cfg) => !!member && !!cfg.staffRoleId &&
    (member.permissions.has(PermissionFlagsBits.ManageGuild) ||
      [cfg.staffRoleId, cfg.ownerRoleId, cfg.coOwnerRoleId].some(id => id && member.roles.cache.has(id)));
  const allowedEndpoint = endpoint => {
    try {
      const url = new URL(endpoint);
      return url.protocol === 'https:' && endpoint.length <= 2048 && !url.username && !url.password && !url.port &&
        ['fcm.googleapis.com', 'fcm-xm.googleapis.com', 'android.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(url.hostname);
    } catch { return false; }
  };
  function validate(subscription) {
    if (!subscription || !allowedEndpoint(subscription.endpoint) ||
        !/^[A-Za-z0-9_-]{80,120}$/.test(subscription.keys?.p256dh || '') ||
        !/^[A-Za-z0-9_-]{16,40}$/.test(subscription.keys?.auth || ''))
      throw new Error('Invalid phone notification subscription.');
  }
  function update(action, userId, guildId, subscription) {
    if (!enabled) throw new Error('Phone notifications are not configured yet.');
    validate(subscription);
    const key = keyFor(subscription.endpoint);
    const records = saved();
    const existing = records[key];
    if (action === 'status') return !!(existing?.userId === userId && existing.guildIds.includes(guildId));
    if (action === 'unsubscribe') {
      if (existing?.userId === userId) {
        existing.guildIds = existing.guildIds.filter(id => id !== guildId);
        if (!existing.guildIds.length) delete records[key];
        store.save();
      }
      return false;
    }
    if (action !== 'subscribe') throw new Error('Invalid notification action.');
    // A subscription belongs to the person currently signed in on that browser.
    const guildIds = existing?.userId === userId ? [...new Set([...existing.guildIds, guildId])] : [guildId];
    const otherDevices = Object.values(records).filter(r => r.userId === userId && r.guildIds.includes(guildId)).length;
    if (!existing && otherDevices >= 10) throw new Error('Too many phones subscribed to this server.');
    records[key] = { userId, guildIds, subscription };
    store.save();
    return true;
  }
  function removeUser(userId) {
    const records = saved();
    let changed = false;
    for (const [key, record] of Object.entries(records)) {
      if (record.userId === userId) { delete records[key]; changed = true; }
    }
    if (changed) store.save();
  }
  async function notify(guild, type, title, body, target, channel) {
    if (!enabled) return;
    const records = Object.entries(saved()).filter(([, r]) => r.guildIds.includes(guild.id));
    if (!records.length) return;
    const cfg = store.guild(guild.id).config;
    const destination = channel;
    if (!destination) return;
    for (const [key, record] of records) {
      try {
        const member = await guild.members.fetch({ user: record.userId, force: true }).catch(() => null);
        if (!isStaff(member, cfg) || !destination.permissionsFor(member)?.has(PermissionFlagsBits.ViewChannel)) continue;
        await webpush.sendNotification(record.subscription,
          JSON.stringify({ title: `${guild.name}: ${title}`, body, url: target, tag: `${type}-${guild.id}-${target.split('/').at(-1)}` }),
          { TTL: 3600 });
      } catch (error) {
        if ([404, 410].includes(error.statusCode)) { delete saved()[key]; store.save(); }
        else console.error('Phone notification failed:', error.statusCode || error.message);
      }
    }
  }
  return { publicKey, enabled, isStaff, update, removeUser, notify };
};
