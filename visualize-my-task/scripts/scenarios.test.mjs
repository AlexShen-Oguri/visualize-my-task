import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readSnapshot } from './board.mjs';
import { buildMission } from '../assets/mission-model.mjs';

// Bundled synthetic cases are part of the skill, so the same tests run from a
// checkout, a linked installation, or an extracted distributable ZIP.
const skillRoot = fileURLToPath(new URL('../', import.meta.url));
const script = fileURLToPath(new URL('./board.mjs', import.meta.url));
const manifest = JSON.parse(await readFile(new URL('../examples/cases/manifest.json', import.meta.url), 'utf8'));
const entry = id => {
  const result = manifest.cases.find(item => item.id === id);
  assert.ok(result, `Missing scenario ${id}`);
  return result;
};
const load = (id, rootOverride) => {
  const scenario = entry(id);
  return readSnapshot({ root: resolve(skillRoot, rootOverride ?? scenario.root), ...scenario.sources });
};
const nodesById = model => new Map(model.nodes.map(node => [node.id, node]));
const idAt = (model, key) => model.nodes.find(node => node.key === key)?.id ?? null;
const updateStates = (snapshot, updates) => ({
  ...snapshot,
  items: snapshot.items.map(item => ({ ...item, states: { ...item.states, ...updates[item.id] } })),
});
const cli = (root, flags = []) => {
  const result = spawnSync(process.execPath, [script, '--root', root, ...flags, '--check'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};

test('bundled manifest supplies six synthetic project situations with honest current and next work', async () => {
  assert.equal(manifest.synthetic, true);
  assert.equal(manifest.cases.length, 6);
  assert.equal(manifest.cases.filter(item => item.kind === 'existing').length, 5);
  assert.equal(manifest.cases.filter(item => item.kind === 'new').length, 1);
  for (const scenario of manifest.cases) {
    const snapshot = await load(scenario.id);
    const model = buildMission(snapshot);
    assert.ok(snapshot.sources.every(source => source.state === 'live'), `${scenario.id}: a fixture source failed`);
    assert.equal(snapshot.items.length, scenario.expected.taskCount, scenario.id);
    assert.equal(snapshot.planningState, scenario.expected.planningState, scenario.id);
    assert.equal(idAt(model, model.currentKey), scenario.expected.currentId, scenario.id);
    assert.equal(idAt(model, model.nextKey), scenario.expected.nextId, scenario.id);
    assert.deepEqual(model.warnings, [], scenario.id);
    for (const item of snapshot.items) {
      assert.equal(item.explicitId, true, `${scenario.id}: explicit identity required`);
      assert.deepEqual(Object.keys(item.states).sort(), ['acceptance', 'delivery', 'development', 'verification']);
    }
  }
});

test('existing ordered project places both added branches between original rounds but only required work gates progress', async () => {
  const snapshot = await load('01-structured');
  const model = buildMission(snapshot);
  const nodes = nodesById(model);
  for (const id of ['ADD-MAT', 'ADD-EXPORT']) {
    const branch = nodes.get(id);
    assert.equal(branch.route, 'branch');
    assert.equal(branch.origin, 'added');
    assert.equal(branch.afterKey, nodes.get('R1').key);
    assert.equal(branch.beforeKey, nodes.get('R2').key);
    assert.ok(nodes.get('R1').column < branch.column && branch.column < nodes.get('R2').column);
    assert.ok(model.edges.some(edge => edge.kind === 'attachment' && edge.from === branch.key && edge.to === nodes.get('R2').key));
  }
  assert.deepEqual(nodes.get('R2').dependencyIds, ['R1', 'ADD-MAT']);
  assert.ok(!nodes.get('R2').dependencies.includes(nodes.get('ADD-EXPORT').key));
  assert.deepEqual(nodes.get('ADD-EXPORT').dependencyIds, []);
  assert.equal(nodes.get('R2').status, 'next', 'Next is conditional on the active required branch finishing');

  const interrupted = nodesById(buildMission(updateStates(snapshot, { 'ADD-MAT': { development: 'blocked' } })));
  assert.equal(interrupted.get('R2').status, 'locked', 'A blocked required branch prevents advancing to round two');

  const completed = buildMission(updateStates(snapshot, {
    'ADD-MAT': { development: 'done', verification: 'passed', acceptance: 'pending' },
    'ADD-EXPORT': { development: 'blocked' },
  }));
  assert.equal(idAt(completed, completed.nextKey), 'R2', 'Optional improvement never becomes an implied prerequisite');
  assert.equal(nodesById(completed).get('ADD-MAT').states.acceptance, 'pending', 'Automatic verification does not approve the branch');
  assert.deepEqual(completed.nodes.filter(node => node.route === 'main').map(node => node.id), ['R1', 'R2', 'R3']);
});

test('existing informal project leaves its capability catalog disconnected and follows only the selected near-term dependency', async () => {
  const snapshot = await load('02-adhoc');
  const model = buildMission(snapshot);
  const nodes = nodesById(model);
  const catalogKeys = new Set(['CAP-01', 'CAP-02', 'CAP-03'].map(id => nodes.get(id).key));
  assert.equal(model.planningMode, 'grouped');
  assert.ok(model.nodes.every(node => node.route === 'grouped'));
  assert.ok(model.edges.every(edge => !catalogKeys.has(edge.from) && !catalogKeys.has(edge.to)));
  for (const id of ['CAP-01', 'CAP-02', 'CAP-03']) assert.equal(nodes.get(id).dependencyMode, 'unspecified');
  assert.deepEqual(nodes.get('NOW-02').dependencyIds, ['NOW-01']);
  assert.equal(idAt(model, model.currentKey), 'NOW-01');
  assert.equal(idAt(model, model.nextKey), 'NOW-02');

  const nearTermDone = buildMission(updateStates(snapshot, {
    'NOW-01': { development: 'done', verification: 'passed' },
    'NOW-02': { development: 'done', verification: 'passed' },
  }));
  assert.equal(nearTermDone.nextKey, null, 'Finishing the small active list does not invent the next capability');
  assert.equal(nodesById(nearTermDone).get('CAP-02').states.development, 'planned', 'Completing a small fix does not complete its entire capability');
});

test('existing project without a plan discovers history only and creates neither tasks nor a plan file', async () => {
  const scenario = entry('03-no-plan');
  const root = resolve(skillRoot, scenario.root);
  const filesBefore = await readdir(root);
  const snapshot = cli(root);
  const model = buildMission(snapshot);
  assert.equal(snapshot.planningState, 'history-only');
  assert.equal(snapshot.history.length, 2);
  assert.deepEqual(snapshot.items, []);
  assert.deepEqual(snapshot.sources.map(source => [source.name, source.mode]), [['CHANGELOG.md', 'changelog']]);
  assert.equal(model.currentKey, null);
  assert.equal(model.nextKey, null);
  assert.equal(model.planningMode, 'empty');
  assert.deepEqual(await readdir(root), filesBefore, 'Opening must not create a planning draft');
  assert.ok(!filesBefore.some(name => /^plan\.md$/i.test(name)));
  const withoutHistory = await readSnapshot({ root });
  assert.equal(withoutHistory.planningState, 'no-plan');
  assert.deepEqual(withoutHistory.items, []);
  const noRecords = cli(resolve(skillRoot, entry('03-no-plan').emptyRoot));
  assert.equal(noRecords.planningState, 'no-plan');
  assert.deepEqual(noRecords.items, []);
  assert.deepEqual(noRecords.history, []);
});

test('existing project keeps version-scoped identities across workstreams and release honors security dependencies', async () => {
  const snapshot = await load('04-workstreams');
  const security = buildMission(snapshot, { workstream: 'security' });
  const release = buildMission(snapshot, { workstream: 'release' });
  const development = buildMission(snapshot, { workstream: 'development' });
  const securityNodes = nodesById(security);
  const releaseNodes = nodesById(release);
  assert.equal(idAt(security, security.currentKey), 'SEC-01');
  assert.equal(idAt(security, security.nextKey), 'SEC-02');
  assert.equal(release.currentKey, null);
  assert.equal(release.nextKey, null);
  assert.equal(releaseNodes.get('REL-01').status, 'locked');
  assert.deepEqual(releaseNodes.get('REL-01').dependencyIds, ['FEAT-01', 'SEC-02']);
  assert.equal(securityNodes.get('SEC-02').key, releaseNodes.get('SEC-02').key);
  assert.equal(development.visibleKeys.length, 1);
  assert.equal(security.visibleKeys.length, 2);
  assert.equal(release.visibleKeys.length, 1);
  for (const model of [security, release, development]) {
    assert.equal(model.nodes.length, 4, 'Filtering a view must retain global prerequisites');
    assert.ok(model.nodes.every(node => node.scope === 'v0.6.0-rc1'));
  }
  assert.match(snapshot.history[0].text, /v0\.5\.0/);
  assert.equal(securityNodes.get('SEC-02').states.development, 'planned', 'Old audit history does not approve this candidate');

  const checked = updateStates(snapshot, {
    'SEC-01': { development: 'done', verification: 'passed' },
    'SEC-02': { development: 'done', verification: 'passed', acceptance: 'pending' },
  });
  const unlocked = buildMission(checked, { workstream: 'release' });
  assert.equal(idAt(unlocked, unlocked.nextKey), 'REL-01');
  assert.equal(nodesById(unlocked).get('REL-01').states.acceptance, 'unknown', 'Audit completion does not approve a release');
  const failed = buildMission(updateStates(checked, { 'SEC-02': { verification: 'failed' } }), { workstream: 'release' });
  assert.equal(nodesById(failed).get('REL-01').status, 'locked', 'Failed verification keeps the release gate closed');
  assert.equal(failed.nextKey, null);
});

test('new project discovers lowercase plan.md and preserves original identities plus dated changes after an addition', async () => {
  const scenario = entry('05-new-project');
  const initial = await load(scenario.id, scenario.initialRoot);
  const updated = await load(scenario.id, scenario.updatedRoot);
  assert.equal(initial.items.length, 3);
  assert.equal(updated.items.length, 4, 'Dated history is not a duplicate task list');
  const originalKeys = new Map(initial.items.map(item => [item.id, item.key]));
  for (const item of updated.items.filter(item => item.id !== 'ADD-01')) assert.equal(item.key, originalKeys.get(item.id));
  assert.deepEqual(updated.items.map(item => item.id), ['P-01', 'P-02', 'P-03', 'ADD-01']);
  const history = updated.history.map(record => record.text).join('\n');
  for (const stamp of ['2026-10-14 09:00', '2026-10-14 10:00', '2026-10-14 10:30']) assert.ok(history.includes(stamp));
  assert.ok(updated.history.every(record => record.source === 'plan.md'));
  assert.match(history, /追加 ADD-01/);
  const discovered = cli(resolve(skillRoot, scenario.root));
  assert.deepEqual(discovered.sources.map(source => [source.name, source.mode]), [['plan.md', 'plan']]);
  assert.equal(discovered.items.length, 4);
  const initialModel = buildMission(initial);
  const updatedModel = buildMission(updated);
  const updatedNodes = nodesById(updatedModel);
  assert.equal(idAt(initialModel, initialModel.currentKey), 'P-01');
  assert.equal(idAt(initialModel, initialModel.nextKey), 'P-02');
  assert.equal(idAt(updatedModel, updatedModel.currentKey), 'P-02');
  assert.equal(idAt(updatedModel, updatedModel.nextKey), 'ADD-01');
  assert.equal(updatedNodes.get('ADD-01').afterKey, updatedNodes.get('P-02').key);
  assert.equal(updatedNodes.get('ADD-01').beforeKey, updatedNodes.get('P-03').key);
  assert.deepEqual(updatedNodes.get('P-03').dependencyIds, ['P-02', 'ADD-01']);
  assert.equal(updatedNodes.get('P-01').states.verification, 'passed');
  assert.equal(updatedNodes.get('P-01').states.acceptance, 'pending');
  assert.equal(updatedNodes.get('P-01').states.delivery, 'undelivered');
});

test('project-declared custom paths distinguish a task-bearing spec from reference requirements and history', async () => {
  const scenario = entry('06-source-layout');
  const root = resolve(skillRoot, scenario.root);
  const flags = [
    '--plan', scenario.sources.planPaths[0],
    '--spec', scenario.sources.specPaths[0],
    '--changelog', scenario.sources.changelogPaths[0],
  ];
  const snapshot = cli(root, flags);
  const model = buildMission(snapshot);
  assert.deepEqual(snapshot.sources.map(source => [source.name, source.mode]), [
    ['spec/implementation.md', 'plan'],
    ['notes/history.md', 'changelog'],
    ['design/requirements.md', 'spec'],
  ]);
  assert.deepEqual(snapshot.items.map(item => item.id), ['SRC-01', 'SRC-02', 'SRC-03']);
  assert.ok(snapshot.items.every(item => item.source === 'spec/implementation.md'));
  assert.ok(snapshot.specifications.length > 0);
  assert.deepEqual([...new Set(snapshot.specifications.map(record => record.source))], ['design/requirements.md']);
  assert.match(snapshot.specifications.map(record => record.text).join('\n'), /- \[x\] 标签检索应支持多个条件组合/);
  assert.equal(snapshot.history.length, 1);
  assert.equal(snapshot.history[0].source, 'notes/history.md');
  assert.equal(idAt(model, model.currentKey), 'SRC-02');
  assert.equal(idAt(model, model.nextKey), 'SRC-03');
  const implemented = nodesById(model).get('SRC-01');
  assert.equal(implemented.states.verification, 'passed');
  assert.equal(implemented.states.acceptance, 'pending', 'Checked reference criteria do not accept the implementation');
  assert.equal(implemented.states.delivery, 'undelivered');
  assert.deepEqual(model.warnings, []);
});

test('reference-only project opens explicitly selected custom specification without inventing tasks or plan.md', async () => {
  const scenario = entry('06-source-layout');
  const root = resolve(skillRoot, scenario.specOnlyRoot);
  const filesBefore = await readdir(root);
  const specification = scenario.specOnlySources.specPaths[0];
  const snapshot = cli(root, ['--spec', specification]);
  assert.equal(snapshot.planningState, 'spec-only');
  assert.deepEqual(snapshot.items, []);
  assert.deepEqual(snapshot.history, []);
  assert.deepEqual(snapshot.sources.map(source => [source.name, source.mode]), [[specification, 'spec']]);
  assert.ok(snapshot.specifications.length > 0);
  assert.deepEqual([...new Set(snapshot.specifications.map(record => record.source))], [specification]);
  const model = buildMission(snapshot);
  assert.equal(model.currentKey, null);
  assert.equal(model.nextKey, null);
  assert.deepEqual(await readdir(root), filesBefore);
  assert.ok(!filesBefore.some(name => /^plan\.md$/i.test(name)));
});

test('English project fixtures select document or declared language without translating task facts', async () => {
  const base = resolve(skillRoot, 'examples/cases/07-language');
  const english = await readSnapshot({ root: base, planPaths: ['PLAN.md'], specPaths: ['docs/product-spec.md'], changelogPaths: ['CHANGELOG.md'] });
  assert.equal(english.language, 'en');
  assert.equal(english.languageSource, 'documents');
  assert.equal(english.items.length, 3);
  const model = buildMission(english);
  assert.equal(idAt(model, model.currentKey), 'LANG-01');
  assert.equal(idAt(model, model.nextKey), 'LANG-02');
  const declared = await readSnapshot({ root: resolve(base, 'declared-english'), planPaths: ['PLAN.md'] });
  assert.equal(declared.language, 'en');
  assert.equal(declared.languageSource, 'project');
  assert.equal(declared.items.length, 2);
  assert.equal(declared.items[0].label, '建立笔记列表与标题筛选');
  const forced = await readSnapshot({ root: resolve(base, 'declared-english'), planPaths: ['PLAN.md'], lang: 'zh' });
  assert.equal(forced.language, 'zh');
  assert.equal(forced.languageSource, 'explicit');
  assert.deepEqual(forced.items, declared.items);
});
