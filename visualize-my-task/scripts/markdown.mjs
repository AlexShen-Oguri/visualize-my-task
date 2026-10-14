const missing = '未记录';
const aliases = {
  id: ['编号', 'id', '轮次', '事项'],
  label: ['任务', 'task', 'feature', '功能', '功能/需求', 'name', '标题'],
  development: ['开发状态', 'status', 'state', 'development'],
  verification: ['自动验证', '验证', 'tests', 'verification'],
  acceptance: ['用户验收', '验收', 'acceptance'],
  delivery: ['private交付', '交付', 'delivery'],
  detail: ['本轮要点', '详情', 'detail', 'notes'],
  dependencies: ['依赖', '前置任务', 'depends on', 'dependencies'],
  taskSource: ['任务来源', 'source'],
  route: ['路线', 'route'],
  origin: ['计划来源', 'origin'],
  workstream: ['工作类型', 'workstream'],
  after: ['接在任务后', 'after'],
  before: ['汇入任务前', 'before'],
  scope: ['适用版本', 'scope'],
  evidence: ['关系依据', 'evidence'],
};
const columns = new Map(Object.entries(aliases).flatMap(([field, labels]) => labels.map((label) => [label.toLowerCase().replace(/\s+/g, ''), field])));
const statusLabels = {
  development: {
    blocked: ['阻塞', '阻塞中', '已阻塞', '受阻', 'blocked'],
    planned: ['未开始', '待开发', '待办', '计划中', '计划', 'not started', 'planned', 'todo', 'to do', 'pending'],
    active: ['开发中', '进行中', '调查中', '实施中', 'in progress', 'in-progress', 'active', 'developing', 'investigating', 'doing'],
    done: ['已完成', '完成', 'done', 'completed', 'complete', 'finished', 'implemented'],
  },
  verification: {
    failed: ['未通过', '验证失败', '失败', 'not passed', 'failed', 'fail'],
    partial: ['部分通过', '部分验证', 'partially passed', 'partial pass', 'partial'],
    passed: ['已通过', '通过', 'passed', 'pass', 'verified'],
  },
  acceptance: {
    unaccepted: ['未验收', '未接受', '验收失败', 'not accepted', 'unaccepted', 'rejected'],
    pending: ['待验收', '等待验收', 'awaiting acceptance', 'pending acceptance', 'pending'],
    accepted: ['已验收', '已接受', 'accepted', 'approved'],
  },
  delivery: {
    undelivered: ['未提交', '未推送', '未交付', 'not delivered', 'not pushed', 'not committed', 'undelivered'],
    partial: ['部分已推送', '部分已交付', '部分交付', 'partially delivered', 'partially pushed', 'partial'],
    delivered: ['已推送', '已交付', 'delivered', 'pushed'],
  },
};

const relationFields = ['taskSource', 'route', 'origin', 'workstream', 'after', 'before', 'scope', 'evidence'];
const relationLabels = {
  route: { '主线': 'main', '支线': 'branch', '分组': 'grouped' },
  origin: { '原计划': 'planned', '追加': 'added', '后加': 'added' },
  workstream: { '功能开发': 'development', '安全审计': 'security', '发布交付': 'release' },
};
function relationship(values) {
  const result = {};
  for (const field of relationFields) {
    const value = values[field]?.trim();
    if (value && !/^(?:—|none)$/i.test(value)) result[field] = relationLabels[field]?.[value] ?? value;
  }
  if (Object.hasOwn(values, 'dependencies')) {
    result.dependencies = /^(?:|—|none)$/i.test(values.dependencies.trim()) ? [] : [...new Set(values.dependencies.split(/[,，;；、\s]+/).map(id => id.replace(/^`+|`+$/g, '')).filter(Boolean))];
  }
  return result;
}

