const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const inProgress = new Set();
const reviewerCanAssign = (guild, reviewer) => reviewer?.id === guild.ownerId ||
  reviewer?.permissions.has(PermissionFlagsBits.ManageRoles);

async function assignableRoles(guild, reviewer) {
  const me = await guild.members.fetchMe();
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) return [];
  return [...guild.roles.cache.values()]
    .filter(role => role.id !== guild.id && !role.managed &&
      role.comparePositionTo(me.roles.highest) < 0 &&
      (reviewer.id === guild.ownerId || role.comparePositionTo(reviewer.roles.highest) < 0))
    .sort((a, b) => b.position - a.position);
}

async function decide({ guild, data, store, bot, userId, decision, reviewer, roleId }) {
  const app = data.applications[userId];
  if (!app || app.status !== 'pending') throw new Error('This application has already been reviewed.');
  if (!['approved', 'rejected'].includes(decision)) throw new Error('Choose an application decision.');
  const lock = `${guild.id}:${userId}`;
  if (inProgress.has(lock)) throw new Error('This application is being reviewed.');
  inProgress.add(lock);
  try {
    let role;
    if (decision === 'approved') {
      if (!reviewerCanAssign(guild, reviewer)) throw new Error('Manage Roles permission is required to approve and assign a role.');
      role = (await assignableRoles(guild, reviewer)).find(r => r.id === roleId);
      if (!role) throw new Error('Choose a role below your role and the bot’s role.');
      const applicant = await guild.members.fetch({ user: userId, force: true }).catch(() => null);
      if (!applicant) throw new Error('The applicant is no longer in this server.');
      await applicant.roles.add(role, `Application approved by ${reviewer.id}`);
    }
    app.status = decision;
    app.reviewedBy = reviewer.id;
    app.reviewedAt = new Date().toISOString();
    if (role) app.assignedRoleId = role.id;
    store.save();
    const channel = await guild.channels.fetch(app.channelId).catch(() => null);
    if (channel?.isTextBased()) {
      const message = await channel.messages.fetch(app.messageId).catch(() => null);
      if (message?.embeds?.[0]) await message.edit({ components: [], embeds: [EmbedBuilder.from(message.embeds[0])
        .setColor(role ? 0x2ecc71 : 0xe74c3c)
        .addFields({ name: 'Decision', value: `${decision} by ${reviewer.user?.username || reviewer.id}${role ? ` · ${role.name}` : ''}` })] }).catch(console.error);
      await channel.send({ content: `<@${userId}> Your application was **${decision}**${role ? ` and you received **${role.name.replace(/[@*_`~|>]/g, '')}**` : ''}.`, allowedMentions: { users: [userId] } }).catch(console.error);
    }
    const user = await bot.users.fetch(userId).catch(() => null);
    if (user) await user.send(`Your application to **${guild.name}** was ${decision}${role ? `; you received ${role.name}` : ''}.`).catch(() => {});
    return role;
  } finally { inProgress.delete(lock); }
}

module.exports = { decide, assignableRoles, reviewerCanAssign };
