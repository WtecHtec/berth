import type { FitAddon } from "@xterm/addon-fit";
import type { IDisposable, Terminal } from "@xterm/xterm";
import { desktopGateway } from "../../app/services";
import type { TerminalSession } from "../../domain/workbench/models";
import { publishTerminalCommandSubmitted } from "../../infrastructure/events/terminalCommandEvents";
import { handleXtermKeyboardCompatibility } from "../../infrastructure/terminal/xtermKeyboardCompatibility";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";

interface NativeTerminalRuntime {
  sessionId: string;
  cwd: string;
  host?: HTMLDivElement;
  terminal?: Terminal;
  fitAddon?: FitAddon;
  terminalId?: string;
  inputDisposable?: IDisposable;
  stopInputQueue?: () => void;
  observer?: ResizeObserver;
  initializePromise?: Promise<void>;
  disposeTimer?: number;
  disposed: boolean;
  drainingInputs: boolean;
}

export interface NativeTerminalAttachment {
  focus(): void;
  write(text: string): Promise<void>;
  release(): void;
}

const runtimes = new Map<string, NativeTerminalRuntime>();
const RELEASE_GRACE_PERIOD_MS = 800;

function observeHost(runtime: NativeTerminalRuntime) {
  runtime.observer?.disconnect();
  if (!runtime.host || !runtime.terminal || !runtime.fitAddon) return;
  const resize = () => {
    if (!runtime.host || !runtime.terminal || !runtime.fitAddon) return;
    runtime.fitAddon.fit();
    if (runtime.terminalId) {
      void desktopGateway.resizeTerminal(runtime.terminalId, runtime.terminal.rows, runtime.terminal.cols);
    }
  };
  runtime.observer = new ResizeObserver(resize);
  runtime.observer.observe(runtime.host);
  requestAnimationFrame(resize);
}

async function drainTerminalInputs(runtime: NativeTerminalRuntime) {
  if (runtime.drainingInputs || runtime.disposed || !runtime.terminalId || !runtime.terminal) return;
  runtime.drainingInputs = true;
  try {
    while (!runtime.disposed && runtime.terminalId) {
      const request = useWorkbenchStore.getState().pendingTerminalInputs[runtime.sessionId]?.[0];
      if (!request) break;
      try {
        const input = request.submit ? `${request.content}\r` : request.content;
        await desktopGateway.writeTerminal(runtime.terminalId, new TextEncoder().encode(input));
        if (request.submit) publishTerminalCommandSubmitted();
      } catch (error) {
        runtime.terminal.writeln(`\r\n\x1b[31m[无法注入快捷短语]\x1b[0m ${String(error)}`);
        break;
      }
      useWorkbenchStore.getState().acknowledgeTerminalInput(runtime.sessionId, request.id);
      if (!runtime.disposed) runtime.terminal.focus();
    }
  } finally {
    runtime.drainingInputs = false;
  }
}

