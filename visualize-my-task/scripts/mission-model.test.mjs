import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMarkdown } from './markdown.mjs';

const model = () => import('../assets/mission-model.mjs');

test('sidecars cannot silently retarget generated line IDs after checklist edits', async () => {
  const { buildMission } = await model();
  const relation = { id: '3', workstream: 'security', source: 'BOARD.md', line: 4 };
  for (const text of ['# Plan\n\n- [ ] Audit', '# Plan\n\n- [ ] Build\n- [ ] Audit']) {
    const parsed = parseMarkdown(text);
    const result = buildMission({ ...parsed, relations: [relation] });
    assert.ok(result.nodes.every(node => node.workstream === 'development'));
    assert.match(result.warnings.join('\n'), /明确编号|稳定编号/);
  }
});

test('display-only line IDs do not collide with or shadow explicit prerequisite IDs', async () => {
  const { buildMission } = await model();
  const implicit = parseMarkdown('# Plan\n\n- [ ] Note').items[0];
  const result = buildMission({ items: [implicit, row('3', 'done', [], { explicitId: true }), row('NEXT', 'planned', ['3'], { explicitId: true })] });
  assert.deepEqual(result.nodes[2].dependencies, ['plan:3']);
  assert.equal(result.nextKey, 'plan:NEXT');
  assert.deepEqual(result.warnings, []);
});
function row(id, development = 'planned', dependencies = [], options = {}) {
  return { key: `plan:${id}`, id, label: id, source: 'PLAN.md', line: 1,
    development, verification: '未记录', acceptance: '未记录', delivery: '未记录',
    states: { development, verification: 'unknown', acceptance: 'unknown', delivery: 'unknown' },
    dependencies, ...options };
}

test('dependency branches set longest depth and select the next task after current', async () => {
  const { buildMission } = await model();
  const items = [row('A', 'done'), row('C', 'planned', ['B', 'A']), row('B', 'active', ['A']), row('D', 'planned'), row('E', 'planned', ['C'])];
  const result = buildMission({ items });
  assert.equal(result.currentKey, 'plan:B');
  assert.equal(result.nextKey, 'plan:C');
  assert.deepEqual(result.nodes.map(({ status, column, order, isCurrent, isNext }) => [status, column, order, isCurrent, isNext]), [
    ['done', 0, 0, false, false], ['next', 2, 1, false, true], ['current', 1, 2, true, false], ['available', 0, 3, false, false], ['locked', 3, 4, false, false],
  ]);
  assert.deepEqual(result.nodes[1].dependencies, ['plan:B', 'plan:A']);
  assert.deepEqual(result.edges, [{ from: 'plan:B', to: 'plan:C', kind: 'dependency' }, { from: 'plan:A', to: 'plan:C', kind: 'dependency' }, { from: 'plan:A', to: 'plan:B', kind: 'dependency' }, { from: 'plan:C', to: 'plan:E', kind: 'dependency' }]);
  assert.deepEqual(result.counts, { total: 5, done: 1, active: 1, blocked: 0, pending: 0 });
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(items[1].dependencies, ['B', 'A']);
});

test('without active development, ready planned work is next and acceptance never becomes current', async () => {
  const { buildMission } = await model();
  const items = [row('A', 'done', [], { states: { development: 'done', verification: 'passed', acceptance: 'pending', delivery: 'partial' } }), row('B', 'planned', ['A']), row('C', 'planned')];
  const result = buildMission({ items });
  assert.equal(result.currentKey, null);
  assert.equal(result.nextKey, 'plan:B');
  assert.equal(result.nodes[0].status, 'pending');
  assert.equal(result.nodes[0].states.acceptance, 'pending');
  assert.deepEqual(result.counts, { total: 3, done: 1, active: 0, blocked: 0, pending: 1 });
});

test('only fully eligible planned work is next; blocked, failed, and unknown work keep their evidence', async () => {
  const { buildMission } = await model();
  const items = [row('A', 'active'), row('B', 'planned', ['A', 'D']), row('C', 'blocked', ['A']), row('D', 'planned', [], { states: { development: 'planned', verification: 'failed', acceptance: 'unknown', delivery: 'unknown' } }), row('E', 'unknown'), row('F', 'planned')];
  const result = buildMission({ items });
  assert.equal(result.nextKey, 'plan:F');
  assert.deepEqual(result.nodes.map(({ status }) => status), ['current', 'locked', 'blocked', 'blocked', 'unknown', 'next']);
  assert.equal(result.counts.blocked, 2);
});

