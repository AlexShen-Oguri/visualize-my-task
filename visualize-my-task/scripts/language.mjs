// Only UI language is inferred. Source labels, statuses and document text stay intact.
export function normalizeLanguage(value) {
  if (typeof value !== 'string') return null;
  const locale = value.trim().toLowerCase().replaceAll('_', '-');
  return /^(?:zh|en)(?:-[a-z\d]{2,8})*$/.test(locale) ? locale.slice(0, 2) : null;
}

export function projectDeclaration(text, kind) {
  const supported = value => typeof value === 'string' ? normalizeLanguage(value) ?? (/^(?:english|英语|英文)$/i.test(value.trim()) ? 'en' : /^(?:chinese|中文|汉语|简体中文|繁[体體]中文)$/i.test(value.trim()) ? 'zh' : null) : null;
  if (kind === 'package') {
    const data = JSON.parse(text);
    return supported(data?.i18n?.defaultLocale) ?? supported(data?.defaultLocale);
  }
  for (const line of visibleMarkdown(text).replaceAll('`', '').split('\n')) {
    const declaration = line.replace(/[*_]/g, '').match(/^\s*(?:#{1,6}\s+|[-*]\s+)?(?:primary language|project language|default locale|项目主语言|项目主要语言|主要语言|主语言|默认语言)\s*[:：]\s*(.*?)\s*$/i);
    if (declaration) {
      const language = supported(declaration[1].replace(/[。.]$/, ''));
      if (language) return language;
    }
  }
  return null;
}

function visibleMarkdown(text = '') {
  const visible = [];
  let fence;
  for (const line of String(text).replace(/<!--[^]*?(?:-->|$)/g, '').split('\n')) {
    const marker = line.match(/^[ \t]*(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence.character && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
    } else if (!/^(?: {4}|\t)/.test(line)) {
      if (marker) fence = { character: marker[1][0], length: marker[1].length };
      else visible.push(line);
    }
  }
  return visible.join('\n');
}

function prose(text) {
  return visibleMarkdown(text)
    .replace(/`+[^`]*`+/g, '')
    .replace(/!?\[([^\[\]\n]*)\]\([^()\[\]\n]*\)/g, '$1')
    .replace(/\S+/g, token => /[/\\_.]/.test(token) ? '' : token)
    .replace(/\b[a-zA-Z]*\d+[a-zA-Z\d-]*\b/g, '')
    .replace(/\b(?:[A-Z]{2,}|[a-z]+[A-Z][a-zA-Z]*)\b/g, '');
}

function evidence(texts) {
  const text = texts.map(text => prose(text)).join('\n');
  const chinese = (text.match(/\p{Script=Han}/gu) ?? []).length;
  const english = (text.match(/\b[a-zA-Z]{2,}\b/g) ?? []).length;
  if (!chinese && !english) return { present: false, language: null };
  // Chinese characters carry more meaning per unit than English words. Ignore
  // identifiers and code above so technical metadata cannot dominate task prose.
  const chineseWeight = chinese / 2;
  if (chineseWeight && english && Math.abs(chineseWeight - english) / Math.max(chineseWeight, english) < 0.2) return { present: true, language: null };
  return { present: true, language: chineseWeight > english ? 'zh' : 'en' };
}

export function resolveLanguage({ lang = 'auto', projectLanguage, items = [], specifications = [], history = [] } = {}) {
  const explicit = normalizeLanguage(lang);
  if (lang !== 'auto' && !explicit) throw new Error('--lang must be auto, zh, or en.');
  if (explicit) return { language: explicit, languageSource: 'explicit' };
  if (normalizeLanguage(projectLanguage)) return { language: normalizeLanguage(projectLanguage), languageSource: 'project' };
  const levels = [
    items.flatMap(item => [item.label, item.detail === '未记录' ? '' : item.detail]),
    specifications.map(entry => entry.text),
    history.map(entry => entry.text),
  ];
  for (const level of levels) {
    const found = evidence(level);
    if (found.present) return { language: found.language ?? 'zh', languageSource: found.language ? 'documents' : 'fallback' };
  }
  return { language: 'zh', languageSource: 'fallback' };
}

const messages = {
  SOURCE_NOT_FOUND: ['文件不存在；核对 --plan / --spec / --changelog / --relations 路径。', 'File not found; check the --plan / --spec / --changelog / --relations paths.'],
  SOURCE_PERMISSION: ['没有读取权限；检查源文件权限。', 'Permission denied; check source file permissions.'],
  SOURCE_NOT_FILE: ['来源必须是普通 Markdown 文件。', 'The source must be a regular Markdown file.'],
  SOURCE_TOO_LARGE: ['来源超过 2,000,000 字节上限。', 'The source exceeds the 2,000,000-byte limit.'],
  SOURCE_CHANGING: ['来源正在写入，下一轮自动重读。', 'The source is being written; it will be read again on the next refresh.'],
  SOURCE_ENCODING: ['来源不是有效的 UTF-8 文本；请使用 UTF-8 保存。', 'The source is not valid UTF-8 text; save it as UTF-8.'],
  SOURCE_RECORD_LIMIT: ['单个来源超过 2,000 条记录上限。', 'The source exceeds the 2,000-record limit.'],
  SOURCE_TASK_KIND: ['来源没有所选类型的任务；检查 --tasks 或源文件。', 'The source has no tasks of the selected type; check --tasks or the source file.'],
};
const parserMessages = [
  ['MARKDOWN_EMPTY_SPEC', /^Empty specification\.$/, '规格文档为空。'],
  ['MARKDOWN_EMPTY_HISTORY', /^Empty changelog\.$/, '变更日志为空。'],
  ['MARKDOWN_RELATION_FIELDS', /^Relation tables contain relationships only; task labels and status fields belong in the plan\.$/, '关系表只能包含关系；任务名称与状态字段应放在计划中。'],
  ['MARKDOWN_DUPLICATE_COLUMN', /^Duplicate semantic column: (.+)\.$/, field => `语义列重复：${field}。`],
  ['MARKDOWN_TABLE_SEPARATOR', /^Malformed task table separator\.$/, '任务表分隔行格式错误。'],
  ['MARKDOWN_TABLE_ROW', /^Malformed task table row: expected (\d+) cells, found (\d+)\.$/, (expected, actual) => `任务表行格式错误：需要 ${expected} 个单元格，实际为 ${actual} 个。`],
  ['MARKDOWN_EMPTY_TARGET', /^Relationship target ID is empty\.$/, '关系目标 ID 为空。'],
  ['MARKDOWN_EMPTY_LABEL', /^Task label is empty\.$/, '任务名称为空。'],
  ['MARKDOWN_NO_RELATIONS', /^No relationships recognized; use an ID and relationship table\.$/, '未识别到关系；请使用含有 ID 与关系字段的表格。'],
  ['MARKDOWN_NO_TASKS', /^No tasks recognized; use a task\/name table or Markdown checkboxes\.$/, '未识别到任务；请使用任务表或 Markdown 复选框。'],
];

export function sourceDiagnostic(failure, language = 'zh', stage = 'read') {
  const raw = failure?.message ?? String(failure);
  let errorCode = { ENOENT: 'SOURCE_NOT_FOUND', EACCES: 'SOURCE_PERMISSION', EPERM: 'SOURCE_PERMISSION', ERR_ENCODING_INVALID_ENCODED_DATA: 'SOURCE_ENCODING' }[failure?.code] ?? failure?.sourceCode;
  if (messages[errorCode]) return { errorCode, error: messages[errorCode][language === 'en' ? 1 : 0] };
  const location = raw.match(/^(.*): line (\d+): (.*)$/);
  if (location) {
    for (const [code, pattern, translated] of parserMessages) {
      const match = location[3].match(pattern);
      if (match) return { errorCode: code, error: language === 'en' ? raw : `${location[1]}: 第 ${location[2]} 行：${typeof translated === 'function' ? translated(...match.slice(1)) : translated}` };
    }
  }
  // Unknown diagnostics retain their original wording rather than guessing a translation.
  return { errorCode: stage === 'parse' ? 'MARKDOWN_PARSE_FAILED' : 'SOURCE_READ_FAILED', error: raw };
}

export function localizeWarning(warning, language) {
  if (language !== 'zh') return warning;
  const translations = {
    'Ambiguous indentation after a paragraph; continuation is ignored.': '段落后的缩进含义不明确；已忽略续行。',
    'Unclosed code fence; subsequent examples are ignored.': '代码围栏未闭合；已忽略后续示例。',
    'Unclosed HTML comment; subsequent content is ignored.': 'HTML 注释未闭合；已忽略后续内容。',
  };
  const found = warning.match(/^(.*):line (\d+): (.*)$/);
  return found && translations[found[3]] ? `${found[1]}:第 ${found[2]} 行：${translations[found[3]]}` : warning;
}
