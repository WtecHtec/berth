import { useCallback, useEffect, useRef } from "react";
import type { TerminalInputRequest, TerminalSession } from "../../domain/workbench/models";
import { desktopGateway } from "../../app/services";
import { useTerminalFileDrop } from "../../hooks/useTerminalFileDrop";
import { quoteShellPath } from "../../shared/utils/shell";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";
import { useInternalPathDropTarget } from "../../hooks/useInternalPathDropTarget";
import {
  attachNativeTerminalRuntime,
  type NativeTerminalAttachment,
} from "./nativeTerminalRuntimeRegistry";

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
  const terminalAttachmentRef = useRef<NativeTerminalAttachment | null>(null);

  const insertDroppedPaths = useCallback((paths: string[]) => {
    // 拖入路径只写入当前输入行，不自动回车；路径统一经过 shell 安全转义。
    const text = `${paths.map(quoteShellPath).join(" ")} `;
    void terminalAttachmentRef.current?.write(text);
  }, []);
  const isFileOver = useTerminalFileDrop(selected && Boolean(session), insertDroppedPaths);
  const isTreePathOver = useInternalPathDropTarget(dropTargetRef, insertDroppedPaths);

  useEffect(() => {
    if (desktopGateway.kind !== "tauri" || !hostRef.current || !session) return;
    const attachment = attachNativeTerminalRuntime(session, hostRef.current);
    terminalAttachmentRef.current = attachment;
    return () => {
      if (terminalAttachmentRef.current === attachment) terminalAttachmentRef.current = null;
      attachment.release();
    };
  }, [session?.cwd, session?.id]);

  useEffect(() => {
    if (selected) {
      // 从隐藏布局恢复时主动重算尺寸，避免浏览器未派发 ResizeObserver 的边缘情况。
      terminalAttachmentRef.current?.fit();
      terminalAttachmentRef.current?.focus();
    }
  }, [selected]);

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
