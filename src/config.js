import path from 'node:path';
import { isValidHash } from './lib/password.js';

const bool = (v, d) => (v === undefined || v === '' ? d : v === 'true' || v === '1');

/**
 * TRUST_PROXY: how far to trust X-Forwarded-For. Default 1 = one proxy (nginx) in front.
 * A number is a hop count, "false" disables it, anything else is passed on as IP/CIDR list.
 * "true" trusts every hop, which lets clients fake their IP and dodge the login rate limit,
 * so it is mapped to 1 as well.
 */
function parseTrustProxy(v) {
  if (v === undefined || v === '' || v === 'true') return 1;
  if (v === 'false') return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const production = nodeEnv === 'production';
  const errors = [];

  const port = Number(env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push('PORT must be 1-65535');

  const adminPasswordHash = env.ADMIN_PASSWORD_HASH || '';
  if (production && !adminPasswordHash) {
    errors.push('ADMIN_PASSWORD_HASH is required in production (run: npm run hash-password)');
  } else if (adminPasswordHash && !isValidHash(adminPasswordHash)) {
    errors.push('ADMIN_PASSWORD_HASH is not a valid scrypt hash (run: npm run hash-password)');
  }
  const adminUsername = (env.ADMIN_USERNAME ?? 'admin').trim();
  if (!adminUsername) errors.push('ADMIN_USERNAME must not be empty');
  if (errors.length) {
    throw new Error('Invalid configuration:\n - ' + errors.join('\n - '));
  }

  return {
    nodeEnv,
    production,
    port,
    host: env.HOST || '0.0.0.0',
    dataDir: path.resolve(env.DATA_DIR || (production ? '/data' : './data')),
    adminUsername,
    adminPasswordHash,
    seedSampleData: bool(env.SEED_SAMPLE_DATA, false),
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
  };
}
