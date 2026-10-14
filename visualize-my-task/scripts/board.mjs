import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readFile, readdir, realpath, stat } from 'node:fs/promises';
import { createServer as httpServer } from 'node:http';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseMarkdown } from './markdown.mjs';
import { localizeWarning, normalizeLanguage, projectDeclaration, resolveLanguage, sourceDiagnostic } from './language.mjs';

const indexPath = fileURLToPath(new URL('../assets/index.html', import.meta.url));
const assets = new Map([
  ['/assets/mission-model.mjs', { path: fileURLToPath(new URL('../assets/mission-model.mjs', import.meta.url)), type: 'text/javascript; charset=utf-8' }],
  ['/assets/i18n.mjs', { path: fileURLToPath(new URL('../assets/i18n.mjs', import.meta.url)), type: 'text/javascript; charset=utf-8' }],
  ['/assets/terrain.png', { path: fileURLToPath(new URL('../assets/terrain.png', import.meta.url)), type: 'image/png' }],
]);
const maxBytes = 2_000_000;
const headers = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src data:; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

const sourceFault = sourceCode => Object.assign(new Error(sourceCode), { sourceCode });

async function readDocument(path, limit = maxBytes) {
  const before = await stat(path);
  if (!before.isFile()) throw sourceFault('SOURCE_NOT_FILE');
  const file = await open(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  try {
    const info = await file.stat();
    if (!info.isFile()) throw sourceFault('SOURCE_NOT_FILE');
    if (info.size > limit) throw sourceFault('SOURCE_TOO_LARGE');
    const buffer = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > limit) throw sourceFault('SOURCE_TOO_LARGE');
    const after = await file.stat();
    if (info.mtimeMs !== after.mtimeMs || info.size !== after.size) throw sourceFault('SOURCE_CHANGING');
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length)), updatedAt: after.mtime.toISOString() };
  } finally {
    await file.close();
  }
}

async function readProjectLanguage(root, cache) {
  // Root declarations only; bounded reads avoid scanning application code or assets.
  for (const [filename, kind, limit] of [['package.json', 'package', 65_536], ['README.md', 'readme', 131_072], ['README.markdown', 'readme', 131_072]]) {
    const cacheKey = JSON.stringify(['project-language', resolve(root), filename]);
    let language = cache.get(cacheKey) ?? null;
    try {
      const path = await sourceSpelling(root, resolve(root, filename));
      language = projectDeclaration((await readDocument(path, limit)).text, kind);
      cache.set(cacheKey, language);
    } catch (failure) {
      if (failure.code === 'ENOENT' || failure.code === 'ENOTDIR') {
        cache.delete(cacheKey);
        language = null;
      }
    }
    if (language) return language;
  }
  return null;
}