test('failed verification takes attention precedence over done and does not unlock its dependents', async () => {
  const { buildMission } = await model();
  const result = buildMission({ items: [row('A', 'done', [], { states: { development: 'done', verification: 'failed', acceptance: 'pending', delivery: 'delivered' } }), row('B', 'planned', ['A'])] });
  assert.equal(result.nodes[0].status, 'blocked');
  assert.equal(result.nodes[1].status, 'locked');
  assert.equal(result.nextKey, null);
  assert.deepEqual(result.counts, { total: 2, done: 1, active: 0, blocked: 1, pending: 1 });
});

test('multiple active rows remain current while primary follows document order despite inconsistent prerequisites', async () => {
  const { buildMission } = await model();
  const result = buildMission({ items: [row('B', 'active', ['Z']), row('C', 'active'), row('D', 'planned', ['B'])] });
  assert.equal(result.currentKey, 'plan:B');
  assert.deepEqual(result.nodes.map(({ isCurrent }) => isCurrent), [true, true, false]);
  assert.deepEqual(result.nodes.slice(0, 2).map(({ status }) => status), ['current', 'current']);
  assert.equal(result.nextKey, null);
  assert.match(result.warnings.join('\n'), /Z/);
  assert.match(result.warnings.join('\n'), /进行中.*依赖|依赖.*进行中/);
});

test('unstructured sources stay grouped instead of inventing a document-order workflow', async () => {
  const { buildMission } = await model();
  const first = parseMarkdown('ID | Task | Status\n--- | --- | ---\nA | First | done\nB | Second | active\nC | Third | planned', { source: 'OLD.md' });
  const result = buildMission(first);
  assert.deepEqual(result.edges, []);
  assert.equal(result.nextKey, null);
  assert.equal(result.nextKind, null);
  assert.equal(result.planningMode, 'grouped');
  assert.equal(result.nodes[2].status, 'unknown');
  assert.equal(result.nodes[2].dependencyMode, 'unspecified');
});

test('mixed explicit tables and checklists never fabricate prerequisites for unspecified rows', async () => {
  const { buildMission } = await model();
  const board = parseMarkdown('Task | Status | Dependencies\n--- | --- | ---\nFirst | done | none\n\n- [ ] Checklist');
  const result = buildMission(board);
  assert.deepEqual(result.edges, []);
  assert.equal(result.nodes[1].dependencyMode, 'unspecified');
  assert.equal(result.nextKey, null);
  assert.equal(result.nodes[1].status, 'unknown');
});

test('same-source IDs resolve before cross-source IDs, ambiguous and missing references stay unresolved', async () => {
  const { buildMission } = await model();
  const items = [row('A', 'done'), row('A', 'done', [], { key: 'other:A', source: 'OTHER.md' }), row('B', 'planned', ['A']), row('C', 'planned', ['A', 'MISSING'], { key: 'third:C', source: 'THIRD.md' })];
  const result = buildMission({ items });
  assert.deepEqual(result.nodes[2].dependencies, ['plan:A']);
  assert.deepEqual(result.nodes[3].dependencies, []);
  assert.deepEqual(result.nodes[3].missingDependencies, ['A', 'MISSING']);
  assert.equal(result.nextKey, 'plan:B');
  assert.match(result.warnings.join('\n'), /歧义.*A|A.*歧义/);
  assert.match(result.warnings.join('\n'), /MISSING/);
});

test('duplicate IDs within a source never resolve to an arbitrary task', async () => {
  const { buildMission } = await model();
  const result = buildMission({ items: [row('A', 'done'), row('A', 'done', [], { key: 'plan:A2' }), row('B', 'planned', ['A'])] });
  assert.deepEqual(result.edges, []);
  assert.deepEqual(result.nodes[2].missingDependencies, ['A']);
  assert.equal(result.nextKey, null);
  assert.match(result.warnings.join('\n'), /重复.*A|A.*重复/);
});

test('cycles and their descendants stay locked while unrelated ready work remains selectable', async () => {
  const { buildMission } = await model();
  const result = buildMission({ items: [row('A', 'planned', ['B']), row('B', 'planned', ['A']), row('C', 'planned', ['B']), row('D', 'planned')] });
  assert.equal(result.nextKey, 'plan:D');
  assert.deepEqual(result.nodes.map(({ status }) => status), ['locked', 'locked', 'locked', 'next']);
  assert.match(result.warnings.join('\n'), /循环/);
  assert.ok(result.nodes.every(({ column }) => Number.isFinite(column)));
  assert.equal(result.edges.length, 3);
});