function state(field, raw) {
  const value = raw.trim().toLowerCase();
  for (const [result, labels] of Object.entries(statusLabels[field])) {
    for (const label of labels) {
      if (value === label) return result;
      // A date or commit after an explicit status is metadata, not prose to interpret.
      if (value.startsWith(`${label} `) && /^(?:\d{4}-\d{2}-\d{2}|[a-f\d]{3,40})(?:\s*[（(][^）)]*[）)])?$/.test(value.slice(label.length + 1))) return result;
    }
  }
  return 'unknown';
}

function width(text) {
  let columns = 0;
  for (const character of text) columns += character === '\t' ? 4 - columns % 4 : 1;
  return columns;
}

function layout(text, base = 0) {
  const leading = text.match(/^[ \t]*/)[0];
  return ' '.repeat(Math.max(0, width(leading) - base)) + text.slice(leading.length);
}

function comments(text, active, number) {
  let visible = '';
  let code = 0;
  const backticks = backtickPositions(text);
  for (let index = 0; index < text.length; index += 1) {
    if (active) {
      const end = text.indexOf('-->', index);
      if (end < 0) return { text: visible, active };
      visible += ' ';
      index = end + 2;
      active = undefined;
    } else if (text[index] === '\\' && !code && index + 1 < text.length) {
      visible += text[index] + text[++index];
    } else if (text[index] === '`') {
      let end = index;
      while (text[end] === '`') end += 1;
      const length = end - index;
      if (code === length) code = 0;
      else if (!code && (backticks.get(length) ?? -1) >= end) code = length;
      visible += text.slice(index, end);
      index = end - 1;
    } else if (!code && text.startsWith('<!--', index)) {
      active = { line: number };
      index -= 1;
    } else visible += text[index];
  }
  return { text: visible, active };
}

