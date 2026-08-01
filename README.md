# Berth

Berth 是一个面向 macOS 的轻量终端工作台，用来在同一个窗口中管理多根目录、文件、Git 变更和多个终端。

Berth 管理的是终端，不直接编排 AI Agent。Claude Code、Codex 和其他 CLI 工具都只是运行在真实 shell 中的普通进程；会话历史继续由各工具自己的本地存储负责，Berth 只读取必要的索引元数据。

## 当前能力

- 启动页：打开文件夹、恢复最近窗口、新建应用窗口。
- 多根工作区：向当前窗口追加目录，并可从文件树移除某个根目录。
- 文件管理：懒加载文件树、搜索、新建文件、重命名、移入废纸篓、在访达中显示、在目录中创建终端。
- 文件编辑：轻量文本编辑、语法高亮、`Command/Ctrl + S` 保存。
- 文件预览：图片、音频、视频、Markdown 和 HTML；HTML 可在本地浏览器中打开。
- 终端：真实 POSIX PTY、login shell、拖入路径、快捷短语、面板 resize、在系统终端中打开。
- 灵活布局：规则 M × N 网格和递归分割布局共用一套模型，面板可拖拽停靠并调整比例。
- AI 会话索引：读取 Claude Code 与 Codex 最近会话的元数据，并在唯一终端中恢复，避免重复进入同一会话。
- 源代码管理：多根 Git 仓库状态、忽略文件装饰、Diff、文件或仓库级暂存/取消暂存。
- 快捷短语：在设置中增删改，跨窗口同步，并注入指定终端而不是共享输入状态。

## 设计原则

1. **终端优先**：不复制 CLI 工具的交互层，只保证字节流、尺寸和生命周期可靠。
2. **保持轻量**：使用 Tauri 和系统 WKWebView，不内置 Chromium、插件宿主或语言服务。
3. **真实数据**：浏览器适配器不提供 mock；没有工作区时只展示启动页。
4. **边界清晰**：业务规则不依赖 React/Tauri，UI 不直接执行系统命令。
5. **资源有主**：每个 PTY、监听器、预览服务和全局事件都必须有明确的创建者与清理路径。

## 架构

```text
React UI（features / shared/ui）
        │
        ▼
交互编排（hooks）──── 工作台状态与用例（store）
        │                    │
        └─────────┬──────────┘
                  ▼
          业务模型与能力接口（domain）
                  │
                  ▼
       平台适配器（infrastructure）
                  │ Tauri invoke / Channel
                  ▼
       Rust 系统能力（src-tauri/src）
```

目录职责：

- `src/domain`：业务模型、纯函数以及桌面/Git 能力接口；不依赖 React。
- `src/store`：工作区、布局、标签、终端会话和快捷短语的状态转换。
- `src/features`：按产品能力拆分的 React UI 组件。
- `src/hooks`：跨组件交互、异步用例和资源订阅的编排层。
- `src/infrastructure`：Tauri/浏览器适配器、持久化和进程内事件。
- `src/shared`：无业务状态的 UI 原语与工具函数。
- `src-tauri/src/commands`：文件、Git、预览、窗口和系统集成命令。
- `src-tauri/src/terminal.rs`：POSIX PTY、shell 和终端注册表。

## 核心处理机制

### 1. 终端字节流与生命周期

```text
xterm.onData
    │ UTF-8 bytes
    ▼
write_to_terminal ──► PTY master ──► login shell / CLI
                                          │
                                          ▼
xterm.write ◄── Tauri Channel ◄── PTY reader thread
```

- xterm 只在 Tauri 终端面板首次挂载时动态加载，启动页和文件预览不会加载终端运行时。
- Rust 使用 `openpty` 创建独立 PTY，通过 `terminal_id` 在注册表中隔离 writer 与 child。
- shell 以交互式 login shell 启动，使 `.zprofile`、`.zshrc` 和 NVM 配置与系统终端保持一致。
- 创建 shell 前移除 `npm_config_prefix` / `NPM_CONFIG_PREFIX`，避免 `tauri dev` 的 npm 环境阻止 NVM 初始化。
- `ResizeObserver` 同时驱动 xterm fit 与 `TIOCSWINSZ`，面板调整后 CLI 能收到正确行列数。
- shell 自然退出、标签关闭、原生窗口销毁和应用退出都会从注册表移除进程并执行 `kill/wait`；重复清理是幂等的。
- 单窗口最多运行 16 个终端，每个终端保留 2000 行 scrollback，防止资源无上限增长。
- 原生文件拖放只交给当前选中的终端；路径经过 POSIX shell 转义，只插入文本，不自动提交命令。

### 2. 标签页内存策略

不同标签使用不同生命周期：

- 终端标签始终挂载，否则会丢失 PTY 连接和 xterm 缓冲区。
- 活动文件、媒体和 Diff 标签正常挂载。
- 未修改的后台文件/媒体/Diff 标签卸载，需要时重新读取。
- 有未保存草稿的文件继续挂载，保证切换标签不会丢失编辑内容。