test('long dependency chains do not rely on recursive graph traversal', async () => {
  const { buildMission } = await model();
  const items = Array.from({ length: 12000 }, (_, index) => row(String(index), index ? 'planned' : 'active', index ? [String(index - 1)] : []));
  const result = buildMission({ items });
  assert.equal(result.nodes.at(-1).column, 11999);
  assert.equal(result.nextKey, 'plan:1');
  assert.equal(result.edges.length, 11999);
});

test('history-only and empty plans have no invented mission and retain input warnings', async () => {
  const { buildMission } = await model();
  assert.deepEqual(buildMission({ items: [], history: [{ text: '- [x] Old work' }], warnings: ['source warning'] }), { nodes: [], edges: [], currentKey: null, nextKey: null, nextKind: null, planningMode: 'empty', visibleKeys: [], counts: { total: 0, done: 0, active: 0, blocked: 0, pending: 0 }, warnings: ['source warning'] });
});

function unspecified(id, development = 'planned', options = {}) {
  const item = row(id, development, [], options);
  delete item.dependencies;
  return item;
}

test('an added branch sits between main rounds without becoming a hard prerequisite', async () => {
  const { buildMission } = await model();
  const items = [unspecified('R1', 'done', { route: 'main' }), unspecified('R2', 'planned', { route: 'main' }), unspecified('R3', 'planned', { route: 'main' }), unspecified('M', 'active', { route: 'branch', origin: 'added', after: 'R1', before: 'R2' })];
  const original = structuredClone(items);
  const result = buildMission({ items });
  const [first, second, third, material] = result.nodes;
  assert.ok(first.column < material.column && material.column < second.column && second.column < third.column);
  assert.deepEqual(result.edges, [
    { from: 'plan:R1', to: 'plan:R2', kind: 'sequence' },
    { from: 'plan:R2', to: 'plan:R3', kind: 'sequence' },
    { from: 'plan:R1', to: 'plan:M', kind: 'attachment' },
    { from: 'plan:M', to: 'plan:R2', kind: 'attachment' },
  ]);
  assert.deepEqual(second.dependencies, []);
  assert.equal(material.afterKey, 'plan:R1');
  assert.equal(material.beforeKey, 'plan:R2');
  assert.equal(result.nextKey, 'plan:R2');
  assert.equal(result.nextKind, 'sequence');
  assert.equal(result.planningMode, 'route');
  assert.deepEqual(items, original);
});

test('only explicit blocking dependencies gate the next round across a visual branch', async () => {
  const { buildMission } = await model();
  const result = buildMission({ items: [row('R1', 'done', [], { route: 'main' }), row('R2', 'planned', ['M'], { route: 'main' }), row('M', 'active', ['R1'], { route: 'branch', after: 'R1', before: 'R2' })] });
  assert.equal(result.nextKey, 'plan:R2');
  assert.equal(result.nextKind, 'dependency');
  assert.deepEqual(result.nodes[1].dependencies, ['plan:M']);
  assert.equal(result.edges.filter(edge => edge.kind === 'dependency').length, 2);
});

test('main route sequences are isolated by source and workstream', async () => {
  const { buildMission } = await model();
  const result = buildMission({ items: [
    unspecified('D1', 'done', { route: 'main' }),
    unspecified('S1', 'planned', { route: 'main', workstream: 'security' }),
    unspecified('D2', 'planned', { route: 'main' }),
    unspecified('O1', 'planned', { route: 'main', source: 'OTHER.md' }),
    unspecified('S2', 'planned', { route: 'main', workstream: 'security' }),
  ] });
  assert.deepEqual(result.edges, [
    { from: 'plan:D1', to: 'plan:D2', kind: 'sequence' },
    { from: 'plan:S1', to: 'plan:S2', kind: 'sequence' },
  ]);
  assert.equal(result.nextKey, 'plan:S1');
  assert.equal(result.nextKind, 'sequence');
});

