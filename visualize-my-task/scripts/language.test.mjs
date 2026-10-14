import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { normalizeLanguage, projectDeclaration, resolveLanguage, sourceDiagnostic } from './language.mjs';

test('bounded hostile Markdown cannot exhaust the language parser event loop', () => {
  const source = `import { projectDeclaration, resolveLanguage } from ${JSON.stringify(new URL('./language.mjs', import.meta.url).href)};
    const cases = ['\\n'.repeat(130000) + 'ordinary prose', String.fromCharCode(96).repeat(130000), '~'.repeat(65000) + '\\n' + 'x'.repeat(65000), '['.repeat(130000), 'a-'.repeat(65000)];
    for (const text of cases) {
      if (projectDeclaration(text, 'readme') !== null) throw new Error('Invented a project declaration.');
      resolveLanguage({ specifications: [{ text }] });
    }
    console.log('completed');`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8', timeout: 2000 });
  assert.equal(result.error, undefined, 'All bounded hostile inputs must complete within two seconds.');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'completed');
});

test('supported locale normalization is strict and declarations ignore examples and unrelated prose', () => {
  assert.equal(normalizeLanguage('en-US'), 'en');
  assert.equal(normalizeLanguage('zh_Hant_TW'), 'zh');
  for (const value of ['fr', 'English', 'english-project', '', 123, null]) assert.equal(normalizeLanguage(value), null);
  assert.equal(projectDeclaration('{"i18n":{"defaultLocale":"en-GB"},"defaultLocale":"zh"}', 'package'), 'en');
  assert.equal(projectDeclaration('{"i18n":{"defaultLocale":"fr"},"defaultLocale":"zh-CN"}', 'package'), 'zh');
  assert.equal(projectDeclaration('{"language":"en"}', 'package'), null);
  assert.equal(projectDeclaration('**Primary language:** English', 'readme'), 'en');
  assert.equal(projectDeclaration('Primary language: `en-US`', 'readme'), 'en');
  assert.equal(projectDeclaration('## 项目主语言：中文', 'readme'), 'zh');
  assert.equal(projectDeclaration('```md\nPrimary language: en\n```\n<!-- Primary language: en -->\nThis README is written in English.', 'readme'), null);
  assert.equal(projectDeclaration('```md\nExample\n```still-open\nPrimary language: en\n```', 'readme'), null);
  assert.equal(projectDeclaration('````md\n```\nPrimary language: en\n````', 'readme'), null);
  assert.equal(projectDeclaration('```md\nExample\n````\nPrimary language: en', 'readme'), 'en');
});

test('document inference ignores IDs, generated missing fields, source names, status fields and code', () => {
  const technical = { id: 'IMPLEMENT_AUTH_SESSION_REFRESH', label: '修复用户会话', development: 'active', verification: 'passed', group: 'English headings', source: 'english-plan.md', detail: '未记录' };
  assert.deepEqual(resolveLanguage({ items: [technical] }), { language: 'zh', languageSource: 'documents' });
  assert.deepEqual(resolveLanguage({ items: [{ label: 'Add login', detail: '未记录' }] }), { language: 'en', languageSource: 'documents' });
  const codes = '```js\nconst refreshSession = await authenticateUser();\n```\n`SESSION_TOKEN` `refreshSession`';
  assert.deepEqual(resolveLanguage({ items: [{ label: '修复会话', detail: codes }] }), { language: 'zh', languageSource: 'documents' });
  assert.deepEqual(resolveLanguage({ items: [{ label: 'AUTH_SESSION_TOKEN', detail: '未记录' }], specifications: [{ text: '# Product\nImplement document synchronization.' }] }), { language: 'en', languageSource: 'documents' });
  assert.deepEqual(resolveLanguage({ items: [{ label: '登录 login' }], specifications: [{ text: 'English product requirements.' }] }), { language: 'zh', languageSource: 'fallback' });
  assert.deepEqual(resolveLanguage({ specifications: [{ text: '# Requirements\n```js\nconst login = authenticate();\n```' }] }), { language: 'en', languageSource: 'documents' });
  assert.deepEqual(resolveLanguage(), { language: 'zh', languageSource: 'fallback' });
});

test('file fault codes are stable and unknown diagnostic text is preserved', () => {
  const failures = [
    ['ENOENT', 'SOURCE_NOT_FOUND'], ['EACCES', 'SOURCE_PERMISSION'], ['EPERM', 'SOURCE_PERMISSION'],
    ['ERR_ENCODING_INVALID_ENCODED_DATA', 'SOURCE_ENCODING'],
  ];
  for (const [code, expected] of failures) {
    const fault = Object.assign(new Error('original detail'), { code });
    assert.equal(sourceDiagnostic(fault, 'en').errorCode, expected);
    assert.equal(sourceDiagnostic(fault, 'zh').errorCode, expected);
    assert.notEqual(sourceDiagnostic(fault, 'en').error, sourceDiagnostic(fault, 'zh').error);
  }
  for (const sourceCode of ['SOURCE_NOT_FILE', 'SOURCE_TOO_LARGE', 'SOURCE_CHANGING', 'SOURCE_RECORD_LIMIT', 'SOURCE_TASK_KIND']) {
    assert.equal(sourceDiagnostic({ sourceCode }, 'en').errorCode, sourceCode);
  }
  const unknown = new Error('custom.md: line 3: Custom diagnostic detail.');
  assert.deepEqual(sourceDiagnostic(unknown, 'zh', 'parse'), { errorCode: 'MARKDOWN_PARSE_FAILED', error: unknown.message });
  assert.deepEqual(sourceDiagnostic(unknown, 'en'), { errorCode: 'SOURCE_READ_FAILED', error: unknown.message });
});
