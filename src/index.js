require('dotenv').config();
const {
  Client, GatewayIntentBits, ChannelType, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder,
  TextInputBuilder, TextInputStyle, MessageFlags, EmbedBuilder
} = require('discord.js');
const store = require('./store');

if (!process.env.DISCORD_TOKEN) throw new Error('Missing DISCORD_TOKEN in .env');
const bot = new Client({ intents: [GatewayIntentBits.Guilds] });
const giveaways = require('./giveaways')(bot, store);
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
  const prior = Object.entries(data.tickets).find(([, t]) => t.ownerId === i.user.id && t.status === 'open');
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
  await log(i.guild, cfg, `Ticket opened: ${channel.name} (${channel.id}) by ${i.user.id}`);
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
  const msg = await ch.send({ embeds: [embed], components: [buttons], allowedMentions: mentions });
  data.applications[i.user.id] = { status: 'pending', messageId: msg.id, channelId: ch.id, role, submittedAt: new Date().toISOString() };
  store.save();
  await i.editReply('Application submitted. Staff will review it.');
}

async function reviewApplication(i, data, decision, userId) {
  if (!staff(i, data.config)) return i.reply(privateReply('Only staff can review applications.'));
  const app = data.applications[userId];
  if (!app || app.status !== 'pending' || app.messageId !== i.message.id || app.channelId !== i.channelId)
    return i.reply(privateReply('This application has already been handled.'));
  await i.deferUpdate();
  app.status = decision === 'approve' ? 'approved' : 'rejected';
  app.reviewedBy = i.user.id; app.reviewedAt = new Date().toISOString(); store.save();
  await i.message.edit({ components: [], embeds: [EmbedBuilder.from(i.message.embeds[0])
    .setColor(decision === 'approve' ? 0x2ecc71 : 0xe74c3c)
    .addFields({ name: 'Decision', value: `${app.status} by ${safe(i.user.username)}` })] });
  const applicant = await bot.users.fetch(userId).catch(() => null);
  if (applicant) await applicant.send(`Your application to **${safe(i.guild.name)}** was ${app.status}.`).catch(() => {});
  await i.followUp(privateReply(`Application ${app.status}. The applicant was notified by DM if their DMs are open.`));
}

async function addVouch(i, data) {
  const cfg = data.config;
  if (!configValid(cfg)) return i.reply(privateReply('An admin must run /setup first.'));
  const user = i.options.getUser('user');
  if (user.id === i.user.id || user.bot) return i.reply(privateReply('Vouch for another human member.'));
  const member = await i.guild.members.fetch(user.id).catch(() => null);
  if (!member) return i.reply(privateReply('That user must be in this server.'));
  const list = data.vouches[user.id] ||= [];
  if (list.some(v => v.authorId === i.user.id)) return i.reply(privateReply('You have already vouched for this member.'));
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const ch = await i.guild.channels.fetch(cfg.vouchesChannelId);
  if (!ch?.isTextBased()) return i.editReply('The vouches channel is unavailable. Ask an admin to run /setup again.');
  const reason = i.options.getString('reason');
  const msg = await ch.send({ embeds: [new EmbedBuilder().setTitle('New vouch').setColor(0x2ecc71)
    .addFields({ name: 'For', value: `${safe(user.username)} (${user.id})` },
      { name: 'From', value: `${safe(i.user.username)} (${i.user.id})` },
      { name: 'Reason', value: safe(reason) }).setTimestamp()], allowedMentions: mentions });
  list.push({ authorId: i.user.id, reason, at: new Date().toISOString(), messageId: msg.id });
  store.save();
  await i.editReply(`Vouch posted for ${safe(user.username)}. They now have ${list.length} vouch(es).`);
}