test('relation overlays attach existing tasks with provenance and cannot overwrite task facts', async () => {
  const { buildMission } = await model();
  const plan = { items: [unspecified('R1', 'done', { route: 'main' }), unspecified('R2', 'planned', { route: 'main' }), unspecified('M', 'planned')], relations: [{ id: 'M', taskSource: 'PLAN.md', route: 'branch', origin: 'added', after: 'R1', before: 'R2', dependencies: ['R1'], scope: 'abc123', evidence: 'Recorded before round two', source: 'BOARD-RELATIONS.md', line: 5, stale: true, states: { development: 'done' }, key: 'wrong', label: 'wrong', status: 'done' }] };
  const original = structuredClone(plan);
  const result = buildMission(plan);
  const material = result.nodes[2];
  assert.equal(material.route, 'branch');
  assert.equal(material.origin, 'added');
  assert.equal(material.status, 'next');
  assert.equal(material.states.development, 'planned');
  assert.equal(material.label, 'M');
  assert.equal(material.key, 'plan:M');
  assert.equal(material.scope, 'abc123');
  assert.equal(material.evidence, 'Recorded before round two');
  assert.deepEqual(material.dependencies, ['plan:R1']);
  assert.equal(material.relationSource, 'BOARD-RELATIONS.md');
  assert.equal(material.relationLine, 5);
  assert.equal(material.relationStale, true);
  assert.deepEqual(plan, original);
});

test('ambiguous overlay targets and missing attachment references warn without blocking valid hard work', async () => {
  const { buildMission } = await model();
  const result = buildMission({ items: [row('A', 'done'), row('A', 'done', [], { key: 'other:A', source: 'OTHER.md' }), row('B', 'planned', ['A'], { after: 'MISSING' })], relations: [{ id: 'A', route: 'branch', source: 'RELATIONS.md', line: 3 }, { id: 'NOT-A-TASK', route: 'main', source: 'RELATIONS.md', line: 4 }] });
  assert.equal(result.nodes[0].route, 'grouped');
  assert.equal(result.nodes[1].route, 'grouped');
  assert.equal(result.nextKey, 'plan:B');
  assert.equal(result.nextKind, 'dependency');
  assert.match(result.warnings.join('\n'), /RELATIONS\.md.*A.*歧义/);
  assert.match(result.warnings.join('\n'), /NOT-A-TASK/);
  assert.match(result.warnings.join('\n'), /MISSING/);
  assert.deepEqual(result.nodes[2].dependencies, ['plan:A']);
});

test('layout cycles warn while independent hard prerequisites remain usable', async () => {
  const { buildMission } = await model();
  const result = buildMission({ items: [row('A', 'done', [], { route: 'main' }), row('B', 'planned', ['A'], { route: 'main' }), unspecified('M', 'planned', { route: 'branch', after: 'B', before: 'A' })] });
  assert.equal(result.nextKey, 'plan:B');
  assert.equal(result.nextKind, 'dependency');
  assert.match(result.warnings.join('\n'), /布局.*循环|循环.*布局/);
  assert.ok(result.nodes.every(node => Number.isFinite(node.column)));
});

test('unspecified grouped tasks never poison valid cross-workstream dependencies', async () => {
  const { buildMission } = await model();
  const result = buildMission({ items: [unspecified('IDEA'), row('AUDIT', 'done', [], { workstream: 'security' }), row('PUBLISH', 'planned', ['AUDIT'], { workstream: 'release' })] });
  assert.equal(result.nextKey, 'plan:PUBLISH');
  assert.equal(result.nextKind, 'dependency');
  assert.deepEqual(result.edges, [{ from: 'plan:AUDIT', to: 'plan:PUBLISH', kind: 'dependency' }]);
  assert.equal(result.nodes[0].workstream, 'development');
  assert.equal(result.nodes[0].origin, 'unspecified');
});

test('workstream pointers and counts are scoped while outside dependencies stay authoritative', async () => {
  const { buildMission } = await model();
  const plan = { items: [row('DEV', 'active'), row('AUDIT', 'active', [], { workstream: 'security' }), row('VERIFY', 'planned', ['AUDIT'], { workstream: 'security' }), row('PUBLISH', 'planned', ['DEV'], { workstream: 'release' })] };
  const security = buildMission(plan, { workstream: 'security' });
  assert.equal(security.nodes.length, 4);
  assert.deepEqual(security.visibleKeys, ['plan:AUDIT', 'plan:VERIFY']);
  assert.equal(security.currentKey, 'plan:AUDIT');
  assert.equal(security.nextKey, 'plan:VERIFY');
  assert.equal(security.nextKind, 'dependency');
  assert.deepEqual(security.counts, { total: 2, done: 0, active: 1, blocked: 0, pending: 0 });
  const release = buildMission(plan, { workstream: 'release' });
  assert.equal(release.currentKey, null);
  assert.equal(release.nextKey, null);
  assert.equal(release.nodes[3].status, 'locked');
  assert.equal(release.nodes.some(node => node.isNext), false);
});
