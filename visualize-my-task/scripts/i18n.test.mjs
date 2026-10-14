import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createTranslator, stateLabel, localeFor, bindStaticTranslations } from '../assets/i18n.mjs';
import { buildMission } from '../assets/mission-model.mjs';

test('UI copy localizes while interpolated project facts remain verbatim', () => {
  const t = createTranslator('en');
  assert.equal(t('前置依赖'), 'Prerequisites');
  assert.equal(createTranslator('zh')('CHAPTER'), '章节');
  assert.equal(t('已定位 {task}，{status}。', { task: '任务甲 / {status}', status: 'Current' }), 'Located 任务甲 / {status}. Current.');
  assert.equal(t('原始诊断：未知错误'), '原始诊断：未知错误');
  assert.equal(localeFor('en'), 'en-US');
  assert.equal(localeFor('zh'), 'zh-CN');
});

test('canonical state labels localize by dimension and unknown evidence survives', () => {
  assert.equal(stateLabel('en', 'development', 'done', '已完成'), 'Done');
  assert.equal(stateLabel('en', 'verification', 'partial', '部分验证'), 'Partially passed');
  assert.equal(stateLabel('en', 'acceptance', 'unaccepted', '验收失败'), 'Not accepted');
  assert.equal(stateLabel('en', 'delivery', 'partial', '部分已推送'), 'Partially delivered');
  assert.equal(stateLabel('en', 'verification', 'unknown', '人工核验：需补证据'), '人工核验：需补证据');
  assert.equal(stateLabel('en', 'delivery', 'unknown', '未记录'), 'Unrecorded');
  assert.equal(stateLabel('zh', 'delivery', 'delivered', '已推送'), '已推送');
});

test('locale changes generated warnings without changing graph or task facts', () => {
  const items = [
    { id: 'A', source: '中文计划.md', label: '原始任务名称', group: '原始分组', detail: '保持原文', dependencies: ['MISSING'], states: { development: 'active' } },
    { id: 'B', source: '中文计划.md', label: 'Original task name', dependencies: [], states: { development: 'planned' } },
  ];
  const plan = { items, warnings: ['原始未知诊断'], relations: [{ id: '404', source: 'relations.md', line: 5 }] };
  const zh = buildMission(plan), en = buildMission(plan, { language: 'en' });
  assert.deepEqual({ ...en, warnings: [] }, { ...zh, warnings: [] });
  assert.equal(en.nodes[0].label, '原始任务名称');
  assert.equal(en.warnings[0], '原始未知诊断');
  assert.match(en.warnings.join('\n'), /relation target 404/);
  assert.match(en.warnings.join('\n'), /prerequisite MISSING/);
  assert.match(zh.warnings.join('\n'), /依赖/);
  assert.equal(plan.items[0].dependencies[0], 'MISSING');
});

test('static translation does not traverse task content added after initial binding', () => {
  const text = { textContent: '  前置依赖  ', parentElement: { closest: () => null } };
  const attrs = { 'aria-label': '地图导航' };
  const button = { getAttribute: key => attrs[key], setAttribute: (key, value) => { attrs[key] = value; } };
  let index = 0;
  const document = { body: {}, documentElement: {}, createTreeWalker: () => ({ nextNode: () => index++ === 0 ? text : null }), querySelectorAll: () => [button] };
  const localize = bindStaticTranslations(document);
  localize('en');
  assert.equal(text.textContent, '  Prerequisites  ');
  assert.equal(attrs['aria-label'], 'Map navigation');
  assert.equal(document.documentElement.lang, 'en-US');
  localize('zh');
  assert.equal(text.textContent, '  前置依赖  ');
});

test('every explicit translated UI string has an English entry and inline JavaScript parses', async () => {
  const html = await readFile(new URL('../assets/index.html', import.meta.url), 'utf8');
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(script.replace(/^\s*import .*;$/gm, '')));
  assert.match(html, /data-language="__BOARD_LANGUAGE__"/);
  const t = createTranslator('en');
  for (const [, message] of script.matchAll(/\bt\('([^']*)'/g)) {
    assert.doesNotMatch(t(message), /\p{Script=Han}/u, `Missing translation: ${message}`);
  }
});
