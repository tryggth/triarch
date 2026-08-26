/**
 * TRIARCH: Cyclic Edge - NATS / Synadia Cloud Configuration Manager
 * Handles credential parsing, JWT claims extraction, localStorage persistence,
 * and transport mode configuration.
 */

import { NGS_RAW_CREDS } from './creds/ngs-creds.js';

export const NATS_STORAGE_KEY = 'triarch_nats_config';

export const DEFAULT_NATS_SERVERS = {
  SYNADIA: 'wss://connect.ngs.global',
  DEMO: 'wss://demo.nats.io:8443'
};

export const DEFAULT_NATS_CONFIG = Object.freeze({
  serverUrl: DEFAULT_NATS_SERVERS.SYNADIA,
  credsRaw: NGS_RAW_CREDS,
  activeTransport: 'broadcast' // 'broadcast' | 'nats'
});

/**
 * In-memory fallback config for environments without localStorage.
 */
let inMemoryConfig = { ...DEFAULT_NATS_CONFIG };

/**
 * Validates and extracts JWT and NKey Seed components from a .creds file string.
 * @param {string} credsString
 * @returns {{
 *   valid: boolean,
 *   jwt: string|null,
 *   seed: string|null,
 *   userName: string|null,
 *   userType: string|null,
 *   issuerAccount: string|null,
 *   error: string|null
 * }}
 */
export function parseAndValidateCreds(credsString) {
  if (!credsString || typeof credsString !== 'string') {
    return {
      valid: false,
      jwt: null,
      seed: null,
      userName: null,
      userType: null,
      issuerAccount: null,
      error: 'Empty or invalid credential input.'
    };
  }

  const trimmed = credsString.trim();

  // Extract JWT block
  const jwtRegex = /-----BEGIN NATS USER JWT-----\s*([A-Za-z0-9._-]+)\s*------END NATS USER JWT------/;
  const jwtMatch = trimmed.match(jwtRegex);

  if (!jwtMatch || !jwtMatch[1]) {
    return {
      valid: false,
      jwt: null,
      seed: null,
      userName: null,
      userType: null,
      issuerAccount: null,
      error: 'Missing or malformed "-----BEGIN NATS USER JWT-----" block.'
    };
  }

  const jwt = jwtMatch[1].trim();

  // Extract NKey Seed block
  const seedRegex = /-----BEGIN (?:USER )?NKEY SEED-----\s*([A-Za-z0-9]+)\s*------END (?:USER )?NKEY SEED------/;
  const seedMatch = trimmed.match(seedRegex);

  if (!seedMatch || !seedMatch[1]) {
    return {
      valid: false,
      jwt,
      seed: null,
      userName: null,
      userType: null,
      issuerAccount: null,
      error: 'Missing or malformed "-----BEGIN USER NKEY SEED-----" block.'
    };
  }

  const seed = seedMatch[1].trim();

  // Validate seed prefix (SU = User seed, SO = Operator seed, SA = Account seed)
  if (!seed.startsWith('SU') && !seed.startsWith('SO') && !seed.startsWith('SA')) {
    return {
      valid: false,
      jwt,
      seed,
      userName: null,
      userType: null,
      issuerAccount: null,
      error: `Invalid NKey Seed prefix "${seed.slice(0, 2)}". Expected User seed starting with "SU".`
    };
  }

  // Parse JWT claims (Base64URL decode)
  let userName = 'Unknown';
  let userType = 'User';
  let issuerAccount = null;

  try {
    const parts = jwt.split('.');
    if (parts.length >= 2) {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = typeof atob === 'function'
        ? atob(base64)
        : Buffer.from(base64, 'base64').toString('utf8');
      const claims = JSON.parse(jsonPayload);

      if (claims.name) userName = claims.name;
      if (claims.nats && claims.nats.type) userType = claims.nats.type;
      if (claims.nats && claims.nats.issuer_account) issuerAccount = claims.nats.issuer_account;
    }
  } catch (err) {
    // Non-fatal, keep parsed credentials
  }

  return {
    valid: true,
    jwt,
    seed,
    userName,
    userType,
    issuerAccount,
    error: null
  };
}

/**
 * Loads NATS connection configuration from localStorage with defaults fallback.
 * @returns {{ serverUrl: string, credsRaw: string, activeTransport: string }}
 */
export function loadNatsConfig() {
  if (typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem(NATS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          serverUrl: parsed.serverUrl || DEFAULT_NATS_CONFIG.serverUrl,
          credsRaw: parsed.credsRaw !== undefined ? parsed.credsRaw : DEFAULT_NATS_CONFIG.credsRaw,
          activeTransport: parsed.activeTransport || DEFAULT_NATS_CONFIG.activeTransport
        };
      }
    } catch (err) {
      console.warn('[NATS Config] Error reading localStorage:', err);
    }
  }
  return { ...inMemoryConfig };
}

/**
 * Persists NATS configuration to localStorage.
 * @param {Object} config
 */
export function saveNatsConfig(config) {
  const current = loadNatsConfig();
  const updated = {
    serverUrl: config.serverUrl || current.serverUrl,
    credsRaw: config.credsRaw !== undefined ? config.credsRaw : current.credsRaw,
    activeTransport: config.activeTransport || current.activeTransport
  };

  inMemoryConfig = { ...updated };

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(NATS_STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.warn('[NATS Config] Error saving to localStorage:', err);
    }
  }

  return updated;
}

/**
 * Safely clears user-configured credentials from storage.
 */
export function clearNatsCredentials() {
  const current = loadNatsConfig();
  current.credsRaw = '';
  saveNatsConfig(current);
}

/**
 * Gets active transport identifier.
 * @returns {'broadcast'|'nats'}
 */
export function getActiveTransportType() {
  return loadNatsConfig().activeTransport || 'broadcast';
}

/**
 * Sets active transport identifier ('broadcast' or 'nats').
 * @param {'broadcast'|'nats'} transportType
 */
export function setActiveTransportType(transportType) {
  const norm = (transportType || 'broadcast').toLowerCase();
  saveNatsConfig({ activeTransport: norm === 'nats' ? 'nats' : 'broadcast' });
}
