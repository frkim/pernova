import { readFileSync, existsSync } from 'node:fs';

const approved = 'https://packagefeedproxy.microsoft.io/npm/';
const paths = ['package-lock.json', 'frontend/package-lock.json'];
let checked = 0;

function inspectDependencies(dependencies, file) {
  for (const [name, dependency] of Object.entries(dependencies ?? {})) {
    if (dependency.resolved && !dependency.resolved.startsWith(approved)) {
      throw new Error(`${file}: ${name} must resolve through the approved CFS feed`);
    }
    inspectDependencies(dependency.dependencies, file);
  }
}

for (const path of paths) {
  if (!existsSync(path)) {
    throw new Error(`Missing required lock file: ${path}`);
  }
  const lock = JSON.parse(readFileSync(path, 'utf8'));
  inspectDependencies(lock.packages, path);
  inspectDependencies(lock.dependencies, path);
  checked += 1;
}

const pythonLock = readFileSync('backend/uv.lock', 'utf8');
const pythonRegistry = 'https://packagefeedproxy.microsoft.io/pypi/simple';
// This exact Azure Artifacts feed is advertised by the protected Python index.
const pythonBackingFeed =
  'https://ms-feed-25.pkgs.visualstudio.com/6f084628-a36d-42cb-934d-057357e379dc/_packaging/49d7402f-07bb-4b18-a9ce-086e6e98a554/pypi/download/';
for (const match of pythonLock.matchAll(/(registry|url)\s*=\s*"([^"]+)"/g)) {
  const [, kind, url] = match;
  const allowed = kind === 'registry'
    ? url === pythonRegistry
    : url.startsWith('https://packagefeedproxy.microsoft.io/') || url.startsWith(pythonBackingFeed);
  if (!allowed) {
    throw new Error('backend/uv.lock must resolve through CFS or its exact approved backing feed');
  }
}
console.log(`Protected package feeds verified (${checked} npm locks and uv.lock).`);
