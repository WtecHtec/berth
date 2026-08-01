import { useCallback, useEffect, useRef } from "react";
import type { TerminalInputRequest, TerminalSession } from "../../domain/workbench/models";
import { desktopGateway } from "../../app/services";
import { useTerminalFileDrop } from "../../hooks/useTerminalFileDrop";
import { quoteShellPath } from "../../shared/utils/shell";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";
import { useInternalPathDropTarget } from "../../hooks/useInternalPathDropTarget";
import { publishTerminalCommandSubmitted } from "../../infrastructure/events/terminalCommandEvents";
import { handleXtermKeyboardCompatibility } from "../../infrastructure/terminal/xtermKeyboardCompatibility";

interface TerminalSurfaceProps {
  session?: TerminalSession;
  selected?: boolean;
}

const EMPTY_INPUTS: TerminalInputRequest[] = [];

function BrowserTerminal({ session }: TerminalSurfaceProps) {
  const pendingInputs = useWorkbenchStore((state) => state.pendingTerminalInputs[session?.id ?? ""] ?? EMPTY_INPUTS);
  return (
    <div className="terminal-preview" aria-label="终端预览">
      {pendingInputs.map((request) => (
        <div key={request.id} className="terminal-line terminal-line--injected">
          <span className="terminal-injection-mark">↳</span>{request.content}
        </div>
      ))}
      <div className="terminal-line terminal-line--muted">终端进程将在桌面应用中启动。</div>
    </div>
  );
}

/** 仅在 Tauri 终端面板中动态加载 xterm，启动页和文件预览无需承担终端运行时开销。 */
export function TerminalSurface({ session, selected = false }: TerminalSurfaceProps) {
  const dropTargetRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalIdRef = useRef<string | undefined>(undefined);
  const focusTerminalRef = useRef<() => void>(() => {});

  const insertDroppedPaths = useCallback((paths: string[]) => {
    const terminalId = terminalIdRef.current;
    if (!terminalId) return;
    // 拖入路径只写入当前输入行，不自动回车；路径统一经过 shell 安全转义。
    const text = `${paths.map(quoteShellPath).join(" ")} `;
    void desktopGateway.writeTerminal(terminalId, new TextEncoder().encode(text));
    focusTerminalRef.current();
  }, []);
  const isFileOver = useTerminalFileDrop(selected && Boolean(session), insertDroppedPaths);
  const isTreePathOver = useInternalPathDropTarget(dropTargetRef, insertDroppedPaths);

  useEffect(() => {
    if (desktopGateway.kind !== "tauri" || !hostRef.current || !session) return;
    let terminalId: string | undefined;
    let disposed = false;
    let observer: ResizeObserver | undefined;
    let cleanupTerminal: (() => void) | undefined;
    let stopInputQueue: (() => void) | undefined;
    let drainingInputs = false;

    void Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]).then(async ([xterm, fit]) => {
      if (disposed || !hostRef.current) return;
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
      terminal.open(hostRef.current);
      terminal.attachCustomKeyEventHandler((event) => handleXtermKeyboardCompatibility(event, terminal));
      focusTerminalRef.current = () => terminal.focus();
      fitAddon.fit();
      cleanupTerminal = () => terminal.dispose();

      try {
        terminalId = await desktopGateway.spawnTerminal(session.cwd, {
          onData: (data) => terminal.write(data),
          onExit: (code) => terminal.writeln(`\r\n[进程已退出${code === null ? "" : ` · ${code}`}]`),
        });
        if (disposed) {
          void desktopGateway.killTerminal(terminalId);
          terminal.dispose();
          return;
        }
        terminalIdRef.current = terminalId;
      } catch (error) {
        if (disposed) {
          terminal.dispose();
          return;
        }
        // 基础设施错误直接写入对应终端，避免未处理 Promise 影响整个工作台。
        terminal.writeln(`\r\n\x1b[31m[无法启动终端]\x1b[0m ${String(error)}`);
        return;
      }
      const inputDisposable = terminal.onData((data) => {
        if (!terminalId) return;
        void desktopGateway.writeTerminal(terminalId, new TextEncoder().encode(data)).then(() => {
          // 回车和多行粘贴都可能执行命令，统一发布事件以触发 Git 状态刷新。
          if (data.includes("\r") || data.includes("\n")) publishTerminalCommandSubmitted();
        });
      });

      // 快捷短语按队列顺序注入；PTY 成功接收后才确认消费，连续相同短语也不会丢失。
      const drainTerminalInputs = async () => {
        if (drainingInputs || disposed || !terminalId) return;
        drainingInputs = true;
        try {
          while (!disposed && terminalId) {
            const request = useWorkbenchStore.getState().pendingTerminalInputs[session.id]?.[0];
            if (!request) break;
            try {
              const input = request.submit ? `${request.content}\r` : request.content;
              await desktopGateway.writeTerminal(terminalId, new TextEncoder().encode(input));
              if (request.submit) publishTerminalCommandSubmitted();
            } catch (error) {
              terminal.writeln(`\r\n\x1b[31m[无法注入快捷短语]\x1b[0m ${String(error)}`);
              break;
            }
            useWorkbenchStore.getState().acknowledgeTerminalInput(session.id, request.id);
            if (!disposed) terminal.focus();
          }
        } finally {
          drainingInputs = false;
        }
      };
      stopInputQueue = useWorkbenchStore.subscribe((state, previous) => {
        if (state.pendingTerminalInputs[session.id] !== previous.pendingTerminalInputs[session.id]) {
          void drainTerminalInputs();
        }
      });
      void drainTerminalInputs();

      observer = new ResizeObserver(() => {
        fitAddon.fit();
        if (terminalId) void desktopGateway.resizeTerminal(terminalId, terminal.rows, terminal.cols);
      });
      observer.observe(hostRef.current);
      cleanupTerminal = () => {
        inputDisposable.dispose();
        terminal.dispose();
      };
    });

    return () => {
      disposed = true;
      terminalIdRef.current = undefined;
      focusTerminalRef.current = () => {};
      observer?.disconnect();
      stopInputQueue?.();
      cleanupTerminal?.();
      if (terminalId) void desktopGateway.killTerminal(terminalId);
    };
  }, [session]);

  if (desktopGateway.kind === "browser") return <BrowserTerminal session={session} />;
  return (
    <div
      ref={dropTargetRef}
      data-terminal-drop-target={session?.id}
      className={`terminal-drop-target ${isFileOver || isTreePathOver ? "is-file-over" : ""}`}
    >
      <div className="xterm-host" ref={hostRef} />
      {isFileOver || isTreePathOver ? <div className="terminal-drop-hint">释放以输入文件路径</div> : null}
    </div>
  );
}