bot.on('interactionCreate', async i => {
  if (!i.inGuild()) return;
  try {
    const data = store.guild(i.guildId);
    if (i.isChatInputCommand()) {
      if (i.commandName === 'setup') {
        if (!i.memberPermissions.has(PermissionFlagsBits.ManageGuild)) return i.reply(privateReply('Manage Server permission is required.'));
        const staffRole = i.options.getRole('staff_role');
        if (staffRole.id === i.guild.id || staffRole.managed) return i.reply(privateReply('Choose a regular staff role, not @everyone or an integration role.'));
        const applications = i.options.getChannel('applications_channel');
        const vouches = i.options.getChannel('vouches_channel');
        if (applications.id === vouches.id) return i.reply(privateReply('Choose separate applications and vouches channels.'));
        const botMember = await i.guild.members.fetchMe();
        for (const [ch, perms] of [[applications, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]], [vouches, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]]]) {
          if (!ch.permissionsFor(botMember)?.has(perms)) return i.reply(privateReply(`I need View Channel, Send Messages, and Embed Links in ${ch}.`));
        }
        data.config = {
          staffRoleId: staffRole.id, categoryId: i.options.getChannel('ticket_category').id,
          applicationsChannelId: applications.id, vouchesChannelId: vouches.id,
          logsChannelId: i.options.getChannel('logs_channel')?.id || null
        };
        store.save();
        return i.reply(privateReply('Configured. Keep the applications channel private to staff, then use `/panel type:tickets` and `/panel type:applications` where members should see the buttons.'));
      }
      if (i.commandName === 'panel') {
        if (!i.memberPermissions.has(PermissionFlagsBits.ManageGuild)) return i.reply(privateReply('Manage Server permission is required.'));
        if (!configValid(data.config)) return i.reply(privateReply('Run /setup first.'));
        const type = i.options.getString('type');
        await i.channel.send({ content: type === 'ticket' ? '**Need help?** Open a private ticket below.' : '**Applications** Apply using the button below.',
          components: [row(type === 'ticket' ? 'ticket:open' : 'application:open', type === 'ticket' ? 'Open ticket' : 'Apply', ButtonStyle.Primary)], allowedMentions: mentions });
        return i.reply(privateReply('Panel posted.'));
      }
      if (i.commandName === 'ticket') {
        const action = i.options.getSubcommand();
        return action === 'open' ? openTicket(i, data) : ticketAction(i, data, action);
      }
      if (i.commandName === 'apply') {
        if (!configValid(data.config)) return i.reply(privateReply('An admin must run /setup first.'));
        if (data.applications[i.user.id]?.status === 'pending') return i.reply(privateReply('You already have an application awaiting review.'));
        return i.showModal(applicationModal());
      }
      if (i.commandName === 'vouch') return addVouch(i, data);
      if (i.commandName === 'giveaway') return giveaways.command(i, data, staff(i, data.config));
      if (i.commandName === 'vouches') {
        const user = i.options.getUser('user');
        const list = data.vouches[user.id] || [];
        const recent = list.slice(-5).reverse().map(v => `• ${safe(v.reason).slice(0, 180)} — <@${v.authorId}>`).join('\n');
        return i.reply({ content: `**${safe(user.username)}: ${list.length} vouch(es)**${recent ? `\n${recent}` : ''}`,
          allowedMentions: mentions, flags: MessageFlags.Ephemeral });
      }
    }
    if (i.isButton()) {
      if (i.customId.startsWith('giveaway:enter:')) return giveaways.enter(i, data);
      if (i.customId === 'ticket:open') return openTicket(i, data);
      if (i.customId === 'ticket:close') return ticketAction(i, data, 'close');
      if (i.customId === 'application:open') {
        if (!configValid(data.config)) return i.reply(privateReply('An admin must run /setup first.'));
        if (data.applications[i.user.id]?.status === 'pending') return i.reply(privateReply('You already have an application awaiting review.'));
        return i.showModal(applicationModal());
      }
      const review = /^application:(approve|reject):(\d+)$/.exec(i.customId);
      if (review) return reviewApplication(i, data, review[1], review[2]);
    }
    if (i.isModalSubmit() && i.customId === 'application:submit') return submitApplication(i, data);
  } catch (err) {
    console.error('Interaction failed:', err);
    const message = privateReply('Something went wrong. Check my channel permissions or ask the bot owner to check the logs.');
    if (i.deferred) await i.editReply(message).catch(console.error);
    else if (i.replied) await i.followUp(message).catch(console.error);
    else await i.reply(message).catch(console.error);
  }
});

bot.once('clientReady', () => {
  console.log(`Ironclad Bot is online as ${bot.user.tag}`);
  giveaways.sweep().catch(console.error);
  setInterval(() => giveaways.sweep().catch(console.error), 15000);
});
bot.login(process.env.DISCORD_TOKEN);
