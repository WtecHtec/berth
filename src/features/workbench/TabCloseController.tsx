import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { FileWarning } from "lucide-react";
import type { WorkbenchTab } from "../../domain/workbench/models";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";

interface CloseTarget {
  paneId: string;
  tabId: string;
}

interface DirtyCloseTarget extends CloseTarget {
  tab: WorkbenchTab;
}

interface PendingClose {
  targets: CloseTarget[];
  dirtyTargets: DirtyCloseTarget[];
  dirtyIndex: number;
  saving: boolean;
  error: string | null;
}

type TabSaver = () => Promise<void>;
type TabCloseCleanup = () => void;

interface TabCloseControllerValue {
  registerTabSaver(tabId: string, saver: TabSaver, cleanup?: TabCloseCleanup): () => void;
  requestCloseTab(paneId: string, tabId: string): void;
  requestCloseOtherTabs(paneId: string, keptTabId: string): void;
}

const TabCloseControllerContext = createContext<TabCloseControllerValue | null>(null);

function resolveDirtyTargets(targets: CloseTarget[]): DirtyCloseTarget[] {
  const { panes } = useWorkbenchStore.getState();
  return targets.flatMap((target) => {
    const tab = panes.find((pane) => pane.id === target.paneId)?.tabs.find((item) => item.id === target.tabId);
    return tab?.dirty ? [{ ...target, tab }] : [];
  });
}

/** 协调标签关闭与文件保存，确保任何关闭入口都不会绕过未保存保护。 */
export function TabCloseController({ children }: { children: ReactNode }) {
  const saversRef = useRef(new Map<string, TabSaver>());
  const closeCleanupsRef = useRef(new Map<string, TabCloseCleanup>());
  const closeFlowActiveRef = useRef(false);
  const [pending, setPending] = useState<PendingClose | null>(null);

  const registerTabSaver = useCallback((tabId: string, saver: TabSaver, cleanup?: TabCloseCleanup) => {
    saversRef.current.set(tabId, saver);
    if (cleanup) closeCleanupsRef.current.set(tabId, cleanup);
    return () => {
      if (saversRef.current.get(tabId) === saver) saversRef.current.delete(tabId);
      if (cleanup && closeCleanupsRef.current.get(tabId) === cleanup) closeCleanupsRef.current.delete(tabId);
    };
  }, []);

  const closeTargets = useCallback((targets: CloseTarget[]) => {
    for (const target of targets) {
      // 只有真正关闭时才清理草稿；多文件流程中途取消不会丢失已编辑内容。
      closeCleanupsRef.current.get(target.tabId)?.();
      useWorkbenchStore.getState().closeTab(target.paneId, target.tabId);
    }
  }, []);

  const requestCloseTargets = useCallback((targets: CloseTarget[]) => {
    if (targets.length === 0 || closeFlowActiveRef.current) return;
    const dirtyTargets = resolveDirtyTargets(targets);
    if (dirtyTargets.length === 0) {
      closeTargets(targets);
      return;
    }
    closeFlowActiveRef.current = true;
    setPending({ targets, dirtyTargets, dirtyIndex: 0, saving: false, error: null });
  }, [closeTargets]);

  const requestCloseTab = useCallback((paneId: string, tabId: string) => {
    requestCloseTargets([{ paneId, tabId }]);
  }, [requestCloseTargets]);

  const requestCloseOtherTabs = useCallback((paneId: string, keptTabId: string) => {
    const pane = useWorkbenchStore.getState().panes.find((item) => item.id === paneId);
    if (!pane) return;
    requestCloseTargets(pane.tabs
      .filter((tab) => tab.id !== keptTabId)
      .map((tab) => ({ paneId, tabId: tab.id })));
  }, [requestCloseTargets]);

  const cancelClose = useCallback(() => {
    if (pending?.saving) return;
    closeFlowActiveRef.current = false;
    setPending(null);
  }, [pending?.saving]);

  const saveAndContinue = useCallback(async () => {
    if (!pending || pending.saving) return;
    const current = pending.dirtyTargets[pending.dirtyIndex];
    const saver = saversRef.current.get(current.tabId);
    if (!saver) {
      setPending({ ...pending, error: "当前编辑器尚未准备好，请稍后重试。" });
      return;
    }

    setPending({ ...pending, saving: true, error: null });
    try {
      await saver();
      const nextIndex = pending.dirtyIndex + 1;
      if (nextIndex < pending.dirtyTargets.length) {
        setPending({ ...pending, dirtyIndex: nextIndex, saving: false, error: null });
        return;
      }
      closeFlowActiveRef.current = false;
      setPending(null);
      closeTargets(pending.targets);
    } catch (reason) {
      setPending({
        ...pending,
        saving: false,
        error: reason instanceof Error ? reason.message : String(reason),
      });
    }
  }, [closeTargets, pending]);

  const discardAndContinue = useCallback(() => {
    if (!pending || pending.saving) return;
    const nextIndex = pending.dirtyIndex + 1;
    if (nextIndex < pending.dirtyTargets.length) {
      setPending({ ...pending, dirtyIndex: nextIndex, error: null });
      return;
    }
    closeFlowActiveRef.current = false;
    setPending(null);
    closeTargets(pending.targets);
  }, [closeTargets, pending]);

  useEffect(() => {
    if (!pending) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [cancelClose, pending]);

  const value = useMemo<TabCloseControllerValue>(() => ({
    registerTabSaver,
    requestCloseTab,
    requestCloseOtherTabs,
  }), [registerTabSaver, requestCloseOtherTabs, requestCloseTab]);

  const currentTarget = pending?.dirtyTargets[pending.dirtyIndex];
  return (
    <TabCloseControllerContext.Provider value={value}>
      {children}
      {pending && currentTarget ? (
        <div className="modal-scrim" role="presentation" onMouseDown={cancelClose}>
          <section
            className="unsaved-changes-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="unsaved-dialog-title"
            aria-describedby="unsaved-dialog-description"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="unsaved-changes-dialog__heading">
              <span><FileWarning size={17} /></span>
              <div>
                <small>未保存的修改</small>
                <h2 id="unsaved-dialog-title">保存“{currentTarget.tab.title}”后关闭？</h2>
              </div>
            </div>
            <p id="unsaved-dialog-description">你可以保存修改、关闭且不保存，或取消本次关闭。</p>
            {pending.dirtyTargets.length > 1 ? (
              <div className="unsaved-changes-dialog__progress">
                待保存文件 {pending.dirtyIndex + 1} / {pending.dirtyTargets.length}
              </div>
            ) : null}
            {pending.error ? <div className="unsaved-changes-dialog__error" role="alert">保存失败：{pending.error}</div> : null}
            <footer>
              <button className="button button--secondary" type="button" disabled={pending.saving} onClick={cancelClose}>取消</button>
              <button className="button button--danger" type="button" disabled={pending.saving} onClick={discardAndContinue}>
                {pending.dirtyIndex + 1 < pending.dirtyTargets.length ? "不保存并继续" : "关闭且不保存"}
              </button>
              <button autoFocus className="button button--primary" type="button" disabled={pending.saving} onClick={() => void saveAndContinue()}>
                {pending.saving ? "正在保存…" : pending.dirtyTargets.length > 1 ? "保存并继续" : "保存并关闭"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </TabCloseControllerContext.Provider>
  );
}

export function useTabCloseController() {
  const controller = useContext(TabCloseControllerContext);
  if (!controller) throw new Error("useTabCloseController 必须在 TabCloseController 内使用");
  return controller;
}