export async function readSnapshot({ root = process.cwd(), planPaths = [], changelogPaths = [], specPaths = [], relationPaths = [], title, tasks = 'all', lang = 'auto', cache = new Map() } = {}) {
  if (lang !== 'auto' && !normalizeLanguage(lang)) throw new Error('--lang must be auto, zh, or en.');
  if (!['all', 'tables', 'checklists'].includes(tasks)) throw new Error('--tasks 必须为 all、tables 或 checklists。');
  const sources = [], items = [], history = [], specifications = [], relations = [], warnings = [];
  const definitions = [...planPaths.map(path => ({ path, mode: 'plan' })), ...changelogPaths.map(path => ({ path, mode: 'changelog' })), ...specPaths.map(path => ({ path, mode: 'spec' })), ...relationPaths.map(path => ({ path, mode: 'relations' }))];
  if (definitions.length > 16) throw new Error('最多同时读取 16 个来源。');
  const seen = new Set(), physicalSources = new Set();
  for (const definition of definitions) {
    const path = resolve(root, definition.path);
    if (!/\.(?:md|markdown)$/i.test(path)) throw new Error('来源必须使用 .md 或 .markdown 扩展名。');
    if (seen.has(path)) throw new Error('同一来源不可重复登记。');
    seen.add(path);
    // A document may be selected for a different role on a later read.
    // Only fall back to a snapshot interpreted under the same role.
    const cacheKey = JSON.stringify([path, definition.mode]);
    let stored = cache.get(cacheKey), state = 'live', failure = null, stage = 'read';
    let name = stored?.sourceName ?? (relative(root, path).replaceAll('\\', '/') || basename(path));
    try {
      const document = await readDocument(path);
      const actual = await sourceSpelling(root, path).catch(() => path);
      name = relative(root, actual).replaceAll('\\', '/') || basename(actual);
      stage = 'parse';
      const parsed = parseMarkdown(document.text, { source: name, mode: definition.mode });
      if (definition.mode === 'plan' && tasks !== 'all') {
        parsed.items = parsed.items.filter(item => item.kind === (tasks === 'tables' ? 'table' : 'checklist'));
        if (!parsed.items.length) throw sourceFault('SOURCE_TASK_KIND');
      }
      if (parsed.items.length > 2000 || parsed.history.length > 2000 || parsed.specifications?.length > 2000 || parsed.relations?.length > 2000) throw sourceFault('SOURCE_RECORD_LIMIT');
      stored = { ...parsed, sourceName: name, updatedAt: document.updatedAt, lastSuccess: new Date().toISOString() };
      cache.set(cacheKey, stored);
    } catch (caught) {
      state = stored ? 'stale' : 'error';
      if (stored?.sourceName) name = stored.sourceName;
      failure = caught;
    }
    if (physicalSources.has(name)) throw new Error('同一来源不可使用不同大小写重复登记。');
    physicalSources.add(name);
    sources.push({ name, mode: definition.mode, state, failure, stage, updatedAt: stored?.updatedAt ?? null, lastSuccess: stored?.lastSuccess ?? null });
    if (stored) {
      const occurrences = new Map();
      items.push(...stored.items.map(item => {
        // Keep source locations as facts, separate from refresh-stable identity.
        const identity = JSON.stringify(item.explicitId ? [name, 'id', item.id] : [name, item.kind, item.group, item.label]);
        const occurrence = (occurrences.get(identity) ?? 0) + 1;
        occurrences.set(identity, occurrence);
        return { ...item, key: `${identity}:${occurrence}`, stale: state !== 'live' };
      }));
      history.push(...stored.history.map(entry => ({ ...entry, stale: state !== 'live' })));
      specifications.push(...(stored.specifications ?? []).map(entry => ({ ...entry, stale: state !== 'live' })));
      relations.push(...(stored.relations ?? []).map(entry => ({ ...entry, stale: state !== 'live' })));
      warnings.push(...stored.warnings.map(warning => `${name}: ${warning}`));
    }
  }
  const planningState = items.length ? 'documented' : sources.some(source => source.state === 'error') ? 'source-error' : planPaths.length ? 'source-error' : specifications.length ? 'spec-only' : history.length ? 'history-only' : 'no-plan';
  const language = resolveLanguage({ lang, projectLanguage: lang === 'auto' ? await readProjectLanguage(root, cache) : null, items, specifications, history });
  const localizedSources = sources.map(({ failure, stage, ...source }) => ({ ...source, ...(failure ? sourceDiagnostic(failure, language.language, stage) : { error: null, errorCode: null }) }));
  const snapshot = { ...language, title: title || basename(resolve(root)) + (language.language === 'en' ? ' · Task board' : ' · 开发看板'), items, history, specifications, relations, warnings: warnings.map(warning => localizeWarning(warning, language.language)), sources: localizedSources, planningState };
  const revisionSources = localizedSources.map(({ lastSuccess, ...source }) => source);
  return { ...snapshot, revision: createHash('sha256').update(JSON.stringify({ ...snapshot, sources: revisionSources })).digest('hex'), syncedAt: new Date().toISOString() };
}

export function createServer(options = {}) {
  const cache = new Map();
  return httpServer(async (request, response) => {
    const send = (status, body, type = 'application/json; charset=utf-8', extra = {}) => {
      response.writeHead(status, { ...headers, 'Content-Type': type, ...extra });
      response.end(request.method === 'HEAD' ? undefined : body);
    };
    const port = response.socket.localPort;
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!hosts.includes(request.headers.host) || (request.headers.origin !== undefined && !hosts.some(host => request.headers.origin === `http://${host}`))) {
      send(403, JSON.stringify({ error: '仅允许本机来源访问。' }));
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      send(405, JSON.stringify({ error: '看板仅支持只读请求。' }), undefined, { Allow: 'GET, HEAD' });
      return;
    }
    if (!['/', '/index.html', '/api/plan'].includes(request.url) && !assets.has(request.url)) {
      send(404, JSON.stringify({ error: '页面不存在。' }));
      return;
    }
    try {
      if (request.url === '/api/plan') send(200, JSON.stringify(await readSnapshot({ ...options, cache })));
      else if (assets.has(request.url)) {
        const asset = assets.get(request.url);
        send(200, await readFile(asset.path), asset.type);
      } else {
        const snapshot = await readSnapshot({ ...options, cache });
        send(200, (await readFile(indexPath, 'utf8')).replace('__BOARD_LANGUAGE__', snapshot.language), 'text/html; charset=utf-8');
      }
    } catch (error) {
      send(503, JSON.stringify({ error: `看板暂不可用：${error.message}` }));
    }
  });
}

async function sourceSpelling(root, path) {
  let actual = resolve(root);
  for (const part of relative(actual, resolve(root, path)).split(/[\\/]/).filter(Boolean)) {
    if (part === '..') { actual = dirname(actual); continue; }
    const names = await readdir(actual);
    const name = names.includes(part) ? part : names.find(name => name.toLowerCase() === part.toLowerCase());
    if (!name) throw Object.assign(new Error('No matching source.'), { code: 'ENOENT' });
    actual = resolve(actual, name);
  }
  return actual;
}

