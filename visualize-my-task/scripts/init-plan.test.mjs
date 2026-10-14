import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { initializePlan } from './init-plan.mjs';
import { parseMarkdown } from './markdown.mjs';
import { buildMission } from '../assets/mission-model.mjs';

const run = promisify(execFile);
const script = fileURLToPath(new URL('./init-plan.mjs', import.meta.url));

async function project(t) {
  const root = await mkdtemp(join(tmpdir(), 'visualize-my-task-init-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('new projects get one lowercase plan with explicit initial scope and independent status dimensions', async (t) => {
  const root = await project(t);
  const result = await initializePlan({ root, title: '新项目', goal: '在本地整理阅读记录', tasks: ['建立记录表单', '保存本地记录'] });
  assert.equal(result.created, true);
  assert.equal(result.path, join(root, 'plan.md'));
  assert.deepEqual(await readdir(root), ['plan.md']);
  const text = await readFile(result.path, 'utf8');
  assert.match(text, /^# 新项目\n/);
  assert.match(text, /在本地整理阅读记录/);
  assert.match(text, /## 计划变更记录/);
  assert.match(text, /\d{4}-\d{2}-\d{2}.*P01.*P02.*初始/);
  const parsed = parseMarkdown(text, { source: 'plan.md' });
  assert.equal(parsed.history.length, 1);
  assert.equal(parsed.history[0].heading, '计划变更记录');
  assert.match(parsed.history[0].text, /P01.*P02.*初始/);
  assert.deepEqual(parsed.items.map(({ id, label }) => ({ id, label })), [
    { id: 'P01', label: '建立记录表单' }, { id: 'P02', label: '保存本地记录' },
  ]);
  assert.deepEqual(parsed.warnings, []);
  for (const item of parsed.items) {
    assert.equal(item.explicitId, true);
    assert.equal(item.route, 'main');
    assert.equal(item.origin, 'planned');
    assert.equal(item.workstream, 'development');
    assert.equal(Object.hasOwn(item, 'dependencies'), false);
    assert.deepEqual(item.states, { development: 'planned', verification: 'unknown', acceptance: 'unknown', delivery: 'unknown' });
  }
  const model = buildMission(parsed);
  assert.equal(model.currentKey, null);
  assert.equal(model.nextKind, 'sequence');
  assert.deepEqual(model.edges.map(({ kind }) => kind), ['sequence']);
  assert.equal(model.counts.done, 0);
});

test('existing conventional plans and mixed-case variants remain byte-for-byte unchanged', async (t) => {
  for (const name of ['plan.md', 'PLAN.md', 'Plan.Md', 'ACTIVE-PLAN.md', 'active-plan.MD', 'docs/PLAN.md', 'Docs/plan.Md', 'docs/private/ACTIVE-PLAN.md', 'Docs/Private/active-plan.md', 'docs/roadmap.md', 'RoadMap.MD']) {
    const root = await project(t);
    const path = join(root, name);
    await mkdir(dirname(path), { recursive: true });
    const bytes = Buffer.from('# 已有计划\r\n\r\n- [x] 保留原字节\r\n');
    await writeFile(path, bytes);
    const result = await initializePlan({ root, goal: '新目标', tasks: ['新任务'] });
    assert.equal(result.created, false, name);
    assert.equal(result.path, path, name);
    assert.deepEqual(await readFile(path), bytes, name);
    if (name.toLowerCase() !== 'plan.md') await assert.rejects(readFile(join(root, 'plan.md')), { code: 'ENOENT' });
  }
});

test('a second invocation preserves scope, states and change history', async (t) => {
  const root = await project(t);
  const first = await initializePlan({ root, goal: '已确认目标', tasks: ['已确认任务'] });
  const bytes = await readFile(first.path);
  const second = await initializePlan({ root, goal: '不同目标', tasks: ['不同任务'] });
  assert.equal(second.created, false);
  assert.deepEqual(await readFile(first.path), bytes);
});

test('plan directories and symlinks cannot be replaced or bypassed by a new authority', async (t) => {
  for (const kind of ['directory', 'symlink', 'dangling-symlink']) {
    const root = await project(t);
    const path = join(root, 'PLAN.md');
    if (kind === 'directory') await mkdir(path);
    else {
      if (kind === 'symlink') await writeFile(join(root, 'original.md'), 'existing plan');
      await symlink('original.md', path);
    }
    const result = await initializePlan({ root, goal: '目标', tasks: ['任务'] });
    assert.equal(result.created, false, kind);
    assert.equal(result.path, path, kind);
    if (kind === 'symlink') assert.equal(await readFile(path, 'utf8'), 'existing plan');
    assert.equal((await readdir(root)).includes('plan.md'), false);
  }
});

test('missing scope, invalid tasks and invalid roots cannot create a plan', async (t) => {
  const root = await project(t);
  for (const invalid of [
    { goal: '', tasks: ['任务'] }, { goal: '   ', tasks: ['任务'] }, { tasks: ['任务'] },
    { goal: '目标', tasks: [] }, { goal: '目标' }, { goal: '目标', tasks: [''] },
    { goal: '目标', tasks: ['任务', '  '] }, { goal: '目标', tasks: [42] },
    { goal: '目标', tasks: ['任务'], title: '' },
  ]) await assert.rejects(initializePlan({ root, ...invalid }));
  assert.deepEqual(await readdir(root), []);
  await assert.rejects(initializePlan({ root: join(root, 'missing'), goal: '目标', tasks: ['任务'] }));
  await writeFile(join(root, 'file'), 'not a root directory');
  await assert.rejects(initializePlan({ root: join(root, 'file'), goal: '目标', tasks: ['任务'] }));
});

test('Markdown-sensitive user text cannot inject table columns, completed tasks or hidden comments', async (t) => {
  const root = await project(t);
  const result = await initializePlan({
    root, title: '阅读 # 计划', goal: '支持 a|b 与 `code`\n- [x] 不应是额外任务',
    tasks: ['处理 a|b 与 `x`', '第一行\n- [x] 这是任务文本', '保留 <!-- text --> 与 [链接](https://example.invalid) 及 \\'],
  });
  const parsed = parseMarkdown(await readFile(result.path, 'utf8'), { source: 'plan.md' });
  assert.equal(parsed.items.length, 3);
  assert.deepEqual(parsed.warnings, []);
  assert.ok(parsed.items.every(({ states }) => states.development === 'planned'));
  assert.match(parsed.items[0].label, /a.*b.*x/);
  assert.match(parsed.items[1].label, /第一行.*这是任务文本/);
  assert.match(parsed.items[2].label, /text.*链接/);
});

test('the CLI creates and reports a portable plan, then refuses replacement', async (t) => {
  const root = join(await project(t), '中文 project');
  await mkdir(root);
  const args = [script, '--root', root, '--title', 'CLI 项目', '--goal', '创建本地记录', '--task', '定义字段', '--task', '输入记录'];
  const first = JSON.parse((await run(process.execPath, args)).stdout);
  assert.equal(first.created, true);
  assert.equal(first.path, join(root, 'plan.md'));
  assert.equal(parseMarkdown(await readFile(first.path, 'utf8')).items.length, 2);
  const before = await readFile(first.path);
  const again = JSON.parse((await run(process.execPath, args)).stdout);
  assert.equal(again.created, false);
  assert.deepEqual(await readFile(first.path), before);
  const invalidRoot = await project(t);
  await assert.rejects(run(process.execPath, [script, '--root', invalidRoot, '--goal', '缺少任务']), ({ stderr }) => /任务|task/i.test(stderr));
  assert.deepEqual(await readdir(invalidRoot), []);
});
