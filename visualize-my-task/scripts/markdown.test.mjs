import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { parseMarkdown } from './markdown.mjs';

test('distinct unmatched backtick runs stay bounded in specifications and task tables', () => {
  const source = `import assert from 'node:assert/strict';
    import { parseMarkdown } from ${JSON.stringify(new URL('./markdown.mjs', import.meta.url).href)};
    const runs = Array.from({length: 1900}, (_, index) => String.fromCharCode(96).repeat(index + 1)).join('a');
    assert.equal(parseMarkdown('# Spec\\n' + runs, {mode: 'spec'}).specifications.length, 1);
    const result = parseMarkdown('| Task | Status |\\n| --- | --- |\\n| ' + runs + ' | planned |');
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].label, runs);
    assert.equal(result.items[0].states.development, 'planned');
    console.log('completed');`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {encoding: 'utf8', timeout: 2000});
  assert.equal(result.error, undefined, 'Bounded Markdown must complete without repeated suffix scans.');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'completed');
});

test('spec preamble keeps draft status and scope before the first section', () => {
  const text = '# Sharing spec\n\nStatus: Draft — not approved for implementation.\nScope: private preview only.\n\n## Requirements\n- [x] Criterion reviewed\n';
  const result = parseMarkdown(text, { source: 'design/spec.md', mode: 'spec' });
  assert.deepEqual(result.items, []);
  assert.equal(result.specifications[0].line, 1);
  assert.match(result.specifications.map(entry => entry.text).join('\n'), /Status: Draft/);
  assert.match(result.specifications.map(entry => entry.text).join('\n'), /private preview only/);
});

test('spec sections preserve requirements without promoting criteria or status tables to tasks', () => {
  const input = '# Product specification\n\n## Requirements\n- [x] Approved criterion\n\n| Task | Status | Tests | Acceptance | Delivery |\n| --- | --- | --- | --- | --- |\n| Login | done | passed | accepted | delivered |\n\n```\n## Example heading\n```\n\n## Constraints\nStore data locally.\n';
  const board = parseMarkdown(input, { mode: 'spec', source: 'design/product.md' });
  assert.deepEqual(board.items, []);
  assert.deepEqual(board.history, []);
  assert.equal(board.specifications.length, 2);
  assert.deepEqual(board.specifications.map(({ heading, line, source }) => ({ heading, line, source })), [
    { heading: 'Requirements', line: 3, source: 'design/product.md' },
    { heading: 'Constraints', line: 14, source: 'design/product.md' },
  ]);
  assert.equal(board.specifications[0].text, input.slice(input.indexOf('## Requirements'), input.indexOf('## Constraints')));
  assert.equal(board.specifications[1].text, '## Constraints\nStore data locally.\n');
});

test('prose-only specs retain the whole original document while empty specs fail', () => {
  const input = '# Search design\r\n\r\nSupport offline search.\r\n';
  const board = parseMarkdown(input, { mode: 'spec', source: 'architecture/search.markdown' });
  assert.deepEqual(board.items, []);
  assert.deepEqual(board.specifications, [{ heading: 'Search design', text: input, line: 1, source: 'architecture/search.markdown' }]);
  assert.throws(() => parseMarkdown(' \r\n', { mode: 'spec', source: 'empty-spec.md' }), /empty-spec\.md.*empty/i);
});

test('plan change records remain history, never duplicate tasks or imply acceptance', () => {
  const text = '# New project\n\n## Current work\n| ID | Task | Status |\n| --- | --- | --- |\n| P01 | Bookmark import | active |\n\n## 计划变更记录\n\n### 2026-10-14 · P01\n- [x] Initial import implementation\n| ID | Task | Status | Acceptance |\n| --- | --- | --- | --- |\n| OLD | Historical task snapshot | done | accepted |\n\n## Later selected work\n- [ ] Export';
  const result = parseMarkdown(text, { source: 'plan.md' });
  assert.deepEqual(result.items.map(task => task.label), ['Bookmark import', 'Export']);
  assert.ok(result.items.every(task => task.states.acceptance === 'unknown'));
  assert.equal(result.history.length, 1);
  assert.equal(result.history[0].source, 'plan.md');
  assert.equal(result.history[0].line, 8);
  assert.match(result.history[0].text, /Historical task snapshot/);
  assert.doesNotMatch(result.history[0].text, /Later selected work/);
  const english = parseMarkdown(text.replace('计划变更记录', 'Plan changes'));
  assert.equal(english.history.length, 1);
  assert.equal(english.items.length, 2);
});

