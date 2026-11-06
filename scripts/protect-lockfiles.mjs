import { readFileSync, writeFileSync } from 'node:fs';

const proxy = 'https://packagefeedproxy.microsoft.io/npm/';
const backingFeed =
  'https://ms-feed-25.pkgs.visualstudio.com/1es-public/_packaging/npm-public/npm/registry/';
const paths = process.argv.slice(2);
if (!paths.length) paths.push('package-lock.json', 'frontend/package-lock.json');

for (const path of paths) {
  const lock = JSON.parse(readFileSync(path, 'utf8'));
  let normalized = 0;
  for (const dependency of Object.values(lock.packages)) {
    if (!dependency.resolved) continue;
    if (dependency.resolved.startsWith(backingFeed)) {
      dependency.resolved = proxy + dependency.resolved.slice(backingFeed.length);
      normalized += 1;
    }
    if (!dependency.resolved.startsWith(proxy)) {
      throw new Error(`${path}: unapproved source; no public fallback is permitted`);
    }
  }
  if (normalized) writeFileSync(path, `${JSON.stringify(lock, null, 2)}\n`);
  console.log(`${path}: ${normalized} CFS backing URLs normalized to the proxy.`);
}
