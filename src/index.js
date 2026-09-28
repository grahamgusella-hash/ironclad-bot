require('dotenv').config();
const http = require('node:http');
const {
  Client, GatewayIntentBits, ChannelType, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder,
  TextInputBuilder, TextInputStyle, MessageFlags, EmbedBuilder, RoleSelectMenuBuilder
} = require('discord.js');
const store = require('./store');
const levels = require('./levels');
const polls = require('./polls');
const applications = require('./applications');

if (!process.env.DISCORD_TOKEN) throw new Error('Missing DISCORD_TOKEN in .env');
const bot = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent] });
const giveaways = require('./giveaways')(bot, store);
const push = require('./push')(bot, store);
const purge = require('./purge')(bot, store);
const wipe = require('./wipe')(bot);
// The website and bot share one process and the same per-server data store.
if (process.env.PORT) {
  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  http.createServer(require('./web')(bot, store, giveaways, push)).listen(port, '0.0.0.0',
    () => console.log(`Ironclad dashboard listening on port ${port}`));
}
const privateReply = content => ({ content, flags: MessageFlags.Ephemeral });
const row = (id, label, style) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style)
);
const staff = (i, cfg) => i.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
  (cfg.staffRoleId && (i.member?.roles?.cache?.has(cfg.staffRoleId) ||
    (Array.isArray(i.member?.roles) && i.member.roles.includes(cfg.staffRoleId))));
