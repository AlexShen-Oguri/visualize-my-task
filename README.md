# Visualize My Task

把项目实际使用的 Markdown 计划、规范和变更记录显示为本地开发行动图。**开发、自动验证、用户验收、交付四种状态独立显示**，原始文档始终是事实来源。

需要 Node.js 20+ 和本机浏览器。运行时零第三方依赖，无需 `npm install` 或构建。

## 安装

1. 从 [v1.0.0 Release](https://github.com/AlexShen-Oguri/visualize-my-task/releases/tag/v1.0.0) 下载 `visualize-my-task-1.0.0.zip`；访问私有仓库需要相应权限。
2. 解压，将完整的 `visualize-my-task/` 目录放入 `~/.codex/skills/`。已有同名安装时先保留副本。
3. 在目标项目调用：

   ```text
   $visualize-my-task 打开这个项目的开发看板
   ```

也可以克隆仓库后，把其中的 `visualize-my-task/` 安装到同一位置。版本能力见 [1.0.0 发布说明](docs/releases/1.0.0.md)。

## 预览与验证

在仓库根目录运行：

```sh
npm run check
npm test
npm start
```

`check` 输出合成案例的解析结果；`start` 打印本机预览地址。默认使用随 skill 提供的 `01-structured` 案例，不读取仓库的私人开发记录。`npm run preview` 打开同一案例，`npm run preview:new` 展示新项目的后续计划，`npm run test:cases` 运行案例回归。

## 打开自己的项目

使用安装目录中的脚本，按项目实际文档位置传入来源：

```sh
node ~/.codex/skills/visualize-my-task/scripts/board.mjs \
  --root "/path/to/project" --plan "docs/implementation.md" \
  --spec "docs/requirements.md" --changelog "docs/history.md" \
  --lang auto --check
```

确认来源和任务状态后，把 `--check` 替换为 `--port 0` 启动看板。保存已选择的 Markdown 后，看板每两秒同步一次。关闭启动进程即可停止服务。

`--plan`、`--spec`、`--changelog`、`--relations` 均可重复传入。路径相对 `--root` 解析；文件名不决定用途，`spec/implementation.md` 也可以是实施计划。省略来源参数时会查找常规计划、规范和历史文件；详细规则见 [来源规则](visualize-my-task/references/project-sources.md)。

## 任务关系与项目状态

- 任务表和勾选清单提供开发事实；规范中的验收标准不代表开发完成、测试执行或人工验收。
- 可选的 `BOARD.md` 引用已有任务 ID，描述主线、支线和工作类型。`After` / `Before` 决定地图位置，`Dependencies` 才表示阻塞条件。见 [任务关系](visualize-my-task/references/task-relations.md)。
- 已有项目没有计划时可以打开空看板；只有历史或规范时展示对应状态。查看已有项目不会自动创建计划。
- 新项目从第一天采用本 skill 时，可建立并维护 `plan.md`；代理或 `init-plan.mjs` 在授权范围内写入，服务自身只读。见 [新项目工作流](visualize-my-task/references/new-project.md)。

界面支持中文和英文。`--lang auto` 优先采用项目的主语言声明，再参考所选任务文档、规范和历史；不明确时使用中文。`--lang en` / `--lang zh` 可以覆盖选择。任务名称、说明和来源内容保留原文。

## 合成案例

随包提供的案例覆盖分轮计划与追加支线、零散计划、无计划、开发／安全／发布工作类型、新项目、自定义来源与纯规范，以及语言选择。所有案例都是合成数据，说明与预期行为见 [案例索引](visualize-my-task/examples/cases/README.md) 和 [语言案例](visualize-my-task/examples/cases/07-language/README.md)。

## 本地边界

服务绑定 `127.0.0.1`，仅提供固定的只读 GET / HEAD 路由，并校验 Host 和 Origin。它不提供源文档写入 API，不监听对话，不调用模型，不递归扫描项目，也不开放原始文件下载。不要把此服务通过代理或隧道暴露到公网。

所选文档的内容会在本机看板中显示；选择来源时只包含需要展示的记录。单个来源读取失败时保留最近一次成功快照并标记过期，重启后该内存快照消失。输入上限为 16 个文件，每个文件 2,000,000 字节、2,000 条记录。安全报告方式见 [SECURITY.md](SECURITY.md)。

## 制作安装包

维护者使用 Python 3 和 Node.js 20+：

```sh
npm run package
```

输出 ZIP、SHA-256 校验文件与验证摘要到 `dist/`，并运行解压后测试和案例检查。安装包包含 skill 运行资源、测试、参考和合成案例；仓库和安装包均排除私人开发流程、旧 UI 版本和验证快照。字体许可保留在 [OFL-BarlowCondensed.txt](visualize-my-task/assets/OFL-BarlowCondensed.txt)。

运行 `npm run test:package` 验证真实打包过程只包含逐文件白名单，并在写包前拒绝符号链接和缺失文件；测试仅使用临时副本与合成资料。
