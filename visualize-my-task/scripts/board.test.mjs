import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createServer, readSnapshot } from './board.mjs';

const plan = '| Task | Status | Tests | Acceptance | Delivery |\n| --- | --- | --- | --- | --- |\n| Login | Done | Passed | Pending acceptance | Pushed abc123 |\n';

test('language follows selected task prose before specs and history without changing facts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'visualize-my-task-language-'));
  try {
    await writeFile(join(root, 'PLAN.md'), '| ID | Task | Status | Tests | Detail |\n| --- | --- | --- | --- | --- |\n| AUTH_SESSION_TOKEN_REFRESH | 修复登录状态 | active | passed | 保留用户会话 |\n');
    await writeFile(join(root, 'OTHER.md'), '- [ ] Implement automatic synchronization for all documents');
    await writeFile(join(root, 'SPEC.md'), '# Product design\nUsers can synchronize documents across devices.');
    await writeFile(join(root, 'CHANGELOG.md'), '# Changes\nReleased the new synchronization feature.');
    const options = { root, planPaths: ['PLAN.md'], specPaths: ['SPEC.md'], changelogPaths: ['CHANGELOG.md'] };
    const chinese = await readSnapshot(options);
    assert.equal(chinese.language, 'zh');
    assert.equal(chinese.languageSource, 'documents');
    assert.equal(chinese.items[0].id, 'AUTH_SESSION_TOKEN_REFRESH');
    assert.equal(chinese.items[0].label, '修复登录状态');
    assert.equal(chinese.items[0].development, 'active');
    const english = await readSnapshot({ ...options, planPaths: ['OTHER.md'] });
    assert.equal(english.language, 'en');
    assert.equal(english.languageSource, 'documents');
    assert.match(english.title, /Task board/);
    assert.equal((await readSnapshot({ root, specPaths: ['SPEC.md'] })).language, 'en');
    assert.equal((await readSnapshot({ root, changelogPaths: ['CHANGELOG.md'] })).language, 'en');
    const empty = await readSnapshot({ root });
    assert.equal(empty.language, 'zh');
    assert.equal(empty.languageSource, 'fallback');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('language honors supported project declarations and explicit locale overrides', async () => {
  const root = await mkdtemp(join(tmpdir(), 'visualize-my-task-project-language-'));
  try {
    await writeFile(join(root, 'PLAN.md'), '- [ ] 完成用户登录');
    await writeFile(join(root, 'package.json'), JSON.stringify({ i18n: { defaultLocale: 'en-US' } }));
    const options = { root, planPaths: ['PLAN.md'] };
    const project = await readSnapshot(options);
    assert.equal(project.language, 'en');
    assert.equal(project.languageSource, 'project');
    const explicit = await readSnapshot({ ...options, lang: 'zh-CN', title: '原始标题' });
    assert.equal(explicit.language, 'zh');
    assert.equal(explicit.languageSource, 'explicit');
    assert.equal(explicit.title, '原始标题');
    await writeFile(join(root, 'package.json'), JSON.stringify({ defaultLocale: 'fr', language: 'en' }));
    await writeFile(join(root, 'README.md'), '# Demo\n\nPrimary language: English\n');
    assert.equal((await readSnapshot(options)).language, 'en');
    await writeFile(join(root, 'README.md'), '# English README\nThis software uses TypeScript.');
    const inferred = await readSnapshot(options);
    assert.equal(inferred.language, 'zh');
    assert.equal(inferred.languageSource, 'documents');
    await assert.rejects(readSnapshot({ ...options, lang: 'fr' }), /--lang/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('language refreshes live while stale plans retain their last successful language evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'visualize-my-task-language-stale-'));
  const options = { root, planPaths: ['PLAN.md'], specPaths: ['SPEC.md'], cache: new Map() };
  try {
    await writeFile(join(root, 'PLAN.md'), '- [ ] Implement session refresh');
    await writeFile(join(root, 'SPEC.md'), '# 产品设计\n保持用户会话。');
    const first = await readSnapshot(options);
    assert.equal(first.language, 'en');
    await writeFile(join(root, 'PLAN.md'), '# 临时编辑中的计划');
    const stale = await readSnapshot(options);
    assert.equal(stale.sources[0].state, 'stale');
    assert.equal(stale.language, 'en');
    assert.equal(stale.languageSource, 'documents');
    await writeFile(join(root, 'PLAN.md'), '- [ ] 修复用户会话');
    const recovered = await readSnapshot(options);
    assert.equal(recovered.language, 'zh');
    assert.notEqual(recovered.revision, stale.revision);
    await writeFile(join(root, 'package.json'), JSON.stringify({ defaultLocale: 'en' }));
    assert.equal((await readSnapshot(options)).languageSource, 'project');
    await writeFile(join(root, 'package.json'), '{');
    assert.equal((await readSnapshot(options)).language, 'en');
    await writeFile(join(root, 'package.json'), '{}');
    assert.equal((await readSnapshot(options)).language, 'zh');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('renamed project declarations replace removed metadata instead of retaining its cached language', async () => {
  const root = await mkdtemp(join(tmpdir(), 'visualize-my-task-language-rename-'));
  const options = { root, cache: new Map() };
  try {
    await writeFile(join(root, 'README.md'), 'Primary language: English');
    assert.equal((await readSnapshot(options)).language, 'en');
    await rename(join(root, 'README.md'), join(root, 'README.markdown'));
    await writeFile(join(root, 'README.markdown'), '项目主语言：中文');
    const renamed = await readSnapshot(options);
    assert.equal(renamed.language, 'zh');
    assert.equal(renamed.languageSource, 'project');
    await rm(join(root, 'README.markdown'));
    const removed = await readSnapshot(options);
    assert.equal(removed.language, 'zh');
    assert.equal(removed.languageSource, 'fallback');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('source faults expose stable codes and localize recognized diagnostics', async () => {
  const root = await mkdtemp(join(tmpdir(), 'visualize-my-task-language-errors-'));
  try {
    await writeFile(join(root, 'bad.md'), '| Task | Status |\n| --- | --- |\n| Broken |');
    await writeFile(join(root, 'empty.md'), '');
    await writeFile(join(root, 'invalid.md'), Buffer.from([0xc3, 0x28]));
    await mkdir(join(root, 'directory.md'));
    const options = { root, lang: 'en', planPaths: ['missing.md', 'bad.md', 'invalid.md', 'directory.md'], specPaths: ['empty.md'] };
    const english = await readSnapshot(options);
    assert.deepEqual(english.sources.map(source => source.errorCode), ['SOURCE_NOT_FOUND', 'MARKDOWN_TABLE_ROW', 'SOURCE_ENCODING', 'SOURCE_NOT_FILE', 'MARKDOWN_EMPTY_SPEC']);
    assert.match(english.sources[0].error, /not found/i);
    assert.match(english.sources[1].error, /bad\.md: line 3:.*expected 2 cells, found 1/i);
    assert.match(english.sources[4].error, /Empty specification/);
    const chinese = await readSnapshot({ ...options, lang: 'zh' });
    assert.deepEqual(chinese.sources.map(source => source.errorCode), english.sources.map(source => source.errorCode));
    assert.match(chinese.sources[0].error, /文件不存在/);
    assert.match(chinese.sources[1].error, /bad\.md: 第 3 行/);
    assert.match(chinese.sources[4].error, /规格文档为空/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('recognized parser warnings follow UI language while original task content stays unchanged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'visualize-my-task-language-warnings-'));
  try {
    await writeFile(join(root, 'PLAN.md'), '- [ ] 修复登录\n\n```js\nunfinished example');
    const chinese = await readSnapshot({ root, planPaths: ['PLAN.md'] });
    assert.equal(chinese.language, 'zh');
    assert.match(chinese.warnings[0], /代码围栏未闭合/);
    const english = await readSnapshot({ root, planPaths: ['PLAN.md'], lang: 'en' });
    assert.match(english.warnings[0], /Unclosed code fence/);
    assert.equal(english.items[0].label, chinese.items[0].label);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('CLI accepts language overrides and preserves legacy sidecar discovery with new names preferred', async () => {
  const root = await mkdtemp(join(tmpdir(), 'visualize-my-task-language-cli-'));
  try {
    await writeFile(join(root, 'PLAN.md'), '| ID | Task |\n| --- | --- |\n| A | 完成登录 |');
    await writeFile(join(root, '.development-board.md'), '| ID | Workstream |\n| --- | --- |\n| A | security |');
    const script = fileURLToPath(new URL('./board.mjs', import.meta.url));
    const run = (...args) => spawnSync(process.execPath, [script, '--root', root, '--plan', 'PLAN.md', '--check', ...args], { encoding: 'utf8' });
    const legacy = run('--lang', 'en-US');
    assert.equal(legacy.status, 0, legacy.stderr);
    assert.equal(JSON.parse(legacy.stdout).language, 'en');
    assert.equal(JSON.parse(legacy.stdout).languageSource, 'explicit');
    assert.equal(JSON.parse(legacy.stdout).relations[0].workstream, 'security');
    await writeFile(join(root, '.visualize-my-task.md'), '| ID | Workstream |\n| --- | --- |\n| A | release |');
    const current = run('--lang', 'auto');
    assert.equal(current.status, 0, current.stderr);
    assert.equal(JSON.parse(current.stdout).relations[0].workstream, 'release');
    assert.equal(JSON.parse(current.stdout).language, 'zh');
    assert.equal(run('--lang', 'de').status, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('spec-only projects retain references and history without making completed or current tasks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'visualize-my-task-spec-only-'));
  try {
    await writeFile(join(root, 'SPEC.md'), '# Product\n\n## Acceptance criteria\n- [x] Login works\n\nTask | Status | Tests | Acceptance | Delivery\n--- | --- | --- | --- | ---\nLogin | done | passed | accepted | delivered\n');
    await writeFile(join(root, 'CHANGELOG.md'), '# Changes\n\n## Earlier experiment\nImplemented a prototype.\n');
    const snapshot = await readSnapshot({ root, specPaths: ['SPEC.md'], changelogPaths: ['CHANGELOG.md'] });
    assert.deepEqual(snapshot.items, []);
    assert.equal(snapshot.specifications.length, 1);
    assert.equal(snapshot.sources.find(source => source.name === 'SPEC.md').mode, 'spec');
    assert.equal(snapshot.planningState, 'spec-only');
    assert.equal(snapshot.history.length, 1);
    const { buildMission } = await import('../assets/mission-model.mjs');
    const graph = buildMission(snapshot);
    assert.equal(graph.nodes.length, 0);
    assert.equal(graph.currentKey, null);
    assert.equal(graph.nextKey, null);
    const failed = await readSnapshot({ root, specPaths: ['SPEC.md'], planPaths: ['missing.md'] });
    assert.equal(failed.planningState, 'source-error');
    assert.equal(failed.specifications.length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('spec references refresh and fall back independently of healthy specs and task status', async () => {
  const root = await mkdtemp(join(tmpdir(), 'visualize-my-task-spec-refresh-'));
  const options = { root, planPaths: ['work.md'], specPaths: ['product.md', 'architecture.md'], cache: new Map() };
  try {
    await writeFile(join(root, 'work.md'), plan.replace('Done', 'In progress'));
    await writeFile(join(root, 'product.md'), '# Product\n\n## Requirements\n- [x] Criterion approved\n');
    await writeFile(join(root, 'architecture.md'), '# Architecture\nLocal storage.\n');
    const first = await readSnapshot(options);
    assert.equal(first.planningState, 'documented');
    assert.deepEqual(first.items[0].states, { development: 'active', verification: 'passed', acceptance: 'pending', delivery: 'delivered' });
    assert.deepEqual(first.specifications.map(entry => entry.stale), [false, false]);
    await writeFile(join(root, 'product.md'), '');
    await writeFile(join(root, 'architecture.md'), '# Architecture\nEncrypted local storage.\n');
    const next = await readSnapshot(options);
    assert.deepEqual(next.specifications.map(entry => entry.stale), [true, false]);
    assert.match(next.specifications[0].text, /Criterion approved/);
    assert.match(next.specifications[1].text, /Encrypted local storage/);
    assert.equal(next.items[0].stale, false);
    assert.equal(next.items[0].states.acceptance, 'pending');
    assert.equal(next.sources.find(source => source.name === 'product.md').state, 'stale');
    assert.notEqual(next.revision, first.revision);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('stale cache never transfers task facts across source roles on the same path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'visualize-my-task-source-role-'));
  const cache = new Map();
  const path = join(root, 'source.md');
  try {
    await writeFile(path, plan);
    const tasks = await readSnapshot({ root, planPaths: ['source.md'], cache });
    assert.equal(tasks.items[0].states.development, 'done');
    await rm(path);
    const absentSpec = await readSnapshot({ root, specPaths: ['source.md'], cache });
    assert.deepEqual(absentSpec.items, []);
    assert.deepEqual(absentSpec.specifications, []);
    assert.equal(absentSpec.sources[0].state, 'error');
    assert.equal(absentSpec.planningState, 'source-error');
    await writeFile(path, '# Requirements\n- [x] Criterion approved\n');
    const spec = await readSnapshot({ root, specPaths: ['source.md'], cache });
    assert.equal(spec.specifications.length, 1);
    assert.deepEqual(spec.items, []);
    await rm(path);
    const oldTasks = await readSnapshot({ root, planPaths: ['source.md'], cache });
    assert.equal(oldTasks.sources[0].state, 'stale');
    assert.equal(oldTasks.items[0].states.development, 'done');
    assert.deepEqual(oldTasks.specifications, []);
    const oldSpec = await readSnapshot({ root, specPaths: ['source.md'], cache });
    assert.equal(oldSpec.sources[0].state, 'stale');
    assert.deepEqual(oldSpec.items, []);
    assert.equal(oldSpec.specifications[0].text, '# Requirements\n- [x] Criterion approved\n');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('spec sources share file, record and source-count limits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'visualize-my-task-spec-limits-'));
  try {
    await writeFile(join(root, 'large.md'), 'a'.repeat(2_000_001));
    const large = await readSnapshot({ root, specPaths: ['large.md'] });
    assert.equal(large.planningState, 'source-error');
    assert.match(large.sources[0].error, /2,000,000/);
    await writeFile(join(root, 'sections.md'), Array.from({ length: 2001 }, (_, index) => `## Criterion ${index}\nDetails.\n`).join('\n'));
    const sections = await readSnapshot({ root, specPaths: ['sections.md'] });
    assert.equal(sections.sources[0].state, 'error');
    assert.match(sections.sources[0].error, /2,000/);
    await assert.rejects(readSnapshot({ root, specPaths: Array.from({ length: 17 }, (_, index) => `${index}.md`) }), /16/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('CLI selects custom spec and task paths explicitly without adding unrelated default documents', async () => {
  const root = await mkdtemp(join(tmpdir(), 'visualize-my-task-spec-cli-'));
  try {
    await mkdir(join(root, 'requirements'), { recursive: true });
    await mkdir(join(root, 'specs'), { recursive: true });
    await writeFile(join(root, 'PLAN.md'), '- [x] Unrelated default task');
    await writeFile(join(root, 'SPEC.md'), '# Unrelated default spec\nDefault design.');
    await writeFile(join(root, 'CHANGELOG.md'), '# Unrelated default history\nDefault history.');
    await writeFile(join(root, 'requirements', 'implementation.md'), plan);
    await writeFile(join(root, 'specs', 'design.md'), '# Custom product design\nRequirements only.');
    await writeFile(join(root, 'specs', 'constraints.markdown'), '# Custom constraints\nOffline first.');
    const script = fileURLToPath(new URL('./board.mjs', import.meta.url));
    const run = (...args) => spawnSync(process.execPath, [script, '--root', root, ...args, '--check'], { encoding: 'utf8' });
    const mixed = run('--plan', 'requirements/implementation.md', '--spec', 'specs/design.md', '--spec', 'specs/constraints.markdown');
    assert.equal(mixed.status, 0, mixed.stderr);
    const snapshot = JSON.parse(mixed.stdout);
    assert.equal(snapshot.items.length, 1);
    assert.equal(snapshot.items[0].source, 'requirements/implementation.md');
    assert.equal(snapshot.specifications.length, 2);
    assert.deepEqual(snapshot.history, []);
    assert.deepEqual(snapshot.sources.map(source => source.name).sort(), ['requirements/implementation.md', 'specs/constraints.markdown', 'specs/design.md']);
    const onlySpec = run('--spec', 'specs/design.md');
    assert.equal(onlySpec.status, 0, onlySpec.stderr);
    assert.equal(JSON.parse(onlySpec.stdout).planningState, 'spec-only');
    assert.deepEqual(JSON.parse(onlySpec.stdout).items, []);
    const onlyPlan = run('--plan', 'requirements/implementation.md');
    assert.equal(onlyPlan.status, 0, onlyPlan.stderr);
    assert.deepEqual(JSON.parse(onlyPlan.stdout).specifications, []);
    const missing = run('--spec', 'specs/missing.md');
    assert.equal(missing.status, 1);
    assert.equal(JSON.parse(missing.stdout).planningState, 'source-error');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('CLI discovers conventional specs alongside plans and in spec-only projects', async () => {
  const root = await mkdtemp(join(tmpdir(), 'visualize-my-task-spec-discovery-'));
  try {
    await mkdir(join(root, 'docs'));
    await writeFile(join(root, 'docs', 'spec.md'), '# Product requirements\nNo task schedule yet.');
    const script = fileURLToPath(new URL('./board.mjs', import.meta.url));
    const run = () => spawnSync(process.execPath, [script, '--root', root, '--check'], { encoding: 'utf8' });
    const only = run();
    assert.equal(only.status, 0, only.stderr);
    assert.equal(JSON.parse(only.stdout).planningState, 'spec-only');
    assert.equal(JSON.parse(only.stdout).specifications[0].source, 'docs/spec.md');
    await writeFile(join(root, 'PLAN.md'), plan);
    const mixed = run();
    assert.equal(mixed.status, 0, mixed.stderr);
    assert.equal(JSON.parse(mixed.stdout).items.length, 1);
    assert.equal(JSON.parse(mixed.stdout).specifications.length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('case-insensitive explicit paths keep on-disk source identities and stale fallback', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'visualize-my-task-source-case-'));
  const cache = new Map();
  try {
    await writeFile(join(root, 'plan.md'), '| ID | Task | Status |\n| --- | --- | --- |\n| P1 | Storage | done |\n| P2 | Export | planned |');
    await writeFile(join(root, 'BOARD.md'), '| ID | Source | Dependencies |\n| --- | --- | --- |\n| P2 | plan.md | P1 |');
    const exact = await readSnapshot({ root, planPaths: ['plan.md'], relationPaths: ['BOARD.md'] });
    const options = { root, planPaths: ['PLAN.md'], relationPaths: ['BOARD.md'], cache };
    const aliased = await readSnapshot(options);
    if (aliased.sources[0].state === 'error') return t.skip('Case-sensitive filesystem has no uppercase alias.');
    assert.equal(aliased.sources[0].name, 'plan.md');
    assert.deepEqual(aliased.items.map(item => item.key), exact.items.map(item => item.key));
    const { buildMission } = await import('../assets/mission-model.mjs');
    const graph = buildMission(aliased);
    assert.deepEqual(graph.nodes[1].dependencies, [graph.nodes[0].key]);
    assert.deepEqual(graph.warnings, []);
    await writeFile(join(root, 'plan.md'), '# Temporarily incomplete');
    const stale = await readSnapshot(options);
    assert.equal(stale.sources[0].state, 'stale');
    assert.equal(stale.sources[0].name, 'plan.md');
    assert.deepEqual(stale.items.map(item => item.key), exact.items.map(item => item.key));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('relation sources refresh independently, preserve fallback, and never add duplicate tasks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'visualize-my-task-relations-'));
  const cache = new Map();
  try {
    await writeFile(join(root, 'PLAN.md'), '| ID | Task | Status |\n| --- | --- | --- |\n| FIX | Repair | active |');
    await writeFile(join(root, 'BOARD.md'), '| ID | Route | After |\n| --- | --- | --- |\n| FIX | branch | 1 |');
    const options = { root, planPaths: ['PLAN.md'], relationPaths: ['BOARD.md'], cache };
    const first = await readSnapshot(options);
    assert.equal(first.items.length, 1);
    assert.equal(first.items[0].states.development, 'active');
    assert.equal(first.relations[0].route, 'branch');
    assert.equal(first.sources[1].mode, 'relations');
    assert.equal(first.planningState, 'documented');
    await writeFile(join(root, 'BOARD.md'), '# Incomplete relation edit');
    const stale = await readSnapshot(options);
    assert.equal(stale.sources[1].state, 'stale');
    assert.equal(stale.relations[0].stale, true);
    assert.equal(stale.items[0].stale, false);
    assert.notEqual(stale.revision, first.revision);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('CLI permits a genuinely empty project and discovers a sidecar alongside explicit plans', async () => {
  const root = await mkdtemp(join(tmpdir(), 'visualize-my-task-empty-'));
  try {
    const script = fileURLToPath(new URL('./board.mjs', import.meta.url));
    const empty = spawnSync(process.execPath, [script, '--root', root, '--check'], { encoding: 'utf8' });
    assert.equal(empty.status, 0, empty.stderr);
    assert.equal(JSON.parse(empty.stdout).planningState, 'no-plan');
    await writeFile(join(root, 'PLAN.md'), '| ID | Task |\n| --- | --- |\n| A | Work |');
    await writeFile(join(root, 'BOARD.md'), '| ID | Workstream |\n| --- | --- |\n| A | security |');
    const filled = spawnSync(process.execPath, [script, '--root', root, '--plan', 'PLAN.md', '--check'], { encoding: 'utf8' });
    assert.equal(filled.status, 0, filled.stderr);
    assert.equal(JSON.parse(filled.stdout).relations[0].workstream, 'security');
    assert.equal(JSON.parse(filled.stdout).items.length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('reads real documents, refreshes changes, preserves acceptance, and exposes a read-only local API', async () => {
  const root = await mkdtemp(join(tmpdir(), 'visualize-my-task-'));
  const planPath = join(root, 'PLAN.md');
  await writeFile(planPath, plan);
  await writeFile(join(root, 'CHANGELOG.md'), '# Changes\n\n## 2026-10-13\n- Added login; tests passed; pushed abc123.\n');
  const server = createServer({ root, planPaths: ['PLAN.md'], changelogPaths: ['CHANGELOG.md'], title: 'Demo' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const first = await (await fetch(`${base}/api/plan`)).json();
    assert.equal(first.title, 'Demo');
    assert.equal(first.items.length, 1);
    assert.equal(first.items[0].states.acceptance, 'pending');
    assert.equal(first.history.length, 1);
    assert.equal(first.sources[0].state, 'live');
    assert.ok(first.revision);
    assert.equal(await (await fetch(base)).text().then(text => text.includes('api/plan')), true);
    const model = await fetch(`${base}/assets/mission-model.mjs`);
    assert.equal(model.status, 200);
    assert.match(model.headers.get('content-type'), /javascript/);
    assert.match(await model.text(), /export function buildMission/);
    const translations = await fetch(`${base}/assets/i18n.mjs`);
    assert.equal(translations.status, 200);
    assert.match(translations.headers.get('content-type'), /javascript/);
    assert.match(await translations.text(), /export /);
    assert.match(await (await fetch(base)).text(), /data-language="en"/);
    assert.equal((await fetch(`${base}/assets/markdown.mjs`)).status, 404);

    await writeFile(planPath, plan.replace('Pending acceptance', 'Accepted'));
    const next = await (await fetch(`${base}/api/plan`)).json();
    assert.notEqual(next.revision, first.revision);
    assert.equal(next.items[0].states.acceptance, 'accepted');

    await writeFile(planPath, '# Temporarily incomplete document');
    const stale = await (await fetch(`${base}/api/plan`)).json();
    assert.equal(stale.sources[0].state, 'stale');
    assert.equal(stale.items[0].acceptance, 'Accepted');
    assert.equal(stale.sources[1].state, 'live');
    assert.ok(stale.sources[0].error);
    assert.equal(stale.sources[0].lastSuccess, next.sources[0].lastSuccess);

    await writeFile(planPath, plan);
    const recovered = await (await fetch(`${base}/api/plan`)).json();
    assert.equal(recovered.sources[0].state, 'live');
    assert.equal(recovered.items[0].states.acceptance, 'pending');
    assert.equal((await fetch(`${base}/api/plan`, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${base}/PLAN.md`)).status, 404);
    assert.equal((await fetch(`${base}/api/plan?path=/etc/passwd`)).status, 404);
    assert.equal((await fetch(`${base}/api/plan`, { headers: { Origin: 'https://example.com' } })).status, 403);
    const badHostStatus = await new Promise((resolve, reject) => {
      const probe = request(`${base}/api/plan`, { headers: { Host: 'example.com' } }, response => {
        response.resume();
        response.once('end', () => resolve(response.statusCode));
      });
      probe.once('error', reject);
      probe.end();
    });
    assert.equal(badHostStatus, 403);
    const head = await fetch(base, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.equal(await readFile(planPath, 'utf8'), plan);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test('supports changelog-only history, reports first-read errors, and rejects oversized inputs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'visualize-my-task-history-'));
  try {
    await writeFile(join(root, 'CHANGELOG.md'), '# Changes\n\n## Unreleased\n- Tests passed and pushed.\n');
    const snapshot = await readSnapshot({ root, planPaths: [], changelogPaths: ['CHANGELOG.md'] });
    assert.equal(snapshot.items.length, 0);
    assert.equal(snapshot.history.length, 1);
    const bad = await readSnapshot({ root, planPaths: ['missing.md'], changelogPaths: ['CHANGELOG.md'] });
    assert.equal(bad.sources[0].state, 'error');
    assert.equal(bad.sources[0].lastSuccess, null);
    assert.equal(bad.history.length, 1);
    await writeFile(join(root, 'large.md'), 'a'.repeat(2_000_001));
    const large = await readSnapshot({ root, planPaths: ['large.md'], changelogPaths: [] });
    assert.equal(large.sources[0].state, 'error');
    assert.match(large.sources[0].error, /2,?000,?000|2 MB/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('explicit task identities survive blank lines and unique-ID row reordering while locations update', async () => {
  const root = await mkdtemp(join(tmpdir(), 'visualize-my-task-identity-'));
  const path = join(root, 'PLAN.md');
  const original = '# Plan\n\n## Build\nID | Task | Status\n--- | --- | ---\nA | Login | active\nB | Sync | planned\n';
  const options = { root, planPaths: ['PLAN.md'], cache: new Map() };
  try {
    await writeFile(path, original);
    const first = await readSnapshot(options);
    assert.deepEqual(first.items.map(({ line }) => line), [6, 7]);
    const keys = new Map(first.items.map(({ id, key }) => [id, key]));
    await writeFile(path, '\n' + original);
    const shifted = await readSnapshot(options);
    assert.deepEqual(shifted.items.map(({ key }) => key), first.items.map(({ key }) => key));
    assert.deepEqual(shifted.items.map(({ line }) => line), [7, 8]);
    await writeFile(path, '\n# Plan\n\n## Build\nID | Task | Status\n--- | --- | ---\nB | Sync | planned\nA | Login | active\n');
    const reordered = await readSnapshot(options);
    assert.deepEqual(reordered.items.map(({ id }) => id), ['B', 'A']);
    assert.deepEqual(reordered.items.map(({ key }) => key), [keys.get('B'), keys.get('A')]);
    assert.deepEqual(reordered.items.map(({ line }) => line), [7, 8]);
    assert.equal(reordered.items[0].explicitId, true);
    assert.notEqual(reordered.revision, first.revision);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('implicit table and checklist identities stay stable with distinct duplicate occurrences', async () => {
  const root = await mkdtemp(join(tmpdir(), 'visualize-my-task-implicit-identity-'));
  const path = join(root, 'PLAN.md');
  const original = '# Plan\n\n## Build\nTask | Status\n--- | ---\n123 Same | planned\n123 Same | planned\n\n- [ ] 123 Same\n- [x] 123 Same\n\n## Elsewhere\n- [ ] 123 Same\n';
  const options = { root, planPaths: ['PLAN.md'] };
  try {
    await writeFile(path, original);
    const first = await readSnapshot(options);
    assert.equal(first.items.length, 5);
    assert.equal(new Set(first.items.map(({ key }) => key)).size, 5);
    assert.deepEqual(first.items.map(({ id }) => id), ['6', '7', '9', '10', '13']);
    assert.equal(first.items.some(({ explicitId }) => explicitId), false);
    await writeFile(path, '\n' + original.replace('- [ ] 123 Same', '- [x] 123 Same'));
    const shifted = await readSnapshot(options);
    assert.deepEqual(shifted.items.map(({ key }) => key), first.items.map(({ key }) => key));
    assert.deepEqual(shifted.items.map(({ id }) => id), ['7', '8', '10', '11', '14']);
    assert.deepEqual(shifted.items.map(({ line }) => line), [7, 8, 10, 11, 14]);
    assert.equal(shifted.items[2].states.development, 'done');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('duplicate explicit IDs remain separate and task identities are scoped to each source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'visualize-my-task-duplicate-identity-'));
  const original = 'ID | Task | Status\n--- | --- | ---\nA | First | active\nA | Second | planned\n';
  const options = { root, planPaths: ['PLAN.md', 'OTHER.md'] };
  try {
    await writeFile(join(root, 'PLAN.md'), original);
    await writeFile(join(root, 'OTHER.md'), original);
    const first = await readSnapshot(options);
    assert.equal(new Set(first.items.map(({ key }) => key)).size, 4);
    await writeFile(join(root, 'PLAN.md'), '\n\n' + original);
    const shifted = await readSnapshot(options);
    assert.deepEqual(shifted.items.map(({ key }) => key), first.items.map(({ key }) => key));
    assert.deepEqual(shifted.items.map(({ label }) => label), ['First', 'Second', 'First', 'Second']);
    assert.deepEqual(shifted.items.map(({ line }) => line), [5, 6, 3, 4]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('CLI checks explicit source paths and refuses unknown flags or missing documents', async () => {
  const root = await mkdtemp(join(tmpdir(), 'visualize-my-task-cli-'));
  try {
    await writeFile(join(root, 'PLAN.md'), plan);
    const path = fileURLToPath(new URL('./board.mjs', import.meta.url));
    const run = (...args) => spawnSync(process.execPath, [path, '--root', root, ...args], { encoding: 'utf8' });
    const valid = run('--plan', 'PLAN.md', '--check');
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(JSON.parse(valid.stdout).items.length, 1);
    assert.equal(run('--plan', 'missing.md', '--check').status, 1);
    assert.equal(run('--host', '0.0.0.0').status, 1);
    assert.equal(run('--port', '-1').status, 1);
    await writeFile(join(root, 'PLAN.md'), plan + '\n## Nested checklist\n- [x] Internal subtask\n');
    const tables = run('--plan', 'PLAN.md', '--tasks', 'tables', '--check');
    assert.equal(tables.status, 0, tables.stderr);
    assert.equal(JSON.parse(tables.stdout).items.length, 1);
    const checklists = run('--plan', 'PLAN.md', '--tasks', 'checklists', '--check');
    assert.equal(checklists.status, 0, checklists.stderr);
    assert.equal(JSON.parse(checklists.stdout).items.length, 1);
    assert.equal(run('--tasks', 'guess', '--check').status, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a nonregular Markdown source cannot block healthy sources', { skip: process.platform === 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'visualize-my-task-fifo-'));
  try {
    await writeFile(join(root, 'PLAN.md'), plan);
    assert.equal(spawnSync('mkfifo', [join(root, 'PIPE.md')]).status, 0);
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./board.mjs', import.meta.url)), '--root', root, '--plan', 'PIPE.md', '--plan', 'PLAN.md', '--check'], { encoding: 'utf8', timeout: 1500 });
    assert.equal(result.error, undefined, 'Nonregular source blocked the snapshot');
    assert.equal(result.status, 1);
    const snapshot = JSON.parse(result.stdout);
    assert.equal(snapshot.sources[0].state, 'error');
    assert.equal(snapshot.sources[1].state, 'live');
    assert.equal(snapshot.items.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('CLI works through a linked skill installation without starting on import', async () => {
  const root = await mkdtemp(join(tmpdir(), 'visualize-my-task-linked-'));
  try {
    await writeFile(join(root, 'PLAN.md'), plan);
    const linkedSkill = join(root, 'linked-skill');
    await symlink(fileURLToPath(new URL('..', import.meta.url)), linkedSkill, process.platform === 'win32' ? 'junction' : 'dir');
    const path = join(linkedSkill, 'scripts/board.mjs');
    const result = spawnSync(process.execPath, [path, '--root', root, '--plan', 'PLAN.md', '--check'], { encoding: 'utf8', timeout: 2000 });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.trim(), 'Linked skill CLI must print its snapshot');
    assert.equal(JSON.parse(result.stdout).items.length, 1);
    const imported = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(new URL('./board.mjs', import.meta.url).href)}); console.log('imported')`], { encoding: 'utf8', timeout: 2000 });
    assert.equal(imported.status, 0, imported.stderr);
    assert.equal(imported.stdout.trim(), 'imported');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