这样既保留终端会话，又避免所有文件内容、媒体元素和高亮 DOM 随标签数量永久累积。

### 3. 文件读取、搜索与保存

- 文件树按目录展开懒加载，不在打开工作区时递归读取整棵目录。
- Git 工作区搜索使用 Git 提供的文件清单，遵循 `.gitignore`、仓库 exclude 和全局 ignore。
- 非 Git 目录使用有边界的递归搜索，并跳过 `.git`、`node_modules`、`target`、`.next`。
- 搜索结果最多返回 200 条。
- 可编辑文本最大为 5 MB；限制在 Rust 边界执行，避免同一大文本在 Rust、`content`、`draft` 和高亮 DOM 中重复驻留。
- 保存完成后主动刷新 Git 状态，界面不会等待下一次轮询。

### 4. Git 状态同步

Git 状态通过多种信号协作更新：

1. 工作区根目录变化时执行初始刷新。
2. 窗口重新聚焦时刷新。
3. 终端提交命令后延迟 650ms 刷新，覆盖用户在终端中执行 Git 命令的场景。
4. 源代码管理侧栏可见且窗口聚焦时自动轮询。

轮询从 2.5 秒开始；连续无变化时逐步退避到 15 秒，检测到变化后恢复到 2.5 秒。并发刷新带有递增序号，较早结束的进程不能覆盖较新的结果；状态没有变化时复用旧引用，避免文件树无意义重渲染。

`.gitignore` 装饰使用 `git check-ignore --stdin` 按仓库批量处理已经加载的树节点，而不是为每个文件启动一个 Git 进程。Diff 原始数据限制为 2 MB，前端最多渲染 6000 行。

### 5. HTML 与媒体预览

- 图片、音频和视频使用 Tauri asset URL 与 WKWebView 原生能力，音视频只预加载 metadata。
- HTML 预览绑定 `127.0.0.1` 的随机端口，只允许访问入口文件所在目录内经过 canonicalize 校验的资源。
- HTML 服务使用阻塞 `accept`，关闭时通过一次本地连接主动唤醒，不进行高频空轮询。
- 图片、音频、视频等相对资源从磁盘流式写入连接，不在 Rust 中一次性读取完整文件。
- 切换预览模式、关闭标签或关闭窗口都会停止对应服务；外部浏览器只允许打开 Berth 创建的回环地址。

### 6. AI 会话索引与恢复

- Claude Code：根据工作区路径定位项目目录，每个候选 JSONL 最多读取 256 KB，用于提取 session id、标题、分支和更新时间。
- Codex：以只读、无互斥方式查询本地 `state_5.sqlite` 索引，不加载完整 transcript。
- 每个工作区、每个工具只展示最近 20 条记录，并缓存有限的元数据以加快再次打开速度。
- 恢复会话时使用工具自己的原生命令；同一 provider + session id 已有终端时只聚焦现有面板，不重复启动。

## 轻量化边界

| 资源 | 当前限制 |
|---|---:|
| 每窗口终端数 | 16 |
| 每终端 scrollback | 2000 行 |
| 可编辑文本 | 5 MB |
| 文件搜索结果 | 200 条 |
| Git Diff 原始数据 | 2 MB |
| Git Diff 渲染 | 6000 行 |
| AI 会话 | 每工作区、每工具 20 条 |
| Git 自动轮询 | 2.5–15 秒自适应 |
| 规则网格 | 最大 4 × 4 |

当前 release 参考数据：二进制约 12 MB，DMG 约 3.1 MB，macOS 启动页完整物理内存约 89 MB。实际占用会随系统版本、终端数量、终端内运行的进程和打开文件而变化。

## 开发

环境要求：

- macOS
- Node.js 与 npm
- Rust stable
- Xcode Command Line Tools

安装依赖：

```bash
npm install
```

浏览器模式只用于检查 UI，不提供伪造的文件、Git 或终端数据：

```bash
npm run dev
```

启动原生桌面应用：

```bash
npm run tauri -- dev
```

## 检查与测试

```bash
# TypeScript
npm run check

# Rust 格式与静态检查
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings

# Rust 测试
cargo test --manifest-path src-tauri/Cargo.toml
```

HTML 预览测试需要绑定本机回环端口。如果运行环境禁止本地监听，需要给予测试进程相应权限。

## 构建

```bash
npm run tauri -- build
```

macOS 安装包输出到：

```text
src-tauri/target/release/bundle/dmg/Berth_<version>_aarch64.dmg
```

`src-tauri/target` 是 Rust 编译缓存，体积可能达到数 GB，但不属于最终应用安装体积。

## 当前边界

- 只支持 macOS，不支持 Windows ConPTY 或 Linux PTY。
- 不提供插件系统、LSP、调试器、多光标等完整 IDE 能力。
- Git 当前覆盖查看、Diff、暂存和取消暂存，不处理提交、分支管理和冲突解决。
- 超过 5 MB 的文本不会直接进入内置编辑器；大文件应使用专用查看工具。
- 运行中的终端进程不会跨应用重启恢复；AI 历史会话通过原工具索引重新进入。
