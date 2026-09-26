require('dotenv').config();
const { REST, Routes } = require('discord.js');
const commands = require('./commands');
for (const key of ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID']) {
  if (!process.env[key]) throw new Error(`Missing ${key} in .env`);
}
new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN)
  .put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands.map(c => c.toJSON()) })
  .then(() => console.log(`Registered ${commands.length} commands for server ${process.env.GUILD_ID}`))
  .catch(err => { console.error(err); process.exitCode = 1; });
