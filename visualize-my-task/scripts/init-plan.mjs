import { readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseMarkdown } from './markdown.mjs';

// Keep the same conventional authorities as board.mjs; match their case variants too.
const planCandidates = ['docs/private/ACTIVE-PLAN.md', 'ACTIVE-PLAN.md', 'PLAN.md', 'plan.md', 'docs/PLAN.md', 'docs/plan.md', 'docs/roadmap.md', 'roadmap.md'];

async function existingPlan(root) {
  for (const candidate of planCandidates) {
    let paths = [root];
    for (const part of candidate.split('/')) {
      const matches = [];
      for (const directory of paths) {
        let names;
        try { names = await readdir(directory); }
        catch (error) {
          if (['ENOENT', 'ENOTDIR'].includes(error.code)) continue;
          throw error;
        }
        matches.push(...names.filter(name => name.toLowerCase() === part.toLowerCase()).sort().map(name => join(directory, name)));
      }
      paths = matches;
    }
    // A directory or even a dangling symlink named as a plan is an existing authority.
    if (paths.length) return paths[0];
  }
  return null;
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}必须是非空文本。`);
  return value.trim();
}

function markdown(value) {
  return value.replace(/[\r\n\u2028\u2029]+/g, ' ').replace(/([\\`*_{}[\]()#+.!<>|~-])/g, '\\$1');
}

export async function initializePlan({ root, title, goal, tasks } = {}) {
  root = resolve(text(root, '项目根目录'));
  goal = text(goal, '目标');
  if (!Array.isArray(tasks) || !tasks.length || tasks.length > 2000) throw new Error('请提供 1–2000 项用户已确认的任务。');
  tasks = tasks.map(task => text(task, '任务'));
  title = title === undefined ? `${basename(root)} · 开发计划` : text(title, '标题');
  if (!(await stat(root)).isDirectory()) throw new Error('项目根目录必须是已存在的目录。');
  const existing = await existingPlan(root);
  if (existing) return { created: false, path: existing, reason: 'existing-plan' };

  const taskIds = tasks.map((_, index) => `P${String(index + 1).padStart(2, '0')}`);
  const date = new Date().toISOString().slice(0, 10);
  const document = `# ${markdown(title)}

## 当前目标

${markdown(goal)}

## 开发计划

任务顺序只表示计划展示顺序；未声明阻塞依赖。开发、自动验证、用户验收与交付分别记录。

| ID | Task | Development | Verification | Acceptance | Delivery | Route | Origin | Workstream | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${tasks.map((task, index) => `| ${taskIds[index]} | ${markdown(task)} | 未开始 | 未记录 | 未记录 | 未记录 | main | planned | development | 用户提供的初始任务 |`).join('\n')}

## 计划变更记录

后续调整保留已有任务编号，新增任务使用新的唯一编号；在此记录新增、调整或取消的编号、原因及挂接关系，不将记录重复计为任务。

| 日期 | 变更 | 涉及编号 | 原因 |
| --- | --- | --- | --- |
| ${date} | 初始建立 | ${taskIds.join('、')} | 按用户提供的目标与初始任务建立计划 |
`;
  const parsed = parseMarkdown(document, { source: 'plan.md' });
  if (parsed.items.length !== tasks.length || parsed.warnings.length) throw new Error('生成的计划未通过 Markdown 解析验证，未创建文件。');
  if (Buffer.byteLength(document) > 2_000_000) throw new Error('计划超过看板的 2,000,000 字节上限，未创建文件。');
  const path = join(root, 'plan.md');
  try { await writeFile(path, document, { encoding: 'utf8', flag: 'wx' }); }
  catch (error) {
    if (error.code === 'EEXIST') return { created: false, path, reason: 'existing-plan' };
    throw error;
  }
  return { created: true, path, taskIds };
}

async function main() {
  const { values } = parseArgs({ options: {
    root: { type: 'string' }, title: { type: 'string' }, goal: { type: 'string' },
    task: { type: 'string', multiple: true }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('node init-plan.mjs --root PROJECT [--title TITLE] --goal GOAL --task TASK [--task TASK ...]\nNode 20+; explicitly creates lowercase plan.md from user-provided scope only. Existing conventional plans, directories and symlinks are preserved.');
    return;
  }
  console.log(JSON.stringify(await initializePlan({ root: values.root, title: values.title, goal: values.goal, tasks: values.task })));
}

if (process.argv[1] && await realpath(process.argv[1]).catch(() => null) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(`计划初始化失败：${error.message}`); process.exitCode = 1; });
