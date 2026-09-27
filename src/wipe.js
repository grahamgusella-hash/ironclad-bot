const { randomBytes } = require('node:crypto');
const { ChannelType, PermissionFlagsBits, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = bot => {
  const pending = new Map();
  const active = new Set();
  const allowed = async (i, cfg) => {
    if (i.user.id === i.guild.ownerId) return true;
    const ids = [cfg.ownerRoleId, cfg.coOwnerRoleId].filter(Boolean);
    if (!ids.length) return false;
    const member = await i.guild.members.fetch({ user: i.user.id, force: true }).catch(() => null);
    return !!member && ids.some(id => member.roles.cache.has(id));
  };
  const botCanWipe = async channel => {
    const me = await channel.guild.members.fetchMe();
    return !!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages]);
  };

  async function preview(i, data) {
    if (!await allowed(i, data.config))
      return i.reply({ content: 'Only the server owner or the configured Owner and Co-Owner roles can use /wipe. Select the roles in /setup.', flags: MessageFlags.Ephemeral });
    if (i.channel?.type !== ChannelType.GuildText)
      return i.reply({ content: 'Run /wipe in a server text channel.', flags: MessageFlags.Ephemeral });
    if (active.has(i.channelId))
      return i.reply({ content: 'A wipe is already running in this channel.', flags: MessageFlags.Ephemeral });
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    if (!await botCanWipe(i.channel))
      return i.editReply('I need View Channel, Read Message History, and Manage Messages in this channel.');
    const key = randomBytes(16).toString('hex');
    pending.set(key, { guildId: i.guildId, channelId: i.channelId, requesterId: i.user.id, expires: Date.now() + 120000 });
    const timer = setTimeout(() => pending.delete(key), 120000);
    timer.unref?.();
    return i.editReply({ content: `**Wipe #${i.channel.name}?** This permanently deletes all messages in this channel, including pinned messages and polls. Older messages will be deleted individually, which can take time. The channel itself stays. Confirm within 2 minutes.`,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`wipe:confirm:${key}`).setLabel('Delete all messages').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`wipe:cancel:${key}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary))] });
  }

  async function button(i, data) {
    const match = /^wipe:(confirm|cancel):([0-9a-f]{32})$/.exec(i.customId);
    if (!match) return false;
    const [, action, key] = match;
    const plan = pending.get(key);
    if (!plan || plan.expires < Date.now() || plan.guildId !== i.guildId ||
        plan.channelId !== i.channelId || plan.requesterId !== i.user.id) {
      await i.reply({ content: 'This confirmation expired or belongs to someone else. Run /wipe again.', flags: MessageFlags.Ephemeral });
      return true;
    }
    pending.delete(key);
    if (action === 'cancel') {
      await i.update({ content: 'Wipe canceled. No messages were deleted.', components: [] });
      return true;
    }
    if (!await allowed(i, data.config) || !await botCanWipe(i.channel)) {
      await i.update({ content: 'Permissions changed. No messages were deleted.', components: [] });
      return true;
    }
    if (active.has(i.channelId)) {
      await i.update({ content: 'A wipe is already running in this channel.', components: [] });
      return true;
    }
    active.add(i.channelId);
    await i.update({ content: `Wiping #${i.channel.name}. I’ll update this result when finished.`, components: [] });
    (async () => {
      let deleted = 0, failed = 0, before;
      while (true) {
        const page = await i.channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
        if (!page.size) break;
        const list = [...page.values()];
        before = list.at(-1).id;
        // Bulk deletion cannot include messages older than two weeks.
        const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000 + 60000;
        const recent = list.filter(msg => msg.createdTimestamp > cutoff);
        const old = list.filter(msg => msg.createdTimestamp <= cutoff);
        if (recent.length > 1) {
          try {
            const gone = await i.channel.bulkDelete(recent, true);
            deleted += gone.size;
            if (gone.size < recent.length) {
              const removed = new Set(gone.keys());
              old.push(...recent.filter(msg => !removed.has(msg.id)));
            }
          } catch (error) {
            console.error('Wipe bulk deletion failed:', error);
            old.push(...recent);
          }
        } else old.push(...recent);
        for (const msg of old) {
          try { await msg.delete(); deleted++; }
          catch (error) { failed++; console.error(`Wipe failed for message ${msg.id}:`, error); }
        }
        if (page.size < 100) break;
      }
      console.log(`Wipe in ${i.guildId}/${i.channelId}: ${deleted} deleted, ${failed} failed.`);
      await i.editReply(`Wipe finished: **${deleted} messages deleted**${failed ? `, ${failed} failed` : ''}.`).catch(console.error);
    })().catch(async error => {
      console.error('Wipe failed:', error);
      await i.editReply('Wipe stopped early because Discord could not fetch more messages. Check the channel for remaining messages.').catch(console.error);
    }).finally(() => active.delete(i.channelId));
    return true;
  }

  return { preview, button };
};