/** 创建一次会话级终端运行时；React 布局重挂载时复用该实例和原 PTY。 */
async function initializeRuntime(runtime: NativeTerminalRuntime) {
  if (runtime.disposed || runtime.terminal || !runtime.host) return;
  const [xterm, fit] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
  if (runtime.disposed || runtime.terminal || !runtime.host) return;

  const terminal = new xterm.Terminal({
    allowProposedApi: false,
    cursorBlink: true,
    cursorStyle: "bar",
    // 每个终端独享缓冲区；限制回滚行数，避免多面板场景按终端数量放大内存。
    scrollback: 2000,
    fontFamily: "SFMono-Regular, SF Mono, Menlo, monospace",
    fontSize: 13,
    lineHeight: 1.5,
    theme: {
      background: "#111417",
      foreground: "#dce2e8",
      cursor: "#8ec8ff",
      selectionBackground: "#315b7f80",
    },
  });
  const fitAddon = new fit.FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(runtime.host);
  terminal.attachCustomKeyEventHandler((event) => handleXtermKeyboardCompatibility(event, terminal));
  runtime.terminal = terminal;
  runtime.fitAddon = fitAddon;
  observeHost(runtime);

  try {
    const terminalId = await desktopGateway.spawnTerminal(runtime.cwd, {
      onData: (data) => terminal.write(data),
      onExit: (code) => terminal.writeln(`\r\n[进程已退出${code === null ? "" : ` · ${code}`}]`),
    });
    if (runtime.disposed) {
      terminal.dispose();
      await desktopGateway.killTerminal(terminalId);
      return;
    }
    runtime.terminalId = terminalId;
  } catch (error) {
    if (!runtime.disposed) terminal.writeln(`\r\n\x1b[31m[无法启动终端]\x1b[0m ${String(error)}`);
    return;
  }

  runtime.inputDisposable = terminal.onData((data) => {
    if (!runtime.terminalId) return;
    void desktopGateway.writeTerminal(runtime.terminalId, new TextEncoder().encode(data)).then(() => {
      // 回车和多行粘贴都可能执行命令，统一发布事件以触发 Git 状态刷新。
      if (data.includes("\r") || data.includes("\n")) publishTerminalCommandSubmitted();
    });
  });
  runtime.stopInputQueue = useWorkbenchStore.subscribe((state, previous) => {
    if (state.pendingTerminalInputs[runtime.sessionId] !== previous.pendingTerminalInputs[runtime.sessionId]) {
      void drainTerminalInputs(runtime);
    }
  });
  void drainTerminalInputs(runtime);
}

function ensureRuntime(runtime: NativeTerminalRuntime) {
  if (runtime.terminal || runtime.initializePromise || runtime.disposed) return;
  runtime.initializePromise = initializeRuntime(runtime).finally(() => {
    runtime.initializePromise = undefined;
  });
}

function disposeRuntime(runtime: NativeTerminalRuntime) {
  if (runtime.disposed) return;
  runtime.disposed = true;
  runtimes.delete(runtime.sessionId);
  runtime.observer?.disconnect();
  runtime.stopInputQueue?.();
  runtime.inputDisposable?.dispose();
  runtime.terminal?.dispose();
  if (runtime.terminalId) void desktopGateway.killTerminal(runtime.terminalId);
}

/**
 * 将稳定的终端运行时附着到当前面板 DOM。
 * 布局切换造成短暂卸载时延迟释放，让新面板接管同一 xterm 与 PTY。
 */
export function attachNativeTerminalRuntime(
  session: Pick<TerminalSession, "id" | "cwd">,
  host: HTMLDivElement,
): NativeTerminalAttachment {
  let runtime = runtimes.get(session.id);
  if (runtime && runtime.cwd !== session.cwd) {
    disposeRuntime(runtime);
    runtime = undefined;
  }
  if (!runtime) {
    runtime = {
      sessionId: session.id,
      cwd: session.cwd,
      disposed: false,
      drainingInputs: false,
    };
    runtimes.set(session.id, runtime);
  }
  if (runtime.disposeTimer) {
    window.clearTimeout(runtime.disposeTimer);
    runtime.disposeTimer = undefined;
  }
  runtime.host = host;
  if (runtime.terminal?.element && runtime.terminal.element.parentElement !== host) {
    host.appendChild(runtime.terminal.element);
  }
  if (runtime.terminal) observeHost(runtime);
  ensureRuntime(runtime);

  const attachedRuntime = runtime;
  return {
    focus() {
      attachedRuntime.terminal?.focus();
    },
    async write(text) {
      if (attachedRuntime.initializePromise) await attachedRuntime.initializePromise;
      if (!attachedRuntime.terminalId) throw new Error("终端尚未准备好");
      await desktopGateway.writeTerminal(attachedRuntime.terminalId, new TextEncoder().encode(text));
      attachedRuntime.terminal?.focus();
    },
    release() {
      if (attachedRuntime.host === host) {
        attachedRuntime.observer?.disconnect();
        attachedRuntime.host = undefined;
      }
      if (attachedRuntime.disposeTimer) window.clearTimeout(attachedRuntime.disposeTimer);
      attachedRuntime.disposeTimer = window.setTimeout(
        () => disposeRuntime(attachedRuntime),
        RELEASE_GRACE_PERIOD_MS,
      );
    },
  };
}
