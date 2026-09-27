const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const file = path.resolve(process.env.DATA_FILE || './data/state.json');
const state = { guilds: {} };
let pool = null;
let saveChain = Promise.resolve();

function normalize(value) {
  if (!value || typeof value !== 'object') return { guilds: {} };
  if (!value.guilds || typeof value.guilds !== 'object') value.guilds = {};
  return value;
}

function loadFile() {
  if (!fs.existsSync(file)) return { guilds: {} };
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return normalize(parsed);
}

async function init() {
  if (!process.env.DATABASE_URL) {
    Object.assign(state, loadFile());
    console.log(`Ironclad storage: local file (${file})`);
    return;
  }

  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ironclad_state (
      id text PRIMARY KEY,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const result = await pool.query('SELECT data FROM ironclad_state WHERE id = $1', ['main']);
  if (result.rowCount) {
    Object.assign(state, normalize(result.rows[0].data));
  } else {
    const initial = loadFile();
    Object.assign(state, initial);
    await pool.query(
      'INSERT INTO ironclad_state (id, data) VALUES ($1, $2::jsonb)',
      ['main', JSON.stringify(state)]
    );
  }
  console.log('Ironclad storage: Neon Postgres');
}

function guild(id) {
  const record = state.guilds[id] ||= { config: {}, tickets: {}, applications: {}, vouches: {}, giveaways: {}, polls: {}, levels: {} };
  record.giveaways ||= {};
  record.levels ||= {};
  record.polls ||= {};
  record.config ||= {};
  record.tickets ||= {};
  record.applications ||= {};
  record.vouches ||= {};
  return record;
}

function save() {
  if (pool) {
    const snapshot = JSON.stringify(state);
    saveChain = saveChain
      .then(() => pool.query(
        `INSERT INTO ironclad_state (id, data, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        ['main', snapshot]
      ))
      .catch(error => console.error('Failed to save Ironclad state to Neon:', error));
    return saveChain;
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

module.exports = { init, guild, save, state };
