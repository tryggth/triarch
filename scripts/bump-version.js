#!/usr/bin/env node
/**
 * TRIARCH: Cyclic Edge - Automated Semantic Version & Build Stamper
 * Synchronizes version.json, sw.js (CACHE_NAME), and package.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const VERSION_JSON_PATH = path.join(ROOT_DIR, 'version.json');
const SW_JS_PATH = path.join(ROOT_DIR, 'sw.js');
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');

// Parse CLI flags
const args = process.argv.slice(2);
const isMinor = args.includes('--minor');
const isMajor = args.includes('--major');
const isCi = args.includes('--ci');
const explicitVersionIdx = args.indexOf('--version');
const explicitVersion = explicitVersionIdx !== -1 ? args[explicitVersionIdx + 1] : null;

const buildNumIdx = args.indexOf('--build-number');
const buildNumber = buildNumIdx !== -1 ? parseInt(args[buildNumIdx + 1], 10) : null;

const shaIdx = args.indexOf('--sha');
const commitSha = shaIdx !== -1 ? args[shaIdx + 1] : null;

function parseSemver(semverStr) {
  const match = semverStr.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) {
    return { major: 1, minor: 0, patch: 0 };
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10)
  };
}

function bumpVersion(currentVersion) {
  if (explicitVersion) {
    return explicitVersion;
  }
  const { major, minor, patch } = parseSemver(currentVersion);

  if (isMajor) {
    return `${major + 1}.0.0`;
  }
  if (isMinor) {
    return `${major}.${minor + 1}.0`;
  }
  return `${major}.${minor}.${patch + 1}`;
}

export function executeBump() {
  // 1. Read version.json
  let versionData = {};
  if (fs.existsSync(VERSION_JSON_PATH)) {
    try {
      versionData = JSON.parse(fs.readFileSync(VERSION_JSON_PATH, 'utf8'));
    } catch (e) {
      console.warn('[Bump] Failed to parse version.json, creating new structure');
    }
  }

  const oldVersion = versionData.version || '1.13.0';
  const newVersion = isCi ? oldVersion : bumpVersion(oldVersion);
  const nowIso = new Date().toISOString();

  versionData.version = newVersion;
  versionData.buildTime = nowIso;
  if (buildNumber) {
    versionData.buildNumber = buildNumber;
  }
  if (commitSha) {
    versionData.commitSha = commitSha.slice(0, 7);
  }

  fs.writeFileSync(VERSION_JSON_PATH, JSON.stringify(versionData, null, 2) + '\n', 'utf8');
  console.log(`[Version] version.json updated: ${oldVersion} -> ${newVersion} (${nowIso})`);

  // 2. Update sw.js CACHE_NAME
  if (fs.existsSync(SW_JS_PATH)) {
    let swContent = fs.readFileSync(SW_JS_PATH, 'utf8');
    const swCacheRegex = /const CACHE_NAME = 'triarch-cache-v[^']+';/;
    const newCacheName = `const CACHE_NAME = 'triarch-cache-v${newVersion}';`;
    if (swCacheRegex.test(swContent)) {
      swContent = swContent.replace(swCacheRegex, newCacheName);
      fs.writeFileSync(SW_JS_PATH, swContent, 'utf8');
      console.log(`[Service Worker] sw.js CACHE_NAME updated -> triarch-cache-v${newVersion}`);
    }
  }

  // 3. Update package.json
  if (fs.existsSync(PACKAGE_JSON_PATH)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
      pkg.version = newVersion;
      fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
      console.log(`[Package] package.json version updated -> ${newVersion}`);
    } catch (e) {
      console.warn('[Bump] Failed to update package.json:', e.message);
    }
  }

  return { oldVersion, newVersion, buildTime: nowIso };
}

// If executed directly from CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  executeBump();
}
