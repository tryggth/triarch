/**
 * Automated Verification Suite - Synadia Credentials & NATS Configuration
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAndValidateCreds,
  loadNatsConfig,
  saveNatsConfig,
  clearNatsCredentials,
  getActiveTransportType,
  setActiveTransportType,
  DEFAULT_NATS_SERVERS
} from '../src/network/nats-config.js';
import {
  createSignalingTransport,
  TRANSPORT_TYPES
} from '../src/network/signaling.js';
import {
  BroadcastSignalingTransport,
  NatsSignalingTransport
} from '../src/network/transports/index.js';
import { NGS_RAW_CREDS } from '../src/network/creds/ngs-creds.js';

describe('Synadia .creds File Parsing & Ingestion', () => {
  test('Extracts valid JWT and NKey seed from standard NGS credentials', () => {
    const result = parseAndValidateCreds(NGS_RAW_CREDS);

    assert.equal(result.valid, true);
    assert.ok(result.jwt);
    assert.ok(result.jwt.startsWith('eyJ'));
    assert.ok(result.seed);
    assert.ok(result.seed.startsWith('SU'));
    assert.equal(result.userName, 'su');
    assert.equal(result.userType, 'user');
    assert.equal(result.error, null);
  });

  test('Rejects null, empty or non-string inputs safely', () => {
    assert.equal(parseAndValidateCreds(null).valid, false);
    assert.equal(parseAndValidateCreds('').valid, false);
    assert.equal(parseAndValidateCreds(undefined).valid, false);
    assert.ok(parseAndValidateCreds('').error);
  });

  test('Rejects credential missing JWT header or footer block', () => {
    const broken = `
      Some random text
      -----BEGIN USER NKEY SEED-----
      SUAF2F4LYTRORMF4CFFVV7VC275LFCQ6INZP3JCL72WO5JDMUF42DRZKJ4
      ------END USER NKEY SEED------
    `;
    const res = parseAndValidateCreds(broken);
    assert.equal(res.valid, false);
    assert.match(res.error, /BEGIN NATS USER JWT/);
  });

  test('Rejects credential missing NKey seed block', () => {
    const broken = `
      -----BEGIN NATS USER JWT-----
      eyJ0eXAiOiJKV1QiLCJhbGciOiJlZDI1NTE5LW5rZXkifQ.eyJqdGkiOiIxMjMifQ.sig
      ------END NATS USER JWT------
    `;
    const res = parseAndValidateCreds(broken);
    assert.equal(res.valid, false);
    assert.match(res.error, /BEGIN USER NKEY SEED/);
  });

  test('Rejects invalid NKey seed prefix (non-user seed)', () => {
    const invalidSeed = `
      -----BEGIN NATS USER JWT-----
      eyJ0eXAiOiJKV1QiLCJhbGciOiJlZDI1NTE5LW5rZXkifQ.eyJqdGkiOiIxMjMifQ.sig
      ------END NATS USER JWT------
      -----BEGIN USER NKEY SEED-----
      XXINVALIDPREFIX1234567890
      ------END USER NKEY SEED------
    `;
    const res = parseAndValidateCreds(invalidSeed);
    assert.equal(res.valid, false);
    assert.match(res.error, /Invalid NKey Seed prefix/);
  });
});

describe('NATS Configuration Storage & Transport Switching', () => {
  test('Saves and retrieves NATS configuration', () => {
    saveNatsConfig({
      serverUrl: 'wss://custom.nats.example:4222',
      activeTransport: 'nats'
    });

    const cfg = loadNatsConfig();
    assert.equal(cfg.serverUrl, 'wss://custom.nats.example:4222');
    assert.equal(cfg.activeTransport, 'nats');
  });

  test('setActiveTransportType and getActiveTransportType toggle state correctly', () => {
    setActiveTransportType('nats');
    assert.equal(getActiveTransportType(), 'nats');

    setActiveTransportType('broadcast');
    assert.equal(getActiveTransportType(), 'broadcast');
  });

  test('createSignalingTransport uses dynamically configured active transport', () => {
    // 1. Broadcast Mode
    setActiveTransportType('broadcast');
    const bcTransport = createSignalingTransport('TR-TEST-1', 'peer_test');
    assert.ok(bcTransport instanceof BroadcastSignalingTransport);
    bcTransport.leave();

    // 2. NATS Mode
    setActiveTransportType('nats');
    const natsTransport = createSignalingTransport('TR-TEST-2', 'peer_test');
    assert.ok(natsTransport instanceof NatsSignalingTransport);
    natsTransport.leave();

    // Reset back to broadcast default
    setActiveTransportType('broadcast');
  });

  test('clearNatsCredentials empties credsRaw', () => {
    saveNatsConfig({ credsRaw: 'test_creds' });
    assert.equal(loadNatsConfig().credsRaw, 'test_creds');

    clearNatsCredentials();
    assert.equal(loadNatsConfig().credsRaw, '');
  });
});
