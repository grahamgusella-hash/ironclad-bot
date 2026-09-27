require('dotenv').config();
const { REST, Routes } = require('discord.js');
const commands = require('./commands');
for (const key of ['DISCORD_TOKEN', 'CLIENT_ID']) {
  if (!process.env[key]) throw new Error(`Missing ${key} in .env`);
}
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
async function deploy() {
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands.map(c => c.toJSON()) });
  console.log(`Registered ${commands.length} global commands for every server that installs the bot`);
  // Clear the old one-server command copies so the original server uses the global commands too.
  // If the bot no longer has access to that old server, don't let the cleanup crash startup.
  if (process.env.GUILD_ID) {
    try {
      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: [] });
      console.log(`Removed old server-only commands from ${process.env.GUILD_ID}`);
    } catch (err) {
      if (err?.code === 50001 || err?.status === 403) {
        console.warn(`Skipping old server command cleanup for ${process.env.GUILD_ID}: missing access`);
      } else {
        throw err;
      }
    }
  }
}
deploy().catch(err => { console.error(err); process.exitCode = 1; });