test('round tables identify a main route without turning capability catalogs into a sequence', () => {
  const rounds = parseMarkdown('| 轮次 | 任务 |\n| --- | --- |\n| 1 | 第一轮 |\n| 2 | 第二轮 |');
  assert.deepEqual(rounds.items.map(item => item.route), ['main', 'main']);
  assert.ok(rounds.items.every(item => !Object.hasOwn(item, 'dependencies')));
  const catalog = parseMarkdown('| ID | Task |\n| --- | --- |\n| F01 | Search |\n| F02 | Notes |');
  assert.ok(catalog.items.every(item => !Object.hasOwn(item, 'route')));
});

test('relationship tables keep placement, hard prerequisites, source and evidence separate from task states', () => {
  const text = '# Relations\n\n| ID | 任务来源 | 路线 | 计划来源 | 工作类型 | 接在任务后 | 汇入任务前 | 前置任务 | 适用版本 | 关系依据 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| FIX | docs/PLAN.md | 支线 | 追加 | 功能开发 | 1 | 2 | 1 | v1 | docs/PLAN.md:8 |';
  const parsed = parseMarkdown(text, { mode: 'relations', source: 'BOARD.md' });
  assert.deepEqual(parsed.items, []);
  assert.equal(parsed.relations.length, 1);
  assert.deepEqual(parsed.relations[0], { id: 'FIX', taskSource: 'docs/PLAN.md', route: 'branch', origin: 'added', workstream: 'development', after: '1', before: '2', dependencies: ['1'], scope: 'v1', evidence: 'docs/PLAN.md:8', source: 'BOARD.md', line: 5 });
  assert.throws(() => parseMarkdown('| ID | Status |\n| --- | --- |\n| FIX | Done |', { mode: 'relations' }), /state|status|状态/i);
});

test('English plan tables retain source text, missing dimensions, title and location', () => {
  const board = parseMarkdown('# Release plan\n\n## Now\nTask | Status | Notes\n--- | --- | ---\nShip parser | in progress | Keep **original** notes\n| Ship parser | done | |', { source: 'work/PLAN.md' });
  assert.equal(board.title, 'Release plan');
  assert.equal(board.items.length, 2);
  assert.deepEqual(board.items[0], {
    id: '6', label: 'Ship parser', group: 'Now', development: 'in progress',
    verification: '未记录', acceptance: '未记录', delivery: '未记录',
    detail: 'Keep **original** notes', line: 6, source: 'work/PLAN.md', kind: 'table', explicitId: false,
    states: { development: 'active', verification: 'unknown', acceptance: 'unknown', delivery: 'unknown' },
  });
  assert.equal(board.items[1].label, 'Ship parser');
  assert.equal(board.items[1].line, 7);
  assert.equal(board.items[1].detail, '未记录');
  assert.deepEqual(board.history, []);
  assert.deepEqual(board.warnings, []);
});

