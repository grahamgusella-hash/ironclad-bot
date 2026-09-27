const { ChannelType, PermissionFlagsBits } = require('discord.js');

function validate(question, answers, hours = 24) {
  question = String(question || '').trim();
  answers = answers.map(value => String(value || '').trim()).filter(Boolean);
  hours = Number(hours);
  if (!question || question.length > 300) throw new Error('Poll question must be 1–300 characters.');
  if (answers.length < 2 || answers.length > 10 || answers.some(answer => answer.length > 55))
    throw new Error('Enter 2–10 answers, each no longer than 55 characters.');
  if (new Set(answers.map(answer => answer.toLocaleLowerCase())).size !== answers.length)
    throw new Error('Poll answers must be different.');
  if (!Number.isInteger(hours) || hours < 1 || hours > 768)
    throw new Error('Poll duration must be 1–768 hours.');
  return { question: { text: question }, answers: answers.map(text => ({ text })), duration: hours, allowMultiselect: false };
}

async function create(guild, channel, question, answers, hours) {
  if (!channel || channel.guildId !== guild.id || channel.type !== ChannelType.GuildText)
    throw new Error('Choose a text channel in this server.');
  const me = await guild.members.fetchMe();
  if (!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendPolls]))
    throw new Error('I need View Channel, Send Messages, Read Message History, and Create Polls in that channel.');
  const poll = validate(question, answers, hours);
  return channel.send({ poll, allowedMentions: { parse: [] } });
}

function record(data, store, message, authorId) {
  data.polls ||= {};
  data.polls[message.id] = {
    channelId: message.channelId, question: message.poll?.question?.text || 'Poll',
    authorId, createdAt: new Date(message.createdTimestamp).toISOString()
  };
  store.save();
}

async function discover(guild, data, store, channels) {
  data.polls ||= {};
  // Bring in polls made before this release, without searching every message in the server.
  if (data.pollsScannedAt) return;
  for (const channel of channels.slice(0, 12)) {
    const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    if (!messages) continue;
    for (const message of messages.values()) {
      if (message.author?.id === guild.client.user.id && message.poll)
        record(data, store, message, message.author.id);
    }
  }
  data.pollsScannedAt = new Date().toISOString();
  store.save();
}

module.exports = { create, validate, record, discover };
