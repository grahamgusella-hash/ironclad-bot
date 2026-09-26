const { randomInt } = require('node:crypto');
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  MessageFlags, PermissionFlagsBits
} = require('discord.js');

function safe(value) { return String(value).replace(/@/g, '@\u200b').replace(/[`*_~|>]/g, ''); }
const privateReply = content => ({ content, flags: MessageFlags.Ephemeral });

function controls(id, disabled = false) {
  return [new ActionRowBuilder().addComponents(new ButtonBuilder()
    .setCustomId(`giveaway:enter:${id}`).setLabel('Enter giveaway')
    .setStyle(ButtonStyle.Primary).setDisabled(disabled))];
}
function embed(record) {
  return new EmbedBuilder().setTitle(record.status === 'open' ? '🎉 Giveaway' : '🎉 Giveaway ended')
    .setColor(record.status === 'open' ? 0x5865f2 : 0x2ecc71)
    .addFields(
      { name: 'Prize', value: safe(record.prize) },
      { name: 'Winners', value: String(record.winnerCount), inline: true },
      { name: 'Entries', value: String(record.entries.length), inline: true },
      { name: record.status === 'open' ? 'Ends' : 'Ended', value: `<t:${Math.floor(record.endAt / 1000)}:F>` },
      ...(record.status === 'ended' ? [{ name: 'Drawn winners', value: record.winners.length ? record.winners.map(id => `<@${id}>`).join(', ') : 'No entries' }] : [])
    ).setFooter({ text: `Hosted by ${record.hostName}` });
}
function draw(record, count, exclude = []) {
  const pool = record.entries.filter(id => !exclude.includes(id));
  const result = [];
  while (pool.length && result.length < count) result.push(pool.splice(randomInt(pool.length), 1)[0]);
  return result;
}

module.exports = (bot, store) => {
  const inProgress = new Set();

  async function finish(guildId, messageId) {
    const key = `${guildId}:${messageId}`;
    if (inProgress.has(key)) return false;
    inProgress.add(key);
    try {
      const record = store.guild(guildId).giveaways[messageId];
      if (!record || record.status !== 'open') return false;
      const guild = await bot.guilds.fetch(guildId);
      const channel = await guild.channels.fetch(record.channelId);
      if (!channel?.isTextBased()) throw new Error(`Giveaway channel unavailable: ${record.channelId}`);
      const message = await channel.messages.fetch(messageId);
      record.winners = draw(record, record.winnerCount);
      record.status = 'ended';
      record.endedAt = Date.now();
      store.save();
      await message.edit({ embeds: [embed(record)], components: controls(messageId, true), allowedMentions: { parse: [] } });
      await channel.send({ content: record.winners.length
        ? `🎉 Giveaway ended! ${record.winners.map(id => `<@${id}>`).join(', ')} won **${safe(record.prize)}**. Congratulations!`
        : `Giveaway ended: **${safe(record.prize)}**. No one entered.`,
        allowedMentions: { users: record.winners } });
      return true;
    } finally { inProgress.delete(key); }
  }

  async function command(i, data, isStaff) {
    if (!isStaff) return i.reply(privateReply('Only staff can manage giveaways.'));
    const action = i.options.getSubcommand();
    if (action === 'start') {
      const self = await i.guild.members.fetchMe();
      if (!i.channel?.isTextBased() || !i.channel.permissionsFor(self)?.has([
        PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory
      ])) return i.reply(privateReply('I need View Channel, Send Messages, Embed Links, and Read Message History here.'));
      const minutes = i.options.getInteger('minutes');
      const record = {
        prize: i.options.getString('prize'), winnerCount: i.options.getInteger('winners') || 1,
        hostId: i.user.id, hostName: safe(i.user.username), channelId: i.channelId,
        endAt: Date.now() + minutes * 60000, entries: [], winners: [], status: 'open'
      };
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const msg = await i.channel.send({ embeds: [embed(record)], allowedMentions: { parse: [] } });
      data.giveaways[msg.id] = record;
      store.save();
      await msg.edit({ components: controls(msg.id) });
      return i.editReply(`Giveaway started: ${msg.url}`);
    }
    const id = i.options.getString('message_id');
    if (!/^\d{17,22}$/.test(id)) return i.reply(privateReply('Enter a valid giveaway message ID.'));
    const record = data.giveaways[id];
    if (!record || record.channelId !== i.channelId) return i.reply(privateReply('No giveaway with that message ID exists in this channel.'));
    if (action === 'end') {
      if (record.status !== 'open') return i.reply(privateReply('This giveaway has already ended.'));
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const ended = await finish(i.guildId, id);
      return i.editReply(ended ? 'Giveaway ended and winners drawn.' : 'Giveaway is already ending.');
    }
    if (record.status !== 'ended') return i.reply(privateReply('End the giveaway before rerolling.'));
    const next = draw(record, 1, record.winners);
    if (!next.length) return i.reply(privateReply('No eligible entrants remain for a reroll.'));
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const msg = await i.channel.messages.fetch(id);
    record.winners.push(next[0]);
    store.save();
    await msg.edit({ embeds: [embed(record)], allowedMentions: { parse: [] } });
    await i.channel.send({ content: `🎉 Reroll for **${safe(record.prize)}**: <@${next[0]}> is the new winner!`, allowedMentions: { users: next } });
    return i.editReply('New winner drawn.');
  }

  async function enter(i, data) {
    const id = i.customId.slice('giveaway:enter:'.length);
    const record = data.giveaways[id];
    if (!record || id !== i.message.id || record.channelId !== i.channelId) return i.reply(privateReply('This giveaway is unavailable.'));
    if (record.status !== 'open' || Date.now() >= record.endAt) return i.reply(privateReply('This giveaway has ended.'));
    if (i.user.bot) return i.reply(privateReply('Bots cannot enter giveaways.'));
    if (record.entries.includes(i.user.id)) return i.reply(privateReply('You have already entered.'));
    record.entries.push(i.user.id);
    store.save();
    await i.reply(privateReply('You are entered. Good luck!'));
    await i.message.edit({ embeds: [embed(record)], components: controls(id), allowedMentions: { parse: [] } });
  }

  async function sweep() {
    const now = Date.now();
    for (const [guildId, data] of Object.entries(store.state.guilds)) {
      for (const [messageId, record] of Object.entries(data.giveaways || {})) {
        if (record.status === 'open' && record.endAt <= now) {
          await finish(guildId, messageId).catch(err => console.error(`Giveaway ${messageId}:`, err));
        }
      }
    }
  }

  return { command, enter, sweep };
};
