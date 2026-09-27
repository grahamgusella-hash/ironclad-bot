const MAX_AMOUNT = 1_000_000;

function balance(data, userId) {
  const value = data.levels[userId] || 0;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid level balance');
  return value;
}

function change(data, userId, amount) {
  if (!Number.isSafeInteger(amount) || amount === 0) throw new Error('Invalid level adjustment');
  const next = balance(data, userId) + amount;
  if (!Number.isSafeInteger(next) || next < 0) return false;
  if (next === 0) delete data.levels[userId];
  else data.levels[userId] = next;
  return true;
}

function canManage(i, cfg) {
  const roleIds = [cfg.ownerRoleId, cfg.coOwnerRoleId].filter(Boolean);
  const roles = i.member?.roles;
  return roleIds.some(id => roles?.cache?.has(id) || (Array.isArray(roles) && roles.includes(id)));
}

module.exports = { MAX_AMOUNT, balance, change, canManage };
