import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkFoundrySource,
  checkProjectDependencies,
  checkRepository,
  checkWorkflow,
} from './check-standards.mjs';
import { fileURLToPath } from 'node:url';

const workflow = `permissions:
  contents: read
concurrency:
  group: example
  cancel-in-progress: true
jobs:
  test:
    steps:
      - uses: actions/checkout@${'a'.repeat(40)} # v7.0.1
      - uses: ./local-action
`;

test('accepts least-privilege workflows with immutable action pins', () => {
  assert.doesNotThrow(() => checkWorkflow(workflow, 'ci.yml'));
});

test('rejects mutable action tags, missing version evidence and container action tags', () => {
  for (const action of ['actions/checkout@v7', `actions/checkout@${'a'.repeat(40)}`, 'docker://image:latest']) {
    assert.throws(
      () => checkWorkflow(workflow.replace(/actions\/checkout@[^\n]+/, action), 'ci.yml'),
      /full SHA and version comment/,
    );
  }
});

test('rejects workflow-wide elevated permissions or missing concurrency', () => {
  assert.throws(
    () => checkWorkflow(workflow.replace('contents: read', 'contents: read\n  id-token: write'), 'ci.yml'),
    /permissions/,
  );
  assert.throws(
    () => checkWorkflow(workflow.replace('cancel-in-progress: true', 'cancel-in-progress: false'), 'ci.yml'),
    /cancelled/,
  );
});

test('permits Responses inference without an unused project SDK', () => {
  assert.doesNotThrow(() => checkProjectDependencies('"openai==3.42.1"', 'pyproject.toml'));
  assert.doesNotThrow(() =>
    checkFoundrySource('from openai import AsyncOpenAI\nawait client.responses.create()', 'inference.py'),
  );
});

test('accepts stable pinned Foundry v2 and rejects classic, preview and ambiguous versions', () => {
  assert.doesNotThrow(() =>
    checkProjectDependencies('"azure-ai-projects==2.0.0"', 'pyproject.toml'),
  );
  for (const dependency of [
    'azure-ai-projects==1.0.0',
    'azure-ai-projects>=2',
    'azure-ai-projects==2.0.0b1',
    'azure-ai-inference==1.0.0',
    'azure-ai-ml==1.0.0',
    'azure-ai-agents==1.0.0',
  ]) {
    assert.throws(() => checkProjectDependencies(`"${dependency}"`, 'pyproject.toml'));
  }
});

test('rejects legacy clients and Assistants calls in application code', () => {
  for (const source of [
    'from openai import AzureOpenAI',
    'from openai import AsyncAzureOpenAI',
    'from azure.ai.inference import ChatCompletionsClient',
    'client.agents.create_agent(name="legacy")',
    'client.beta.assistants.create()',
    'client.threads.runs.create()',
  ]) {
    assert.throws(() => checkFoundrySource(source, 'legacy.py'), /classic or Assistants/);
  }
});

test('current repository passes the same checks used by lint and CI', () => {
  assert.doesNotThrow(() => checkRepository(fileURLToPath(new URL('../', import.meta.url))));
});
