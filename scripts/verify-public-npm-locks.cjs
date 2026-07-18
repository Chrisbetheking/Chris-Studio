#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const lockfiles = [
  path.resolve('package-lock.json'),
  path.resolve('apps/desktop/ui/package-lock.json'),
];

const allowedRegistryHosts = new Set(['registry.npmjs.org']);
const failures = [];

for (const lockfile of lockfiles) {
  if (!fs.existsSync(lockfile)) {
    failures.push(`${path.relative(process.cwd(), lockfile)}: lockfile is missing`);
    continue;
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(lockfile, 'utf8'));
  } catch (error) {
    failures.push(`${path.relative(process.cwd(), lockfile)}: invalid JSON (${error.message})`);
    continue;
  }

  for (const [packagePath, metadata] of Object.entries(parsed.packages ?? {})) {
    if (!metadata || typeof metadata !== 'object') continue;
    const resolved = metadata.resolved;
    if (typeof resolved !== 'string' || resolved.length === 0) continue;

    let url;
    try {
      url = new URL(resolved);
    } catch {
      // Workspace and local package references are intentionally not URLs.
      continue;
    }

    if ((url.protocol === 'http:' || url.protocol === 'https:') && !allowedRegistryHosts.has(url.hostname)) {
      failures.push(
        `${path.relative(process.cwd(), lockfile)} :: ${packagePath || '<root>'} -> ${resolved}`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error('Non-public or unsupported package registry URLs were found:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('PUBLIC_NPM_LOCKFILE_REGISTRIES_VERIFIED');