test('Chinese 11-round and five-supporting tables have no hardcoded scope', () => {
  const tableHeader = '| 轮次 | 功能 / 需求 | 开发状态 | 自动验证 | 用户验收 | private交付 | 本轮要点 |\n| --- | --- | --- | --- | --- | --- | --- |';
  const plan = '# 当前排程\n\n## 功能日程\n' + tableHeader + '\n' +
    Array.from({ length: 11 }, (_, index) => `| ${index + 1} | 功能${index + 1} / REQ-${index + 1} | ${index < 2 ? '已完成' : '未开始'} | ${index < 2 ? '已通过' : '未验证'} | ${index === 0 ? '已验收 2026-10-12' : index === 1 ? '待验收' : '未验收'} | ${index === 0 ? '已推送 abc123' : '未提交'} | 保留来源版本 |`).join('\n') +
    '\n\n### 关联工作\n' + tableHeader.replace('轮次', '事项') + '\n' +
    ['model', 'images', 'topics', 'alignment', 'jank'].map((id, index) => `| ${id} | 关联${index + 1} | ${index === 4 ? '调查中' : '已完成'} | ${index === 4 ? '未验证' : '已通过'} | ${index < 2 ? '已验收' : index === 4 ? '未复现' : '待验收'} | ${index === 4 ? '部分已推送 abc123（关联修复）' : index < 2 ? '已推送 abc123' : '未提交'} | 原始要点 |`).join('\n');
  const board = parseMarkdown(plan);
  assert.equal(board.items.length, 16);
  assert.deepEqual(board.items.slice(0, 11).map(({ id }) => id), Array.from({ length: 11 }, (_, index) => String(index + 1)));
  assert.equal(board.items[0].states.acceptance, 'accepted');
  assert.equal(board.items[1].states.acceptance, 'pending');
  assert.equal(board.items[2].states.acceptance, 'unaccepted');
  assert.equal(board.items[15].group, '关联工作');
  assert.deepEqual(board.items[15].states, { development: 'active', verification: 'unknown', acceptance: 'unknown', delivery: 'partial' });
  assert.equal(board.items[15].delivery, '部分已推送 abc123（关联修复）');
  const extra = parseMarkdown(plan + '\n| extra | 第17项 | 阻塞 | 未通过 | 未验收 | 未交付 | 明确状态 |');
  assert.equal(extra.items.length, 17);
  assert.equal(extra.items[16].states.development, 'blocked');
});

test('checkboxes share their heading, preserve duplicate tasks and only assert development', () => {
  const board = parseMarkdown('## Checklist\n- [x] Same task\n* [ ] Same task\n+ [X] Another task\n1. [ ] Numbered task\n2) [x] Parenthesized task', { source: '/tmp/todo.md' });
  assert.equal(board.title, 'todo.md');
  assert.equal(board.items.length, 5);
  assert.deepEqual(board.items.map(({ development }) => development), ['已完成', '未开始', '已完成', '未开始', '已完成']);
  assert.deepEqual(board.items.map(({ group }) => group), Array(5).fill('Checklist'));
  for (const item of board.items) {
    assert.equal(item.kind, 'checklist');
    assert.equal(item.verification, '未记录');
    assert.equal(item.acceptance, '未记录');
    assert.equal(item.delivery, '未记录');
    assert.equal(item.states.acceptance, 'unknown');
  }
  assert.equal(new Set(board.items.map(({ line }) => line)).size, 5);
});

test('backtick and tilde fences exclude examples and fake headings', () => {
  const input = '# Real title\n\n```markdown\n# Fake title\nTask | Status\n--- | ---\nFake row | done\n- [x] Fake checkbox\n```\n\n~~~\n## Fake group\n+ [x] Another fake\n~~~\n\n## Real group\n- [ ] Real task';
  const board = parseMarkdown(input);
  assert.equal(board.title, 'Real title');
  assert.equal(board.items.length, 1);
  assert.equal(board.items[0].group, 'Real group');
  assert.equal(board.items[0].label, 'Real task');
});

test('HTML comments hide task rows, checkboxes and headings without changing locations', () => {
  const input = '# Real title\n<!--\n# Fake title\n## Fake group\nTask | Status\n--- | ---\nRemoved table row | done\n- [x] Removed checkbox\n-->\n\n## Real group\n- [ ] Real work';
  const board = parseMarkdown(input);
  assert.equal(board.title, 'Real title');
  assert.deepEqual(board.items.map(({ label }) => label), ['Real work']);
  assert.equal(board.items[0].group, 'Real group');
  assert.equal(board.items[0].line, 12);
  assert.equal(board.items[0].states.development, 'planned');
  assert.throws(() => parseMarkdown('<!--\n- [x] Removed feature\n-->'), /No tasks recognized/);
});

