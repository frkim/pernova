import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Reject unpinned remote actions and workflow-wide elevated permissions. */
export function checkWorkflow(source, path) {
  const permissions = source.match(/^permissions:\s*\r?\n((?:[ \t]+[^\r\n]*\r?\n?)+)/m);
  if (!permissions || permissions[1].trim() !== 'contents: read') {
    throw new Error(`${path}: workflow permissions must be contents: read only`);
  }
  if (!/^\s+cancel-in-progress:\s*true\s*$/m.test(source)) {
    throw new Error(`${path}: obsolete runs must be cancelled`);
  }
  for (const match of source.matchAll(/^\s*(?:-\s*)?uses:\s*([^\r\n]+)/gm)) {
    const action = match[1].trim();
    if (action.startsWith('./')) continue;
    if (!/^[\w./-]+@[0-9a-f]{40}\s+#\s*v\d[\w.-]*\s*$/.test(action)) {
      throw new Error(`${path}: remote actions need a full SHA and version comment`);
    }
  }
}

/** Keep project dependencies on Foundry v2; direct Responses inference needs no project SDK. */
export function checkProjectDependencies(source, path) {
  if (/["']azure-ai-(?:inference|generative|ml|agents)(?:[<>=~[;"']|\s)/i.test(source)) {
    throw new Error(`${path}: legacy Foundry dependencies are not supported`);
  }
  for (const match of source.matchAll(/["']azure-ai-projects([^"']*)["']/gi)) {
    if (!/^==2\.\d+\.\d+$/.test(match[1])) {
      throw new Error(`${path}: pin azure-ai-projects to a researched stable 2.x release`);
    }
  }
}

/** Reject legacy Foundry clients and Assistants operations in shipped Python code. */
export function checkFoundrySource(source, path) {
  const legacyImport =
    /^\s*(?:from\s+(?:azure\.ai\.(?:inference|ml|agents)|azure\.openai)\b|(?:from\s+openai\s+import|import)\s+[^\r\n#]*\b(?:AzureOpenAI|AsyncAzureOpenAI)\b)/m;
  const legacyCall = /\.(?:create_agent|create_thread|create_run)\s*\(|\.beta\.assistants\b|\.threads\.(?:create|runs)\b/;
  if (legacyImport.test(source) || legacyCall.test(source)) {
    throw new Error(`${path}: use Foundry new/v2 and Responses, not classic or Assistants`);
  }
}

/** Check the repository-owned workflows and Python sources without inspecting dependencies. */
export function checkRepository(root) {
  const workflows = join(root, '.github', 'workflows');
  for (const name of readdirSync(workflows).filter((name) => /\.ya?ml$/.test(name))) {
    checkWorkflow(readFileSync(join(workflows, name), 'utf8'), name);
  }
  checkProjectDependencies(
    readFileSync(join(root, 'backend', 'pyproject.toml'), 'utf8'),
    'backend/pyproject.toml',
  );
  function inspect(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory() && entry.name !== '__pycache__') inspect(path);
      else if (entry.isFile() && entry.name.endsWith('.py')) {
        checkFoundrySource(readFileSync(path, 'utf8'), path);
      }
    }
  }
  inspect(join(root, 'backend', 'app'));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkRepository(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  console.log('Repository standards verified (CI action pins/permissions and Foundry v2 source).');
}
