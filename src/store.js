const fs = require('node:fs');
const path = require('node:path');
const file = path.resolve(process.env.DATA_FILE || './data/state.json');
const databaseUrl = process.env.DATABASE_URL;
const pool = databaseUrl ? new (require('pg').Pool)({
  connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 10000
}) : null;
function readLocal() {
  if (!fs.existsSync(file)) return { guilds: {} };
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!parsed.guilds || typeof parsed.guilds !== 'object' || Array.isArray(parsed.guilds)) throw new Error('Invalid state file');
  return parsed;
}
// The dashboard and bot share the same object; populate it before accepting requests.
const state = pool ? { guilds: {} } : readLocal();
let writes = Promise.resolve();
let failed = false;
async function init() {
  if (!pool) return;
  await pool.query('CREATE TABLE IF NOT EXISTS ironclad_state (id integer PRIMARY KEY CHECK (id = 1), state jsonb NOT NULL)');
  // An existing database row wins, so restarts cannot overwrite saved records.
  const initial = readLocal();
  await pool.query('INSERT INTO ironclad_state (id, state) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING', [JSON.stringify(initial)]);
  const { rows } = await pool.query('SELECT state FROM ironclad_state WHERE id = 1');
  if (!rows[0]?.state?.guilds || typeof rows[0].state.guilds !== 'object' || Array.isArray(rows[0].state.guilds))
    throw new Error('Invalid database state');
  Object.assign(state, rows[0].state);
  console.log('Ironclad data loaded from Postgres');
}
function guild(id) {
  const record = state.guilds[id] ||= { config: {}, tickets: {}, applications: {}, vouches: {}, giveaways: {}, polls: {}, levels: {} };
  record.giveaways ||= {};
  record.levels ||= {};
  record.polls ||= {};
  return record;
}
function save() {
  if (!pool) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
    return Promise.resolve();
  }
  if (failed) throw new Error('Database storage is unavailable');
  const snapshot = JSON.stringify(state);
  const task = writes.then(() => pool.query('UPDATE ironclad_state SET state = $1::jsonb WHERE id = 1', [snapshot]));
  // Never silently acknowledge a failed write; stop instead of losing more data.
  writes = task.catch(error => {
    failed = true;
    console.error('Ironclad database write failed:', error);
    process.exitCode = 1;
    setImmediate(() => process.exit(1));
  });
  return task;
}
module.exports = { guild, save, state, init };