test('inline code, escaped comment openers and fenced comments remain literal', () => {
  const input = '- [ ] Use `<!--` literally\n- [ ] Use ``x`<!--`` literally\n- [ ] Use \\<!-- literally\n```\n<!--\n```\n- [x] Real work';
  const board = parseMarkdown(input);
  assert.deepEqual(board.items.map(({ label }) => label), ['Use `<!--` literally', 'Use ``x`<!--`` literally', 'Use \\<!-- literally', 'Real work']);
  assert.deepEqual(board.warnings, []);
  for (const fence of ['``` <!--', '~~~ <!--', '- ``` <!--']) {
    const fenced = parseMarkdown(`${fence}\n${fence.startsWith('-') ? '  ' : ''}- [x] Example\n${fence.startsWith('-') ? '  ' : ''}${fence.includes('~~~') ? '~~~' : '```'}\n- [ ] Real work`);
    assert.deepEqual(fenced.items.map(({ label }) => label), ['Real work']);
    assert.deepEqual(fenced.warnings, []);
  }
});

test('standalone indented code and tab-indented code cannot fabricate completion', () => {
  for (const prefix of ['    ', '\t', '        ']) {
    const input = `${prefix}- [x] Code example\n\n${prefix}Task | Status\n${prefix}--- | ---\n${prefix}Code table | done\n\n- [ ] Real work`;
    const board = parseMarkdown(input);
    assert.deepEqual(board.items.map(({ label }) => label), ['Real work']);
    assert.equal(board.items[0].states.development, 'planned');
    assert.deepEqual(board.warnings, []);
  }
});

test('nested checklists retain ordinary list parents, ordered items and blank-separated children', () => {
  const input = '- [ ] Parent\n    - [x] Child\n        + [ ] Grandchild\n    * [ ] Sibling\n\n- Ordinary parent\n\n    1. [x] Ordered child\n        2) [ ] Ordered grandchild';
  const board = parseMarkdown(input);
  assert.deepEqual(board.items.map(({ label }) => label), ['Parent', 'Child', 'Grandchild', 'Sibling', 'Ordered child', 'Ordered grandchild']);
  assert.deepEqual(board.items.map(({ states }) => states.development), ['planned', 'done', 'planned', 'planned', 'done', 'planned']);
  assert.deepEqual(board.warnings, []);
});

test('code inside a list and list-contained fences stay excluded', () => {
  for (const hidden of ['- [ ] Parent\n\n      - [x] Code example', '-     [x] Code example', '- [ ] Parent\n    ```\n    - [x] Code example\n    ```']) {
    const board = parseMarkdown(hidden + '\n\n- [ ] Real work');
    assert.equal(board.items.some(({ label }) => label === 'Code example'), false);
    assert.equal(board.items.at(-1).label, 'Real work');
    assert.equal(board.items.filter(({ states }) => states.development === 'done').length, 0);
  }
});

test('ambiguous indentation and unclosed comments warn rather than fabricate completed tasks', () => {
  const ambiguous = parseMarkdown('Paragraph continuation\n    - [x] Ambiguous continuation\n\n- [ ] Real work', { source: 'uncertain.md' });
  assert.deepEqual(ambiguous.items.map(({ label }) => label), ['Real work']);
  assert.match(ambiguous.warnings[0], /uncertain\.md.*line 2.*indent/i);
  const comment = parseMarkdown('- [ ] Real work\n<!--\n- [x] Hidden', { source: 'uncertain.md' });
  assert.deepEqual(comment.items.map(({ label }) => label), ['Real work']);
  assert.match(comment.warnings[0], /uncertain\.md.*line 2.*comment/i);
});

test('CRLF, escaped pipes and variable-length inline code do not split cells', () => {
  const input = '# Pipes\r\nName | State | Detail\r\n:--- | ---: | :---:\r\nUse `a|b` and ``x`|y`` | completed | Preserve a\\|b and `c|d`\r\n';
  const board = parseMarkdown(input);
  assert.equal(board.items.length, 1);
  assert.equal(board.items[0].label, 'Use `a|b` and ``x`|y``');
  assert.equal(board.items[0].detail, 'Preserve a\\|b and `c|d`');
  assert.equal(board.items[0].states.development, 'done');
});

test('negative and partial values never become positive facts in another dimension', () => {
  const input = '| ID | Feature | Development | Verification | Acceptance | Delivery |\n| --- | --- | --- | --- | --- | --- |\n| a | A | not completed | not passed | not accepted | not delivered |\n| b | B | blocked | partially passed | pending | partially delivered |\n| c | C | done | passed | accepted | delivered |\n| d | D | 部分完成 | 部分通过 | 未验收 | 部分已推送 abc |\n| e | E | Already done? no | tests passed in an earlier build | 自动通过不代表已验收 | 未提交 |';
  const board = parseMarkdown(input);
  assert.deepEqual(board.items[0].states, { development: 'unknown', verification: 'failed', acceptance: 'unaccepted', delivery: 'undelivered' });
  assert.deepEqual(board.items[1].states, { development: 'blocked', verification: 'partial', acceptance: 'pending', delivery: 'partial' });
  assert.deepEqual(board.items[2].states, { development: 'done', verification: 'passed', acceptance: 'accepted', delivery: 'delivered' });
  assert.equal(board.items[3].states.development, 'unknown');
  assert.equal(board.items[3].states.verification, 'partial');
  assert.equal(board.items[3].states.delivery, 'partial');
  assert.equal(board.items[4].states.development, 'unknown');
  assert.equal(board.items[4].states.verification, 'unknown');
  assert.equal(board.items[4].states.acceptance, 'unknown');
  assert.equal(board.items[4].development, 'Already done? no');
});

test('pending acceptance is explicit, incomplete development remains unknown', () => {
  const board = parseMarkdown('Task | Development | Acceptance\n--- | --- | ---\nOne | 未完成 | Pending acceptance\nTwo | not started | pending acceptance');
  assert.equal(board.items[0].states.development, 'unknown');
  assert.equal(board.items[1].states.development, 'planned');
  assert.deepEqual(board.items.map(({ states }) => states.acceptance), ['pending', 'pending']);
});

test('unrecognized table columns keep their labels and original values in detail', () => {
  const board = parseMarkdown('| Task | Notes | Owner | Estimate |\n| --- | --- | --- | --- |\n| One | Original **notes** | Ana | `2|3` days |\n| Two | | Jo | |');
  assert.equal(board.items[0].detail, 'Original **notes**\nOwner: Ana\nEstimate: `2|3` days');
  assert.equal(board.items[1].detail, 'Owner: Jo\nEstimate: 未记录');
  assert.deepEqual(board.items.map(({ kind }) => kind), ['table', 'table']);
});

test('all supported header aliases can be mixed, reordered and have empty cells', () => {
  const board = parseMarkdown('验收 | 标题 | 交付 | 编号 | 验证 | 开发状态 | 详情\n--- | --- | --- | --- | --- | --- | ---\n| | One | | task-1 | | | |');
  assert.equal(board.items[0].id, 'task-1');
  assert.equal(board.items[0].label, 'One');
  assert.equal(board.items[0].development, '未记录');
  assert.deepEqual(board.items[0].states, { development: 'unknown', verification: 'unknown', acceptance: 'unknown', delivery: 'unknown' });
  for (const label of ['任务', 'task', 'feature', '功能', '功能 / 需求', 'name', '标题']) {
    assert.equal(parseMarkdown(`${label} | tests\n--- | ---\nExample | passed`).items[0].states.verification, 'passed');
  }
});

test('dependency columns preserve references, independent rows, and original cells', () => {
  for (const header of ['依赖', '前置任务', 'Depends on', 'Dependencies']) {
    const board = parseMarkdown(`ID | Task | Status | ${header}\n--- | --- | --- | ---\n| A | Setup | done | |\nB | Build | planned | A, \`X-2\`；C、D\nC | Independent | planned | —\nD | Also independent | planned | NONE`);
    assert.deepEqual(board.items.map(({ dependencies }) => dependencies), [[], ['A', 'X-2', 'C', 'D'], [], []]);
    assert.equal(board.items[1].dependenciesRaw, 'A, `X-2`；C、D');
    assert.equal(board.items[1].detail, '未记录');
  }
});

test('absence of a dependency column stays distinguishable from independent tasks', () => {
  const board = parseMarkdown('Task | Status\n--- | ---\nOld table | done\n\n- [ ] Checklist');
  for (const item of board.items) assert.equal(Object.hasOwn(item, 'dependencies'), false);
  assert.throws(() => parseMarkdown('Task | 依赖 | Dependencies\n--- | --- | ---\nOne | A | A'), /Duplicate semantic column: dependencies/);
});

test('malformed recognized tables and duplicate semantic columns have line diagnostics', () => {
  const cases = [
    ['# Bad\nTask | Status\nnot a separator\nOne | done', 3],
    ['# Bad\nTask | Status\n--- | ---\nOne | done | extra', 4],
    ['# Bad\nTask | Status\n--- | ---\n | done', 4],
    ['# Bad\nTask | Status | State\n--- | --- | ---\nOne | done | done', 2],
    ['# Bad\nTask | Feature\n--- | ---\nOne | One', 2],
  ];
  for (const [input, line] of cases) {
    assert.throws(() => parseMarkdown(input, { source: 'broken.md' }), (error) => /broken\.md/.test(error.message) && new RegExp(`line ${line}\\b`, 'i').test(error.message));
  }
});

test('blockquote and HTML block boundaries end a table without accepting short rows', () => {
  for (const nextBlock of ['> Evidence follows the table.', '<div>Evidence follows the table.</div>', '<!-- Evidence follows the table. -->']) {
    const board = parseMarkdown(`Task | Status\n--- | ---\nOne | done\n${nextBlock}\n\n- [ ] Two`);
    assert.deepEqual(board.items.map(({ label }) => label), ['One', 'Two']);
  }
  assert.throws(() => parseMarkdown('Task | Status\n--- | ---\nOne | done\nBroken | done | extra'), /line 4.*expected 2 cells/i);
});

test('prose-only, fenced-only and empty plans fail instead of showing an empty board', () => {
  for (const text of ['', '# Plan\nThe team completed the work.', '```\n- [x] example\n```']) {
    assert.throws(() => parseMarkdown(text, { source: 'empty.md' }), /empty\.md.*(?:tasks|任务)/i);
  }
  assert.throws(() => parseMarkdown(null), /string/i);
  assert.throws(() => parseMarkdown('- [x] task', { mode: 'mystery' }), /mode/i);
});

test('changelog keeps section originals in history and never fabricates task or acceptance state', () => {
  const input = '# Changes\n\n## CHG-1 — Finished\n\nTests passed; user acceptance remains pending.\n- [x] Built a feature\n\n### Evidence\nOriginal details.\n\n```\n## Fake section\n```\n\n## CHG-2\n\n| Task | Status |\n| --- | --- |\n| Feature | done |\n';
  const board = parseMarkdown(input, { mode: 'changelog', source: 'CHANGELOG.md' });
  assert.equal(board.title, 'Changes');
  assert.deepEqual(board.items, []);
  assert.equal(board.history.length, 2);
  assert.equal(board.history[0].heading, 'CHG-1 — Finished');
  assert.equal(board.history[0].line, 3);
  assert.equal(board.history[0].source, 'CHANGELOG.md');
  assert.equal(board.history[0].text, input.slice(input.indexOf('## CHG-1'), input.indexOf('## CHG-2')));
  assert.equal(board.history[1].text, input.slice(input.indexOf('## CHG-2')));
  assert.deepEqual(board.warnings, []);
});

test('changelog with no level-two heading preserves one full raw entry, empty log fails', () => {
  const input = '# Log\r\n\r\nCompleted parser without a user acceptance claim.\r\n';
  const board = parseMarkdown(input, { mode: 'changelog', source: 'logs/changes.md' });
  assert.deepEqual(board.items, []);
  assert.deepEqual(board.history, [{ heading: 'Log', text: input, line: 1, source: 'logs/changes.md' }]);
  assert.throws(() => parseMarkdown(' \r\n', { mode: 'changelog', source: 'blank.md' }), /blank\.md.*(?:empty|空)/i);
});


test('generated fallback groups are distinct from an authored heading with the same text', () => {
  const fallback = parseMarkdown('- [ ] Search notes');
  const authored = parseMarkdown('## 未分组\n- [ ] Search notes');
  assert.equal(fallback.items[0].group, '未分组');
  assert.equal(authored.items[0].group, '未分组');
  assert.equal(fallback.items[0].groupGenerated, true);
  assert.notEqual(authored.items[0].groupGenerated, true);
});