const configValid = cfg => cfg.staffRoleId && cfg.categoryId && cfg.applicationsChannelId && cfg.vouchesChannelId;
const safe = s => String(s).replace(/@/g, '@\u200b').replace(/[`*_~|>]/g, '');
const mentions = { parse: [] };

async function log(guild, cfg, content) {
  if (!cfg.logsChannelId) return;
  const ch = await guild.channels.fetch(cfg.logsChannelId).catch(() => null);
  if (ch?.isTextBased()) await ch.send({ content, allowedMentions: mentions }).catch(console.error);
}

async function openTicket(i, data) {
  const cfg = data.config;
  if (!configValid(cfg)) return i.reply(privateReply('An admin must run /setup first.'));
  const prior = Object.entries(data.tickets).find(([, t]) => t.ownerId === i.user.id && t.status === 'open' && t.type !== 'withdrawal');
  if (prior) {
    const ch = await i.guild.channels.fetch(prior[0]).catch(() => null);
    if (ch) return i.reply(privateReply(`You already have an open ticket: ${ch}.`));
    delete data.tickets[prior[0]];
    store.save();
  }
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const channel = await i.guild.channels.create({
    name: `ticket-${i.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) || 'member'}`,
    type: ChannelType.GuildText, parent: cfg.categoryId,
    permissionOverwrites: [
      { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: cfg.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: bot.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] }
    ]
  });
  data.tickets[channel.id] = { ownerId: i.user.id, status: 'open', createdAt: new Date().toISOString() };
  store.save();
  await channel.send({ content: `<@${i.user.id}> Your ticket is open. Staff will respond here.`,
    components: [row('ticket:close', 'Close ticket', ButtonStyle.Danger)],
    allowedMentions: { users: [i.user.id] } });
  await i.editReply(`Your ticket is ready: ${channel}.`);
  void push.notify(i.guild, 'ticket', 'New ticket', `${i.user.username} opened a ticket`, `/g/${i.guildId}/tickets/${channel.id}`, channel).catch(console.error);
  await log(i.guild, cfg, `Ticket opened: ${channel.name} (${channel.id}) by ${i.user.id}`);
}

async function withdraw(i, data) {
  const cfg = data.config;
  if (!configValid(cfg)) return i.reply(privateReply('An admin must run /setup first.'));
  const amount = i.options.getInteger('amount');
  if (i.user.bot || !Number.isSafeInteger(amount) || amount < 1 || amount > levels.MAX_AMOUNT)
    return i.reply(privateReply('Choose between 1 and 1,000,000 levels.'));
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const prior = Object.entries(data.tickets).find(([, ticket]) => ticket.ownerId === i.user.id && ticket.status === 'open' && ticket.type === 'withdrawal');
  if (prior) {
    const channel = await i.guild.channels.fetch(prior[0]).catch(() => null);
    if (channel) return i.editReply(`You already have a withdrawal ticket: ${channel}.`);
    delete data.tickets[prior[0]];
    store.save();
  }
  // Reserve the levels before awaiting Discord, so simultaneous requests cannot spend twice.
  if (!levels.change(data, i.user.id, -amount)) return i.editReply(`You have ${levels.balance(data, i.user.id)} levels available.`);
  store.save();
  let channel;
  try {
    const roleIds = [...new Set([cfg.staffRoleId, cfg.ownerRoleId, cfg.coOwnerRoleId].filter(Boolean))];
    channel = await i.guild.channels.create({
      name: `withdraw-${i.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) || 'member'}`,
      type: ChannelType.GuildText, parent: cfg.categoryId,
      permissionOverwrites: [
        { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: bot.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
        ...roleIds.map(id => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }))
      ]
    });
  } catch (error) {
    levels.change(data, i.user.id, amount);
    store.save();
    throw error;
  }
  data.tickets[channel.id] = { ownerId: i.user.id, type: 'withdrawal', amount, status: 'open', createdAt: new Date().toISOString() };
  store.save();
  await channel.send({ content: `<@${i.user.id}> requested to withdraw **${amount.toLocaleString()} levels**. Staff can handle this request here.`,
    components: [row('ticket:close', 'Close ticket', ButtonStyle.Danger)], allowedMentions: { users: [i.user.id] } });
  await i.editReply(`Withdrawal requested: ${channel}. ${amount.toLocaleString()} levels were removed from your balance.`);
  void push.notify(i.guild, 'withdrawal', 'Withdrawal requested', `${i.user.username} requested ${amount.toLocaleString()} levels`, `/g/${i.guildId}/tickets/${channel.id}`, channel).catch(console.error);
  await log(i.guild, cfg, `Withdrawal requested: ${channel.id} by ${i.user.id} for ${amount} levels.`);
}

async function ticketAction(i, data, action) {
  const record = data.tickets[i.channelId];
  if (!record) return i.reply(privateReply('Use this command inside a ticket channel.'));
  const isStaff = staff(i, data.config);
  if (!isStaff && record.ownerId !== i.user.id) return i.reply(privateReply('Only the ticket owner or staff can do that.'));
  if (['reopen', 'delete'].includes(action) && !isStaff) return i.reply(privateReply('Only staff can do that.'));
  if (action === 'close') {
    if (record.status === 'closed') return i.reply(privateReply('This ticket is already closed.'));
    await i.channel.permissionOverwrites.edit(record.ownerId, { SendMessages: false });
    record.status = 'closed'; store.save();
    await i.channel.setName(`closed-${i.channel.name.replace(/^ticket-/, '').replace(/^closed-/, '')}`);
    await i.reply({ content: 'Ticket closed. Staff can use `/ticket reopen` or `/ticket delete`.', allowedMentions: mentions });
    return log(i.guild, data.config, `Ticket closed: ${i.channel.id} by ${i.user.id}`);
  }
  if (action === 'reopen') {
    if (record.status === 'open') return i.reply(privateReply('This ticket is already open.'));
    await i.channel.permissionOverwrites.edit(record.ownerId, { ViewChannel: true, SendMessages: true });
    record.status = 'open'; store.save();
    await i.channel.setName(`ticket-${i.channel.name.replace(/^closed-/, '').replace(/^ticket-/, '')}`);
    return i.reply({ content: 'Ticket reopened.', allowedMentions: mentions });
  }
  if (action === 'delete') {
    if (record.status !== 'closed') return i.reply(privateReply('Close the ticket before deleting it.'));
    await i.reply(privateReply('Deleting the closed ticket.'));
    await i.channel.delete(`Ticket deleted by ${i.user.id}`);
    for (const app of Object.values(data.applications)) {
      if (app.channelId === i.channelId && app.status === 'pending') app.status = 'canceled';
    }
    delete data.tickets[i.channelId]; store.save();
    return log(i.guild, data.config, `Ticket deleted: ${i.channelId} by ${i.user.id}`);
  }
  if (record.status !== 'open') return i.reply(privateReply('Reopen the ticket first.'));
  const user = i.options.getUser('user');
  if (action === 'remove' && user.id === record.ownerId) return i.reply(privateReply('Close the ticket to restrict its owner.'));
  if (action === 'add') {
    await i.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
    return i.reply(privateReply(`Added ${safe(user.username)}.`));
  }
  await i.channel.permissionOverwrites.delete(user.id);
  return i.reply(privateReply(`Removed ${safe(user.username)}.`));
}

function applicationModal() {
  const field = (id, label, style) => new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(true).setMaxLength(id === 'why' ? 1000 : 300)
  );
  return new ModalBuilder().setCustomId('application:submit').setTitle('Apply to Ironclad Bot')
    .addComponents(field('role', 'What role are you applying for?', TextInputStyle.Short),
      field('experience', 'What experience do you have?', TextInputStyle.Paragraph),
      field('why', 'Why should we choose you?', TextInputStyle.Paragraph));
}

async function submitApplication(i, data) {
  const cfg = data.config;
  if (!configValid(cfg)) return i.reply(privateReply('An admin must run /setup first.'));
  if (data.applications[i.user.id]?.status === 'pending') return i.reply(privateReply('You already have an application awaiting review.'));
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const ch = await i.guild.channels.fetch(cfg.applicationsChannelId);
  if (!ch?.isTextBased()) return i.editReply('The applications channel is unavailable. Ask an admin to run /setup again.');
  const role = i.fields.getTextInputValue('role');
  const experience = i.fields.getTextInputValue('experience');
  const why = i.fields.getTextInputValue('why');
  const embed = new EmbedBuilder().setTitle('New application').setColor(0x5865f2)
    .addFields({ name: 'Applicant', value: `${safe(i.user.username)} (${i.user.id})` },
      { name: 'Role', value: safe(role) }, { name: 'Experience', value: safe(experience) }, { name: 'Why', value: safe(why) })
    .setTimestamp();
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`application:approve:${i.user.id}`).setLabel('Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`application:reject:${i.user.id}`).setLabel('Reject').setStyle(ButtonStyle.Danger)
  );
  const roleIds = [...new Set([cfg.staffRoleId, cfg.ownerRoleId, cfg.coOwnerRoleId].filter(Boolean))];
  const ticket = await i.guild.channels.create({
    name: `apply-${i.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) || 'member'}`,
    type: ChannelType.GuildText, parent: cfg.categoryId,
    permissionOverwrites: [
      { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: bot.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
      ...roleIds.map(id => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }))
    ]
  });
  let msg;
  try {
    msg = await ticket.send({ content: `<@${i.user.id}> Your application ticket is open. Staff can review it here.`,
      embeds: [embed], components: [buttons], allowedMentions: { users: [i.user.id] } });
  } catch (error) { await ticket.delete().catch(console.error); throw error; }
  data.tickets[ticket.id] = { ownerId: i.user.id, type: 'application', status: 'open', createdAt: new Date().toISOString() };
  data.applications[i.user.id] = { status: 'pending', messageId: msg.id, channelId: ticket.id, role, experience, why, submittedAt: new Date().toISOString() };
  store.save();
  await i.editReply(`Application submitted. Your private ticket is ${ticket}.`);
  void push.notify(i.guild, 'application', 'New application', `${i.user.username} submitted an application`, `/g/${i.guildId}/tickets/${ticket.id}`, ticket).catch(console.error);
  await ch.send({ content: `New application from ${safe(i.user.username)}: ${ticket}`, allowedMentions: mentions }).catch(console.error);
}

async function reviewApplication(i, data, decision, userId) {
  if (!staff(i, data.config)) return i.reply(privateReply('Only staff can review applications.'));
  const app = data.applications[userId];
  if (!app || app.status !== 'pending' || app.messageId !== i.message.id || app.channelId !== i.channelId)
    return i.reply(privateReply('This application has already been handled.'));
  const reviewer = await i.guild.members.fetch({ user: i.user.id, force: true });
  if (decision === 'approve') {
    if (!applications.reviewerCanAssign(i.guild, reviewer)) return i.reply(privateReply('You need Manage Roles permission to approve and assign a role.'));
    return i.reply({ flags: MessageFlags.Ephemeral, content: 'Choose the role to give this applicant:',
      components: [new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder()
        .setCustomId(`application:assign:${userId}`).setPlaceholder('Choose a role').setMinValues(1).setMaxValues(1))] });
  }
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  await applications.decide({ guild: i.guild, data, store, bot, userId, decision: 'rejected', reviewer });
  return i.editReply('Application declined.');
}

async function addVouch(i, data) {
  const cfg = data.config;
  const target = i.options.getUser('user');
  const reason = i.options.getString('reason');
  if (!target || target.bot || target.id === i.user.id) return i.reply(privateReply('Choose another non-bot member.'));
  const list = data.vouches[target.id] ||= [];
  list.push({ authorId: i.user.id, reason, at: new Date().toISOString() });
  store.save();
  await i.reply({ content: `Vouched for ${safe(target.username)}.`, flags: MessageFlags.Ephemeral });
  const ch = await i.guild.channels.fetch(cfg.vouchesChannelId).catch(() => null);
  if (ch?.isTextBased()) await ch.send({ content: `**${safe(i.user.username)}** vouched for **${safe(target.username)}**\n${safe(reason)}`, allowedMentions: mentions }).catch(console.error);
  void push.notify(i.guild, 'vouch', 'New vouch', `${i.user.username} vouched for ${target.username}`, `/g/${i.guildId}/vouches`, ch).catch(console.error);
}

bot.once('ready', () => console.log(`Ironclad Bot is online as ${bot.user?.tag}`));

bot.on('interactionCreate', async i => {
  if (!i.inGuild()) return;
  const data = store.guild(i.guildId);
  try {
    if (i.isChatInputCommand()) {
      if (i.commandName === 'setup') return require('./setup')(i, data, store);
      if (i.commandName === 'ticket') return ticketAction(i, data, i.options.getSubcommand());
      if (i.commandName === 'apply') return i.showModal(applicationModal());
      if (i.commandName === 'vouch') return addVouch(i, data);
      if (i.commandName === 'withdraw') return withdraw(i, data);
      if (i.commandName === 'balance') return i.reply(privateReply(`You have ${levels.balance(data, i.user.id).toLocaleString()} levels.`));
      if (i.commandName === 'poll') return polls.handleCommand(i, data, store);
      if (i.commandName === 'giveaway') return giveaways.handleCommand(i, data);
      if (i.commandName === 'purge') return purge.handleCommand(i, data);
      if (i.commandName === 'wipe') return wipe.handleCommand(i, data);
    }
    if (i.isButton()) {
      if (i.customId === 'ticket:open') return openTicket(i, data);
      if (i.customId === 'ticket:close') return ticketAction(i, data, 'close');
      if (i.customId.startsWith('application:approve:')) return reviewApplication(i, data, 'approve', i.customId.split(':')[2]);
      if (i.customId.startsWith('application:reject:')) return reviewApplication(i, data, 'reject', i.customId.split(':')[2]);
      if (i.customId.startsWith('giveaway:')) return giveaways.handleButton(i, data);
      if (i.customId.startsWith('purge:')) return purge.handleButton(i, data);
      if (i.customId.startsWith('wipe:')) return wipe.handleButton(i, data);
    }
    if (i.isRoleSelectMenu() && i.customId.startsWith('application:assign:')) {
      const userId = i.customId.split(':')[2];
      const reviewer = await i.guild.members.fetch({ user: i.user.id, force: true });
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      await applications.decide({ guild: i.guild, data, store, bot, userId, decision: 'approved', reviewer, roleId: i.values[0] });
      return i.editReply('Application approved and role assigned.');
    }
    if (i.isModalSubmit() && i.customId === 'application:submit') return submitApplication(i, data);
  } catch (error) {
    console.error(error);
    const content = 'Something went wrong. Check the bot permissions and try again.';
    if (i.deferred || i.replied) return i.editReply(content).catch(() => {});
    return i.reply(privateReply(content)).catch(() => {});
  }
});

bot.login(process.env.DISCORD_TOKEN);