function scan(text) {
  let offset = 0;
  let fence;
  let comment;
  let codeIndent;
  let paragraph = false;
  let title;
  const lists = [];
  const warnings = [];
  const lines = text.split('\n').map((raw, index) => {
    const line = { text: raw.replace(/\r$/, ''), offset, number: index + 1, visible: true };
    offset += raw.length + 1;
    const indent = width(line.text.match(/^[ \t]*/)[0]);
    const blank = !line.text.trim();
    if (fence && fence.base > 0 && !blank && indent < fence.base) fence = undefined;
    if (fence) {
      line.visible = false;
      const closing = layout(line.text, fence.base).match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (closing && closing[1][0] === fence.character && closing[1].length >= fence.length && !closing[2].trim()) fence = undefined;
      return line;
    }
    if (comment) {
      comment = comments(line.text, comment, line.number).active;
      line.visible = false;
      paragraph = false;
      return line;
    }
    while (lists.length && !blank && indent < lists.at(-1)) lists.pop();
    let base = lists.at(-1) ?? 0;
    if (codeIndent !== undefined) {
      if (blank || indent >= codeIndent) {
        line.visible = false;
        return line;
      }
      codeIndent = undefined;
      paragraph = false;
    }
    if (blank) {
      paragraph = false;
      return line;
    }
    if (indent - base >= 4) {
      line.visible = false;
      if (paragraph) warnings.push(`line ${line.number}: Ambiguous indentation after a paragraph; continuation is ignored.`);
      else codeIndent = base + 4;
      paragraph = false;
      return line;
    }
    let logical = layout(line.text, base);
    const list = line.text.match(/^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)(.*)$/);
    if (list) {
      const markerEnd = width(list[1] + list[2]);
      const content = width(list[1] + list[2] + list[3]);
      base = content - markerEnd <= 4 ? content : markerEnd + 1;
      lists.push(base);
      if (content - markerEnd > 4) {
        codeIndent = base + 4;
        line.visible = false;
        paragraph = false;
        return line;
      }
      logical = list[4];
    }
    const marker = logical.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker && (marker[1][0] !== '`' || !marker[2].includes('`'))) {
      fence = { character: marker[1][0], length: marker[1].length, base, line: line.number };
      line.visible = false;
      paragraph = false;
      return line;
    }
    const cleaned = comments(line.text, undefined, line.number);
    line.text = cleaned.text;
    comment = cleaned.active;
    if (!line.text.trim()) {
      line.visible = false;
      paragraph = false;
      return line;
    }
    logical = list ? comments(list[4], undefined, line.number).text : layout(line.text, base);
    const heading = logical.match(/^ {0,3}(#{1,6})(?:[ \t]+(.*?)|[ \t]*)$/);
    if (heading) {
      line.heading = { level: heading[1].length, text: (heading[2] ?? '').replace(/[ \t]+#+[ \t]*$/, '').trim() };
      if (line.heading.level === 1 && title === undefined) title = line.heading.text;
    }
    paragraph = !heading && !/^ {0,3}(?:>|<|[-*_]{3,}\s*$)/.test(logical);
    return line;
  });
  if (fence) warnings.push(`line ${fence.line}: Unclosed code fence; subsequent examples are ignored.`);
  if (comment) warnings.push(`line ${comment.line}: Unclosed HTML comment; subsequent content is ignored.`);
  return { lines, title, warnings };
}

function backtickPositions(text) {
  const positions = new Map();
  for (const match of text.matchAll(/`+/g)) positions.set(match[0].length, match.index);
  return positions;
}

function cells(raw) {
  const text = raw.trim();
  const result = [];
  const delimiters = [];
  let cell = '';
  let code = 0;
  const backticks = backtickPositions(text);
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '\\' && !code && index + 1 < text.length) {
      cell += character + text[++index];
    } else if (character === '`') {
      let end = index;
      while (text[end] === '`') end += 1;
      const length = end - index;
      if (code === length) code = 0;
      else if (!code && (backticks.get(length) ?? -1) >= end) code = length;
      cell += text.slice(index, end);
      index = end - 1;
    } else if (character === '|' && !code) {
      result.push(cell.trim());
      cell = '';
      delimiters.push(index);
    } else cell += character;
  }
  result.push(cell.trim());
  if (delimiters[0] === 0) result.shift();
  if (delimiters.at(-1) === text.length - 1) result.pop();
  return { values: result, hasPipe: delimiters.length > 0 };
}

function isDivider(values) {
  return values.length > 0 && values.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function item(values, line, source, group, kind = 'table', groupGenerated = false) {
  const result = {
    id: values.id || String(line), label: values.label, group,
    development: values.development || missing, verification: values.verification || missing,
    acceptance: values.acceptance || missing, delivery: values.delivery || missing,
    detail: values.detail || missing, line, source, kind,
  };
  if (groupGenerated) result.groupGenerated = true;
  result.explicitId = Boolean(values.id);
  result.states = Object.fromEntries(Object.keys(statusLabels).map((field) => [field, state(field, result[field])]));
  Object.assign(result, relationship(values));
  if (Object.hasOwn(values, 'dependencies')) {
    result.dependenciesRaw = values.dependencies;
  }
  return result;
}

export function parseMarkdown(text, { source = 'PLAN.md', mode = 'plan' } = {}) {
  if (typeof text !== 'string') throw new TypeError('Markdown input must be a string.');
  if (typeof source !== 'string' || !source.trim()) throw new TypeError('Markdown source must be a nonempty string.');
  if (!['plan', 'changelog', 'spec', 'relations'].includes(mode)) throw new TypeError(`Unsupported Markdown mode: ${mode}`);
  const { lines, title, warnings } = scan(text);
  const board = { title: title ?? source.split(/[\\/]/).at(-1), items: [], history: [], warnings: warnings.map((warning) => `${source}:${warning}`) };
  if (mode === 'relations') board.relations = [];
  const fail = (line, message) => { throw new Error(`${source}: line ${line}: ${message}`); };

  if (mode === 'changelog' || mode === 'spec') {
    if (!text.trim()) fail(1, mode === 'spec' ? 'Empty specification.' : 'Empty changelog.');
    const records = mode === 'spec' ? 'specifications' : 'history';
    const headings = lines.filter((line) => line.heading?.level === 2);
    if (headings.length) {
      board[records] = headings.map((line, index) => ({
        heading: line.heading.text, text: text.slice(line.offset, headings[index + 1]?.offset ?? text.length), line: line.number, source,
      }));
      const preamble = text.slice(0, headings[0].offset);
      if (mode === 'spec' && preamble.split(/\r?\n/).some(line => line.trim() && !/^#\s+.*$/.test(line.trim()))) {
        board.specifications.unshift({ heading: board.title, text: preamble, line: 1, source });
      }
    } else board[records] = [{ heading: board.title, text, line: 1, source }];
    return board;
  }

  let group = '未分组', groupGenerated = true;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.visible) continue;
    if (line.heading) {
      if (mode === 'plan' && line.heading.level >= 2 && /^(?:计划变更记录|plan changes)$/i.test(line.heading.text)) {
        let end = index + 1;
        while (end < lines.length && !(lines[end].heading && lines[end].heading.level <= line.heading.level)) end += 1;
        board.history.push({ heading: line.heading.text, text: text.slice(line.offset, lines[end]?.offset ?? text.length), line: line.number, source });
        index = end - 1;
        continue;
      }
      group = line.heading.text;
      groupGenerated = false;
      continue;
    }
    const checkbox = line.text.match(/^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s+(\S.*?)\s*$/);
    if (checkbox && mode === 'plan') {
      board.items.push(item({ label: checkbox[2], development: checkbox[1].toLowerCase() === 'x' ? '已完成' : '未开始' }, line.number, source, group, 'checklist', groupGenerated));
      continue;
    }
    const header = cells(line.text);
    const fields = header.values.map((value) => columns.get(value.toLowerCase().replace(/\s+/g, '')));
    if (!fields.includes(mode === 'relations' ? 'id' : 'label') || (!header.hasPipe && !isDivider(cells(lines[index + 1]?.text ?? '').values))) continue;
    if (mode === 'relations' && fields.some(field => field === 'label' || Object.hasOwn(statusLabels, field))) fail(line.number, 'Relation tables contain relationships only; task labels and status fields belong in the plan.');
    const unique = new Set();
    for (const field of fields.filter(Boolean)) {
      if (unique.has(field)) fail(line.number, `Duplicate semantic column: ${field}.`);
      unique.add(field);
    }
    const divider = lines[index + 1];
    const dividerCells = cells(divider?.text ?? '').values;
    if (!divider?.visible || dividerCells.length !== fields.length || !isDivider(dividerCells)) fail(divider?.number ?? line.number + 1, 'Malformed task table separator.');
    index += 1;
    while (index + 1 < lines.length) {
      const row = lines[index + 1];
      if (!row.visible || !row.text.trim() || row.heading || /^\s*(?:(?:[-*+]|\d+[.)])\s+|>|<(?:[!/?]|[a-z][\w-]*(?:\s|\/?>)))/i.test(row.text)) break;
      const values = cells(row.text).values;
      if (values.length !== fields.length || isDivider(values)) fail(row.number, `Malformed task table row: expected ${fields.length} cells, found ${values.length}.`);
      const record = Object.fromEntries(fields.flatMap((field, position) => field ? [[field, values[position]]] : []));
      if (mode === 'relations') {
        if (!record.id) fail(row.number, 'Relationship target ID is empty.');
        board.relations.push({ id: record.id, ...relationship(record), source, line: row.number });
        index += 1;
        continue;
      }
      if (!record.label) fail(row.number, 'Task label is empty.');
      if (!record.route && header.values[fields.indexOf('id')]?.trim() === '轮次') record.route = 'main';
      const extra = fields.flatMap((field, position) => field ? [] : [`${header.values[position] || `Column ${position + 1}`}: ${values[position] || missing}`]);
      if (extra.length) record.detail = [record.detail, ...extra].filter(Boolean).join('\n');
      board.items.push(item(record, row.number, source, group, 'table', groupGenerated));
      index += 1;
    }
  }
  if (mode === 'relations' ? !board.relations.length : !board.items.length) fail(1, mode === 'relations' ? 'No relationships recognized; use an ID and relationship table.' : 'No tasks recognized; use a task/name table or Markdown checkboxes.');
  return board;
}
