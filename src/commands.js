const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, InteractionContextType, ApplicationIntegrationType } = require('discord.js');

const commands = [
  new SlashCommandBuilder().setName('setup').setDescription('Configure Ironclad Bot for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addRoleOption(o => o.setName('staff_role').setDescription('Role that can manage tickets and applications').setRequired(true))
    .addChannelOption(o => o.setName('ticket_category').setDescription('Category for private tickets').addChannelTypes(ChannelType.GuildCategory).setRequired(true))
    .addChannelOption(o => o.setName('applications_channel').setDescription('Private staff review channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addChannelOption(o => o.setName('vouches_channel').setDescription('Public channel for vouches').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addChannelOption(o => o.setName('logs_channel').setDescription('Optional ticket activity channel').addChannelTypes(ChannelType.GuildText))
    .addRoleOption(o => o.setName('owner_role').setDescription('Role allowed to manage levels').setRequired(false))
    .addRoleOption(o => o.setName('co_owner_role').setDescription('Second role allowed to manage levels').setRequired(false)),
  new SlashCommandBuilder().setName('panel').setDescription('Post a ticket or application button panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o => o.setName('type').setDescription('Panel to post').setRequired(true)
      .addChoices({ name: 'Tickets', value: 'ticket' }, { name: 'Applications', value: 'application' }))
    .addChannelOption(o => o.setName('channel').setDescription('Text channel to post in (defaults to here)')
      .addChannelTypes(ChannelType.GuildText)),
  new SlashCommandBuilder().setName('ticket').setDescription('Open or manage a private ticket')
    .addSubcommand(o => o.setName('open').setDescription('Open your ticket'))
    .addSubcommand(o => o.setName('close').setDescription('Close the ticket in this channel'))
    .addSubcommand(o => o.setName('reopen').setDescription('Staff: reopen a closed ticket'))
    .addSubcommand(o => o.setName('delete').setDescription('Staff: permanently delete a closed ticket'))
    .addSubcommand(o => o.setName('add').setDescription('Add a member to this ticket').addUserOption(u => u.setName('user').setDescription('Member').setRequired(true)))
    .addSubcommand(o => o.setName('remove').setDescription('Remove a member from this ticket').addUserOption(u => u.setName('user').setDescription('Member').setRequired(true))),
  new SlashCommandBuilder().setName('apply').setDescription('Submit an application for staff review'),
  new SlashCommandBuilder().setName('vouch').setDescription('Vouch for another member')
    .addUserOption(o => o.setName('user').setDescription('Person you recommend').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Why you vouch for them (10–500 characters)').setMinLength(10).setMaxLength(500).setRequired(true)),
  new SlashCommandBuilder().setName('vouches').setDescription('See a member’s vouches')
    .addUserOption(o => o.setName('user').setDescription('Member to look up').setRequired(true)),
  new SlashCommandBuilder().setName('level').setDescription('Manage or view level balances')
    .addSubcommand(o => o.setName('add').setDescription('Owner or Co Owner: give levels to a member')
      .addUserOption(v => v.setName('user').setDescription('Member receiving levels').setRequired(true))
      .addIntegerOption(v => v.setName('amount').setDescription('Levels to give').setRequired(true).setMinValue(1).setMaxValue(1000000)))
    .addSubcommand(o => o.setName('remove').setDescription('Owner or Co Owner: remove levels from a member')
      .addUserOption(v => v.setName('user').setDescription('Member losing levels').setRequired(true))
      .addIntegerOption(v => v.setName('amount').setDescription('Levels to remove').setRequired(true).setMinValue(1).setMaxValue(1000000)))
    .addSubcommand(o => o.setName('balance').setDescription('See your available levels')),
  new SlashCommandBuilder().setName('leaderboard').setDescription('Show this server’s level leaderboard'),
  new SlashCommandBuilder().setName('purge').setDescription('Server owner: delete all ticket channels after confirmation')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('withdraw').setDescription('Withdraw levels into a private staff ticket')
    .addIntegerOption(o => o.setName('amount').setDescription('Levels to withdraw').setRequired(true).setMinValue(1).setMaxValue(1000000)),
  new SlashCommandBuilder().setName('giveaway').setDescription('Run a prize giveaway')
    .addSubcommand(o => o.setName('start').setDescription('Staff: start a giveaway in this channel')
      .addStringOption(v => v.setName('prize').setDescription('Prize (up to 200 characters)').setRequired(true).setMaxLength(200))
      .addIntegerOption(v => v.setName('minutes').setDescription('Duration in minutes (1 to 10080)').setRequired(true).setMinValue(1).setMaxValue(10080))
      .addIntegerOption(v => v.setName('winners').setDescription('Number of winners (default 1)').setMinValue(1).setMaxValue(10)))
    .addSubcommand(o => o.setName('level').setDescription('Owner or Co Owner: give levels to random winners')
      .addIntegerOption(v => v.setName('levels').setDescription('Levels EACH winner receives').setRequired(true).setMinValue(1).setMaxValue(1000000))
      .addIntegerOption(v => v.setName('minutes').setDescription('Duration in minutes (1 to 10080)').setRequired(true).setMinValue(1).setMaxValue(10080))
      .addIntegerOption(v => v.setName('winners').setDescription('Number of winners (1 to 10)').setRequired(true).setMinValue(1).setMaxValue(10)))
    .addSubcommand(o => o.setName('end').setDescription('Staff: end a giveaway early')
      .addStringOption(v => v.setName('message_id').setDescription('Giveaway message ID in this channel').setRequired(true)))
    .addSubcommand(o => o.setName('reroll').setDescription('Staff: draw another winner from a finished giveaway')
      .addStringOption(v => v.setName('message_id').setDescription('Giveaway message ID in this channel').setRequired(true)))
];

// The bot needs a server installation and does not handle direct messages.
module.exports = commands.map(command => command
  .setContexts(InteractionContextType.Guild)
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall));
