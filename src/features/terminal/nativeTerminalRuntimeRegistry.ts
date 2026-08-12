import type { FitAddon } from "@xterm/addon-fit";
import type { IDisposable, Terminal } from "@xterm/xterm";
import { desktopGateway } from "../../app/services";
import type { TerminalSession } from "../../domain/workbench/models";
import { publishTerminalCommandSubmitted } from "../../infrastructure/events/terminalCommandEvents";
import { handleXtermKeyboardCompatibility } from "../../infrastructure/terminal/xtermKeyboardCompatibility";
import {
  collectSubmittedCommands,
  extractSshDestination,
} from "../../infrastructure/terminal/sshCommand";
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
  resizeFrame?: number;
  pendingDimensions?: TerminalDimensions;
  lastDimensions?: TerminalDimensions;
  resizing: boolean;
  initializePromise?: Promise<void>;
  disposeTimer?: number;
  disposed: boolean;
  drainingInputs: boolean;
  commandBuffer: string;
}

interface TerminalDimensions {
  rows: number;
  cols: number;
}

export interface NativeTerminalAttachment {
  focus(): void;
  fit(): void;
  write(text: string): Promise<void>;
  release(): void;
}

const runtimes = new Map<string, NativeTerminalRuntime>();
const RELEASE_GRACE_PERIOD_MS = 800;
const MIN_RENDERABLE_HOST_SIZE = 32;

function sameDimensions(first?: TerminalDimensions, second?: TerminalDimensions) {
  return first?.rows === second?.rows && first?.cols === second?.cols;
}

/**
 * 每个 PTY 只保留最新尺寸并串行写入，避免多终端/连续拖动时旧的异步 resize 后到覆盖新尺寸。
 */
async function flushPendingResize(runtime: NativeTerminalRuntime) {
  if (runtime.resizing || !runtime.terminalId || runtime.disposed) return;
  runtime.resizing = true;
  try {
    while (runtime.pendingDimensions && runtime.terminalId && !runtime.disposed) {
      const dimensions = runtime.pendingDimensions;
      runtime.pendingDimensions = undefined;
      if (sameDimensions(dimensions, runtime.lastDimensions)) continue;
      try {
        await desktopGateway.resizeTerminal(runtime.terminalId, dimensions.rows, dimensions.cols);
        runtime.lastDimensions = dimensions;
      } catch {
        // 终端可能恰好在异步 resize 期间退出；清理流程会负责回收 PTY。
        break;
      }
    }
  } finally {
    runtime.resizing = false;
    // finally 前可能又写入了新尺寸；再次启动泵，确保最后一次布局不会遗漏。
    if (runtime.pendingDimensions) void flushPendingResize(runtime);
  }
}

function queuePtyResize(runtime: NativeTerminalRuntime, dimensions: TerminalDimensions) {
  runtime.pendingDimensions = dimensions;
  void flushPendingResize(runtime);
}

function bindSubmittedSshCommand(runtime: NativeTerminalRuntime, command: string) {
  const destination = extractSshDestination(command);
  if (destination) useWorkbenchStore.getState().bindTerminalSsh(runtime.sessionId, destination);
}

/**
 * 根据当前面板尺寸更新 xterm，并在 PTY 已创建时同步给后端。
 * 隐藏面板可能暂时为 0 尺寸，此时保留上一次有效行列数，避免误缩成最小终端。
 */
function fitAndResize(runtime: NativeTerminalRuntime) {
  if (!runtime.host || !runtime.terminal || !runtime.fitAddon) return;
  if (
    runtime.host.clientWidth < MIN_RENDERABLE_HOST_SIZE
    || runtime.host.clientHeight < MIN_RENDERABLE_HOST_SIZE
  ) return;

  runtime.fitAddon.fit();
  if (runtime.terminalId) {
    queuePtyResize(runtime, { rows: runtime.terminal.rows, cols: runtime.terminal.cols });
  }
}

/** 合并同一帧内的多次布局变更，避免网格重排时重复执行测量与 PTY resize。 */
function scheduleFit(runtime: NativeTerminalRuntime) {
  if (runtime.resizeFrame !== undefined) return;
  runtime.resizeFrame = requestAnimationFrame(() => {
    runtime.resizeFrame = undefined;
    fitAndResize(runtime);
  });
}

function observeHost(runtime: NativeTerminalRuntime) {
  runtime.observer?.disconnect();
  if (!runtime.host || !runtime.terminal || !runtime.fitAddon) return;
  runtime.observer = new ResizeObserver(() => scheduleFit(runtime));
  runtime.observer.observe(runtime.host);
  scheduleFit(runtime);
}

/** 等待字体和首帧布局稳定后，取得 shell 启动时应使用的真实行列数。 */
async function resolveInitialDimensions(runtime: NativeTerminalRuntime) {
  await document.fonts.ready;
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  fitAndResize(runtime);
  return {
    rows: Math.max(2, runtime.terminal?.rows ?? 24),
    cols: Math.max(2, runtime.terminal?.cols ?? 80),
  };
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
        if (request.submit) {
          publishTerminalCommandSubmitted();
          bindSubmittedSshCommand(runtime, request.content);
        }
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
    const initialDimensions = await resolveInitialDimensions(runtime);
    if (runtime.disposed || !runtime.terminal) return;
    const terminalId = await desktopGateway.spawnTerminal(
      runtime.cwd,
      initialDimensions,
      {
        onData: (data) => terminal.write(data),
        onExit: (code) => terminal.writeln(`\r\n[进程已退出${code === null ? "" : ` · ${code}`}]`),
      },
    );
    if (runtime.disposed) {
      terminal.dispose();
      await desktopGateway.killTerminal(terminalId);
      return;
    }
    runtime.terminalId = terminalId;
    runtime.lastDimensions = initialDimensions;
    // PTY 建立后立即再次校准，覆盖创建期间发生的网格尺寸变化。
    fitAndResize(runtime);
  } catch (error) {
    if (!runtime.disposed) terminal.writeln(`\r\n\x1b[31m[无法启动终端]\x1b[0m ${String(error)}`);
    return;
  }

  runtime.inputDisposable = terminal.onData((data) => {
    if (!runtime.terminalId) return;
    const submitted = collectSubmittedCommands(runtime.commandBuffer, data);
    runtime.commandBuffer = submitted.buffer;
    submitted.commands.forEach((command) => bindSubmittedSshCommand(runtime, command));
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
  if (runtime.resizeFrame !== undefined) cancelAnimationFrame(runtime.resizeFrame);
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
      resizing: false,
      commandBuffer: "",
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
    fit() {
      scheduleFit(attachedRuntime);
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
