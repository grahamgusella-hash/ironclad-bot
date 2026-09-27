const { randomBytes } = require('node:crypto');
const { Routes, PermissionFlagsBits, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// The preview and confirmation are deliberately kept in memory: a restart cancels them.
module.exports = bot => {
  const pending = new Map();
  const active = new Map();

  async function listMembers(guild) {
    const members = [];
    let after;
    while (true) {
      const query = new URLSearchParams({ limit: '1000', ...(after ? { after } : {}) });
      const page = await bot.rest.get(Routes.guildMembers(guild.id), { query });
      if (!Array.isArray(page)) throw new Error('Discord did not return a member list.');
      members.push(...page);
      if (page.length < 1000) break;
      const last = page.at(-1)?.user?.id;
      if (!last || last === after) throw new Error('Discord did not return the next member page.');
      after = last;
    }
    return members;
  }

  function eligible(record, guild, me) {
    const id = record.user?.id;
    if (!id || id === guild.ownerId || id === bot.user.id) return false;
    return (record.roles || []).every(roleId => {
      const role = guild.roles.cache.get(roleId);
      return !role || me.roles.highest.comparePositionTo(role) > 0;
    });
  }

  async function preview(i) {
    if (i.user.id !== i.guild.ownerId)
      return i.reply({ content: 'Only the actual server owner can use /purge.', flags: MessageFlags.Ephemeral });
    if (active.has(i.guildId))
      return i.reply({ content: 'A purge is already running in this server.', flags: MessageFlags.Ephemeral });
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const me = await i.guild.members.fetchMe();
    if (!me.permissions.has(PermissionFlagsBits.BanMembers))
      return i.editReply('Give the bot Ban Members permission before using /purge.');
    let roster;
    try {
      await i.guild.roles.fetch();
      roster = await listMembers(i.guild);
    } catch (error) {
      console.error('Purge member-list request failed:', error);
      return i.editReply('I could not list every member. Enable **Server Members Intent** for this bot in the Discord Developer Portal (Bot → Privileged Gateway Intents), then try again. Nobody was banned.');
    }
    const ids = roster.filter(record => eligible(record, i.guild, me)).map(record => record.user.id);
    const key = randomBytes(16).toString('hex');
    pending.set(key, { guildId: i.guildId, ownerId: i.user.id, ids, expires: Date.now() + 120000 });
    const timer = setTimeout(() => pending.delete(key), 120000);
    timer.unref?.();
    return i.editReply({ content: `**Purge preview for ${i.guild.name}**\n${ids.length} member(s) can be banned. ${roster.length - ids.length} member(s) will be skipped, including the server owner, this bot, and members protected by role hierarchy. **This includes staff with roles below the bot and cannot be undone automatically.**\nConfirm within 2 minutes to start banning the ${ids.length} eligible members.`,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`purge:confirm:${key}`).setLabel(`Ban ${ids.length} members`).setStyle(ButtonStyle.Danger).setDisabled(!ids.length),
        new ButtonBuilder().setCustomId(`purge:cancel:${key}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary))] });
  }

  async function button(i) {
    const match = /^purge:(confirm|cancel):([0-9a-f]{32})$/.exec(i.customId);
    if (!match) return false;
    const [, action, key] = match;
    const plan = pending.get(key);
    if (!plan || plan.expires < Date.now() || plan.guildId !== i.guildId || plan.ownerId !== i.user.id || i.guild.ownerId !== i.user.id) {
      await i.reply({ content: 'This confirmation has expired or belongs to someone else. Run /purge again.', flags: MessageFlags.Ephemeral });
      return true;
    }
    pending.delete(key);
    if (action === 'cancel') {
      await i.update({ content: 'Purge canceled. Nobody was banned.', components: [] });
      return true;
    }
    if (active.has(i.guildId) || !plan.ids.length) {
      await i.update({ content: 'There are no eligible members, or a purge is already running.', components: [] });
      return true;
    }
    // Confirm immediately, then do the slow work without holding an interaction open.
    active.set(i.guildId, { banned: 0, skipped: 0, failed: 0 });
    await i.update({ content: `Purge started for ${plan.ids.length} eligible members. I’ll update this result when finished.`, components: [] });
    const result = active.get(i.guildId);
    (async () => {
      for (const id of plan.ids) {
        try {
          const member = await i.guild.members.fetch({ user: id, force: true }).catch(() => null);
          if (!member || member.id === i.guild.ownerId || !member.bannable) { result.skipped++; continue; }
          await member.ban({ reason: `Server owner ${i.user.id} confirmed /purge` });
          result.banned++;
        } catch (error) {
          result.failed++;
          console.error(`Purge failed for member ${id} in ${i.guildId}:`, error);
        }
      }
      console.log(`Purge in ${i.guildId} finished: ${result.banned} banned, ${result.skipped} skipped, ${result.failed} failed.`);
      await i.editReply(`Purge finished: **${result.banned} banned**, ${result.skipped} skipped, ${result.failed} failed.`).catch(console.error);
    })().catch(console.error).finally(() => active.delete(i.guildId));
    return true;
  }

  return { preview, button };
};
