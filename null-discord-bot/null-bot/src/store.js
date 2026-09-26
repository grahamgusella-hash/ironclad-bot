const fs = require('node:fs');
const path = require('node:path');
const file = path.resolve(process.env.DATA_FILE || './data/state.json');
function load() {
  if (!fs.existsSync(file)) return { guilds: {} };
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!parsed.guilds || typeof parsed.guilds !== 'object') throw new Error('Invalid state file');
  return parsed;
}
const state = load();
function guild(id) {
  const record = state.guilds[id] ||= { config: {}, tickets: {}, applications: {}, vouches: {}, giveaways: {} };
  record.giveaways ||= {};
  return record;
}
function save() {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}
module.exports = { guild, save, state };