async function firstExisting(root, candidates) {
  for (const path of candidates) {
    try {
      const actual = await sourceSpelling(root, path);
      // Case-insensitive filesystems can stat PLAN.md when the real name is plan.md.
      // Preserve on-disk spelling so discovery and explicit paths share task identities.
      if ((await stat(actual)).isFile()) return actual;
    } catch {}
  }
  return null;
}

async function main() {
  const { values } = parseArgs({ options: {
    root: { type: 'string' }, plan: { type: 'string', multiple: true }, spec: { type: 'string', multiple: true }, changelog: { type: 'string', multiple: true },
    relations: { type: 'string', multiple: true },
    title: { type: 'string' }, tasks: { type: 'string' }, lang: { type: 'string' }, port: { type: 'string' }, check: { type: 'boolean' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('node board.mjs --root PROJECT [--plan TASKS.md ...] [--spec DESIGN.md ...] [--changelog CHANGES.md ...] [--relations BOARD.md ...] [--tasks all|tables|checklists] [--lang auto|zh|en] [--title TITLE] [--port 0] [--check]\nNode 20+; defaults to port 4184; loopback only; polls every 2 seconds. --check prints JSON and exits. Explicit --plan / --spec / --changelog selects only those task, specification and history sources. Specs are reference text, never task status. Without these flags, conventional plan, spec and changelog paths are discovered. Missing plans show an empty planning view. BOARD.md is discovered alongside explicit plans too. UI language defaults to auto: supported package.json i18n.defaultLocale/defaultLocale or an explicit README primary-language declaration, then selected task prose, specs, history; ambiguous or empty projects use Chinese. --lang zh|en overrides detection; locale forms such as en-US are accepted.');
    return;
  }
  const root = resolve(values.root ?? process.cwd());
  if (!(await stat(root)).isDirectory()) throw new Error('项目根目录必须是已存在的目录。');
  const planPaths = values.plan ?? [], specPaths = values.spec ?? [], changelogPaths = values.changelog ?? [];
  if (!values.plan && !values.spec && !values.changelog) {
    const plan = await firstExisting(root, ['docs/private/ACTIVE-PLAN.md', 'ACTIVE-PLAN.md', 'PLAN.md', 'plan.md', 'docs/PLAN.md', 'docs/plan.md', 'docs/roadmap.md', 'roadmap.md']);
    if (plan) planPaths.push(plan);
    const changelog = await firstExisting(root, [...(plan ? [dirname(plan) + '/CHANGELOG.md'] : []), 'CHANGELOG.md', 'changelog.md', 'docs/CHANGELOG.md']);
    if (changelog) changelogPaths.push(changelog);
    const spec = await firstExisting(root, ['SPEC.md', 'spec.md', 'docs/SPEC.md', 'docs/spec.md']);
    if (spec) specPaths.push(spec);
  }
  const relationPaths = values.relations ?? [];
  if (!values.relations) {
    for (const directory of new Set(['.', ...planPaths.map(path => dirname(path))])) {
      const relation = await firstExisting(root, [resolve(root, directory, 'BOARD.md'), resolve(root, directory, '.visualize-my-task.md'), resolve(root, directory, '.development-board.md')]);
      if (relation && !relationPaths.some(path => resolve(root, path) === resolve(root, relation))) relationPaths.push(relation);
    }
  }
  const portText = values.port ?? '4184';
  if (!/^\d+$/.test(portText) || Number(portText) > 65535) throw new Error('端口必须为 0–65535；0 自动选择空闲端口。');
  const options = { root, planPaths, specPaths, changelogPaths, relationPaths, title: values.title, tasks: values.tasks ?? 'all', lang: values.lang ?? 'auto' };
  const initial = await readSnapshot(options);
  if (values.check) {
    console.log(JSON.stringify(initial, null, 2));
    if (initial.sources.some(source => source.state !== 'live')) process.exitCode = 1;
    return;
  }
  for (const source of initial.sources.filter(source => source.error)) console.error(`${source.name}: ${source.error}`);
  const server = createServer(options);
  server.once('error', error => {
    const reason = error.code === 'EPERM' ? '执行环境不允许本机监听；通过环境的正规执行审批后重试。' : error.code === 'EADDRINUSE' ? '端口已占用；使用 --port 0 选择空闲端口。' : error.code ?? error.message;
    console.error(`看板启动失败：${reason}`);
    process.exitCode = 1;
  });
  server.listen(Number(portText), '127.0.0.1', () => {
    console.log(JSON.stringify({ url: `http://127.0.0.1:${server.address().port}/`, pid: process.pid, root, sources: initial.sources.map(({ name, mode }) => ({ name, mode })) }));
  });
  const stop = () => { server.close(() => { process.exitCode = 0; }); server.closeIdleConnections(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (process.argv[1] && await realpath(process.argv[1]).catch(() => null) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(`看板启动失败：${error.message}`); process.exitCode = 1; });
