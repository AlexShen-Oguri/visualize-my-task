import { createTranslator } from './i18n.mjs';

// Pure shared model: placement edges describe the map; only dependencies gate work.
export function buildMission(plan, { workstream = 'all', language = 'zh' } = {}) {
  const t = createTranslator(language);
  const warnings = [...(plan.warnings ?? [])];
  const rows = (plan.items ?? []).map((row) => ({ ...row }));
  const relationFields = ['route', 'origin', 'workstream', 'after', 'before', 'dependencies', 'scope', 'evidence'];
  const overlays = new Map();
  for (const relation of plan.relations ?? []) {
    const matches = rows.filter((row) => row.explicitId !== false && String(row.id) === String(relation.id)
      && (relation.taskSource === undefined || (row.source ?? 'PLAN.md') === relation.taskSource));
    if (matches.length !== 1) {
      warnings.push(t('{source}:{line}: 关系目标 {id} {reason}，未应用。', { source: relation.source ?? t('任务关系'), line: relation.line ?? '?', id: relation.id, reason: t(matches.length ? '存在歧义' : '未找到具有明确编号的任务') }));
      continue;
    }
    if (!overlays.has(matches[0])) overlays.set(matches[0], []);
    overlays.get(matches[0]).push(relation);
  }
  for (const [row, relations] of overlays) {
    if (relations.length !== 1) {
      warnings.push(t('{source}: {id} 有重复关系记录，未应用。', { source: row.source ?? 'PLAN.md', id: row.id }));
      continue;
    }
    const relation = relations[0];
    for (const field of relationFields) if (Object.hasOwn(relation, field)) row[field] = relation[field];
    row.relationSource = relation.source;
    row.relationLine = relation.line;
    row.relationStale = Boolean(relation.stale);
  }

  const sources = new Map();
  const ids = new Map();
  const usedKeys = new Set();
  const unsafe = new Set();
  const nodes = rows.map((row, order) => {
    const source = row.source ?? 'PLAN.md';
    const id = String(row.id ?? order + 1);
    const base = row.key ?? `${source}:${row.line ?? order + 1}:${id}`;
    let key = base;
    let suffix = 2;
    while (usedKeys.has(key)) key = `${base}#${suffix++}`;
    if (key !== base) warnings.push(t('{source}: 任务键重复 {key}，已保留为独立节点。', { source, key: base }));
    usedKeys.add(key);
    const node = { ...row, key, id, source,
      route: ['main', 'branch', 'grouped'].includes(row.route) ? row.route : 'grouped',
      origin: ['planned', 'added'].includes(row.origin) ? row.origin : 'unspecified',
      workstream: typeof row.workstream === 'string' && row.workstream.trim() ? row.workstream.trim() : 'development',
      dependencies: [], missingDependencies: [],
      dependencyIds: [...new Set((Array.isArray(row.dependencies) ? row.dependencies : []).map(String))],
      dependencyMode: Object.hasOwn(row, 'dependencies') ? 'explicit' : 'unspecified',
      afterKey: null, beforeKey: null,
      status: 'unknown', column: 0, order, isCurrent: row.states?.development === 'active', isNext: false };
    if (Object.hasOwn(row, 'dependencies') && !Array.isArray(row.dependencies)) {
      unsafe.add(key);
      warnings.push(t('{source}:{line}: {id} 的依赖格式无效，暂不推断下一步。', { source, line: row.line ?? order + 1, id }));
    }
    if (!sources.has(source)) sources.set(source, new Map());
    const localIds = sources.get(source);
    if (!localIds.has(id)) localIds.set(id, []);
    localIds.get(id).push(node);
    if (!ids.has(id)) ids.set(id, []);
    ids.get(id).push(node);
    return node;
  });
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  const resolve = (node, reference) => {
    const local = (sources.get(node.source).get(String(reference)) ?? []).filter(row => row.explicitId !== false);
    return local.length ? local : (ids.get(String(reference)) ?? []).filter(row => row.explicitId !== false);
  };
  for (const [source, localIds] of sources) {
    for (const [id, candidates] of localIds) {
      const matches = candidates.filter(row => row.explicitId !== false);
      if (matches.length < 2) continue;
      warnings.push(t('{source}: 编号重复 {id}，相关依赖无法唯一确认。', { source, id }));
      for (const node of matches) unsafe.add(node.key);
    }
  }

  const edges = [];
  const edgeKeys = new Set();
  function addEdge(from, to, kind) {
    const key = JSON.stringify([from, to, kind]);
    if (!edgeKeys.has(key)) edges.push({ from, to, kind });
    edgeKeys.add(key);
  }
  for (const node of nodes) {
    for (const reference of node.dependencyIds) {
      const matches = resolve(node, reference);
      if (matches.length === 1) {
        node.dependencies.push(matches[0].key);
        addEdge(matches[0].key, node.key, 'dependency');
      } else {
        node.missingDependencies.push(reference);
        unsafe.add(node.key);
        warnings.push(t('{source}:{line}: {id} 的依赖 {reference} {reason}。', { source: node.source, line: node.line ?? node.order + 1, id: node.id, reference, reason: t(matches.length ? '存在歧义' : '未找到') }));
      }
    }
  }
  const hardEdges = [...edges];
  const hardCycles = traverse(nodes, byKey, hardEdges, (parent, child) => {
    child.column = Math.max(child.column, parent.column + 1);
    if (unsafe.has(parent.key)) unsafe.add(child.key);
  });
  if (hardCycles.size) {
    for (const key of hardCycles) unsafe.add(key);
    warnings.push(t('依赖循环或受循环影响：{tasks}；暂不推断下一步。', { tasks: describe(hardCycles, byKey, language) }));
  }

  const routes = new Map();
  for (const node of nodes) {
    if (node.route !== 'main') continue;
    const key = JSON.stringify([node.source, node.workstream]);
    if (!routes.has(key)) routes.set(key, []);
    const route = routes.get(key);
    if (route.length) {
      const previous = route.at(-1);
      addEdge(previous.key, node.key, 'sequence');
    }
    route.push(node);
  }
  for (const node of nodes) {
    for (const field of ['after', 'before']) {
      const reference = node[field];
      if (reference === undefined || reference === null || reference === '') continue;
      const matches = resolve(node, reference);
      if (matches.length === 1) {
        node[`${field}Key`] = matches[0].key;
        if (field === 'after') addEdge(matches[0].key, node.key, 'attachment');
        else addEdge(node.key, matches[0].key, 'attachment');
      } else warnings.push(t('{source}:{line}: {id} 的位置 {field}={reference} {reason}；不影响已注明的依赖。', { source: node.source, line: node.line ?? node.order + 1, id: node.id, field, reference, reason: t(matches.length ? '存在歧义' : '未找到') }));
    }
  }
  const layoutCycles = traverse(nodes, byKey, edges, (parent, child) => {
    child.column = Math.max(child.column, parent.column + 1);
  });
  if (layoutCycles.size) warnings.push(t('布局关系循环或受循环影响：{tasks}；相关位置无法确认。', { tasks: describe(layoutCycles, byKey, language) }));

  const attention = (node) => node.states?.development === 'blocked' || node.states?.verification === 'failed';
  const complete = (node) => node.states?.development === 'done' && !attention(node);
  const incomplete = (node) => node.dependencies.filter((key) => !complete(byKey.get(key)));
  const ready = (node) => node.dependencyMode === 'explicit' && !unsafe.has(node.key) && incomplete(node).length === 0;
  const visible = nodes.filter((node) => workstream === 'all' || node.workstream === workstream);
  const current = visible.find((node) => node.isCurrent);
  for (const node of nodes) {
    if (attention(node)) node.status = 'blocked';
    else if (node.isCurrent) node.status = 'current';
    else if (complete(node)) node.status = node.states?.acceptance === 'pending' ? 'pending' : 'done';
    else if (node.states?.development === 'planned' && node.dependencyMode === 'explicit') node.status = ready(node) ? 'available' : 'locked';
    if (node.isCurrent && node.dependencyMode === 'explicit' && !ready(node)) warnings.push(t('{source}:{line}: {id} 已记录为进行中，但依赖尚未完成或无法确认；保留进行中状态。', { source: node.source, line: node.line ?? node.order + 1, id: node.id }));
  }
  const eligible = (node) => node.states?.development === 'planned' && !attention(node) && !unsafe.has(node.key);
  let next = (current && !attention(current) && visible.find((node) => {
    if (!eligible(node) || node.dependencyMode !== 'explicit') return false;
    const remaining = incomplete(node);
    return remaining.length === 1 && remaining[0] === current.key;
  })) || visible.find((node) => eligible(node) && ready(node));
  let nextKind = next ? 'dependency' : null;
  // Ordered rounds offer a labelled suggestion, never an implied prerequisite.
  const sequenceReady = new Map();
  for (const route of routes.values()) {
    let precedingComplete = true;
    for (const node of route) {
      sequenceReady.set(node.key, precedingComplete);
      precedingComplete &&= complete(node) || (node.key === current?.key && !attention(node) && !unsafe.has(node.key));
    }
  }
  if (!next) {
    next = visible.find((node) => eligible(node) && node.route === 'main'
      && node.dependencyMode === 'unspecified' && !layoutCycles.has(node.key) && sequenceReady.get(node.key));
    if (next) nextKind = 'sequence';
  }
  if (next) {
    next.status = 'next';
    next.isNext = true;
  }
  return { nodes, edges, currentKey: current?.key ?? null, nextKey: next?.key ?? null, nextKind,
    planningMode: visible.length ? (visible.some((node) => node.route === 'main') ? 'route' : 'grouped') : 'empty',
    visibleKeys: visible.map((node) => node.key),
    counts: { total: visible.length, done: visible.filter((node) => node.states?.development === 'done').length,
      active: visible.filter((node) => node.isCurrent).length,
      blocked: visible.filter(attention).length,
      pending: visible.filter((node) => node.states?.acceptance === 'pending').length },
    warnings: [...new Set(warnings)] };
}

// Iterative traversal also handles long plans and duplicate edge kinds safely.
function traverse(nodes, byKey, edges, visit) {
  const outgoing = new Map(nodes.map((node) => [node.key, new Set()]));
  const incoming = new Map(nodes.map((node) => [node.key, 0]));
  for (const edge of edges) {
    if (outgoing.get(edge.from).has(edge.to)) continue;
    outgoing.get(edge.from).add(edge.to);
    incoming.set(edge.to, incoming.get(edge.to) + 1);
  }
  const queue = nodes.filter((node) => incoming.get(node.key) === 0);
  for (let index = 0; index < queue.length; index += 1) {
    const parent = queue[index];
    for (const key of outgoing.get(parent.key)) {
      visit(parent, byKey.get(key));
      incoming.set(key, incoming.get(key) - 1);
      if (incoming.get(key) === 0) queue.push(byKey.get(key));
    }
  }
  return new Set(nodes.filter((node) => incoming.get(node.key) > 0).map((node) => node.key));
}

function describe(keys, byKey, language) {
  return [...keys].slice(0, 8).map((key) => `${byKey.get(key).source}:${byKey.get(key).id}`).join(language === 'en' ? ', ' : '、') + (keys.size > 8 ? '…' : '');
}
