const { randomBytes } = require('node:crypto');
const { ChannelType, PermissionFlagsBits, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Pending confirmations are held in memory, so a restart cancels them.
module.exports = (bot, store) => {
  const pending = new Map();
  const active = new Set();
  const ticketName = /^(ticket|closed|withdraw)-/;

  function isTicket(channel, data) {
    if (!channel || channel.type !== ChannelType.GuildText) return false;
    if ([data.config.applicationsChannelId, data.config.vouchesChannelId, data.config.logsChannelId].includes(channel.id)) return false;
    return Object.hasOwn(data.tickets, channel.id) ||
      (channel.parentId === data.config.categoryId && ticketName.test(channel.name));
  }

  async function preview(i, data) {
    if (i.user.id !== i.guild.ownerId)
      return i.reply({ content: 'Only the actual server owner can use /purge.', flags: MessageFlags.Ephemeral });
    if (active.has(i.guildId))
      return i.reply({ content: 'A ticket purge is already running in this server.', flags: MessageFlags.Ephemeral });
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const me = await i.guild.members.fetchMe();
    if (!me.permissions.has(PermissionFlagsBits.ManageChannels))
      return i.editReply('Give the bot Manage Channels permission before using /purge.');
    if (!data.config.categoryId) return i.editReply('Run /setup to select the ticket category first.');
    const channels = await i.guild.channels.fetch();
    const ids = [...channels.values()].filter(channel => isTicket(channel, data)).map(channel => channel.id);
    const key = randomBytes(16).toString('hex');
    pending.set(key, { guildId: i.guildId, ownerId: i.user.id, ids, expires: Date.now() + 120000 });
    const timer = setTimeout(() => pending.delete(key), 120000);
    timer.unref?.();
    return i.editReply({ content: `**Ticket purge preview for ${i.guild.name}**\n${ids.length} ticket channel(s) will be permanently deleted, including open, closed, and withdrawal tickets. Their messages cannot be recovered. This will not change level balances, applications, vouches, or giveaways.\nConfirm within 2 minutes to delete these ${ids.length} ticket channels.`,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`purge:confirm:${key}`).setLabel(`Delete ${ids.length} tickets`).setStyle(ButtonStyle.Danger).setDisabled(!ids.length),
        new ButtonBuilder().setCustomId(`purge:cancel:${key}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary))] });
  }

  async function button(i, data) {
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
      await i.update({ content: 'Ticket purge canceled. No channels were deleted.', components: [] });
      return true;
    }
    if (active.has(i.guildId) || !plan.ids.length) {
      await i.update({ content: 'There are no tickets to delete, or a ticket purge is already running.', components: [] });
      return true;
    }
    const me = await i.guild.members.fetchMe();
    if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await i.update({ content: 'Give the bot Manage Channels permission before using /purge.', components: [] });
      return true;
    }
    active.add(i.guildId);
    await i.update({ content: `Deleting ${plan.ids.length} ticket channels. I’ll update this result when finished.`, components: [] });
    (async () => {
      let deleted = 0;
      let skipped = 0;
      let failed = 0;
      for (const id of plan.ids) {
        try {
          const channel = await i.guild.channels.fetch(id).catch(() => null);
          if (!channel || !isTicket(channel, data)) {
            skipped++;
            if (!channel && Object.hasOwn(data.tickets, id)) { delete data.tickets[id]; store.save(); }
            continue;
          }
          await channel.delete(`Ticket purge confirmed by server owner ${i.user.id}`);
          delete data.tickets[id];
          store.save();
          deleted++;
        } catch (error) {
          failed++;
          console.error(`Ticket purge failed for channel ${id} in ${i.guildId}:`, error);
        }
      }
      console.log(`Ticket purge in ${i.guildId} finished: ${deleted} deleted, ${skipped} skipped, ${failed} failed.`);
      await i.editReply(`Ticket purge finished: **${deleted} deleted**, ${skipped} skipped, ${failed} failed.`).catch(console.error);
    })().catch(console.error).finally(() => active.delete(i.guildId));
    return true;
  }

  return { preview, button };
};
