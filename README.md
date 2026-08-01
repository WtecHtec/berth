# Berth

Berth 是一个面向 macOS 的轻量终端工作台，用来管理多终端会话、文件和多根工作区。它不直接编排 AI agent；Claude Code、Codex 或普通 shell 都只是终端中运行的进程。

## 开发

```bash
npm install
npm run dev
```

启动原生桌面壳：

```bash
npm run tauri dev
```

## 架构

- `src/domain`：与框架无关的业务模型和系统能力接口
- `src/store`：工作台用例与状态转换
- `src/features`：按产品能力拆分的 React UI
- `src/hooks`：跨组件交互行为与键盘/指针协调
- `src/infrastructure`：浏览器预览与 Tauri 的能力适配器
- `src/shared`：无业务状态的 UI 原语与工具函数
- `src-tauri/src/commands`：文件和 Git 的 macOS 适配
- `src-tauri/src/terminal.rs`：POSIX PTY 生命周期与字节流传输
