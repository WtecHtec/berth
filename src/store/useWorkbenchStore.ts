import { create } from "zustand";
import type {
  QuickPhrase,
  QuickPhraseActionResult,
  QuickPhraseDraft,
  TerminalInputRequest,
  TerminalSession,
  TreeNode,
  WorkbenchGridLayout,
  WorkbenchPane,
  WorkspaceRecord,
} from "../domain/workbench/models";
import { normalizeGridLayout, resizeGridPanes } from "../domain/workbench/gridLayout";
import { validateQuickPhraseDraft } from "../domain/phrases/phraseRules";
import { loadQuickPhrases, saveQuickPhrases } from "../infrastructure/persistence/quickPhraseRepository";
import { findTreeNode, setTreeNodeChildren, toggleTreeNode } from "../shared/utils/tree";

interface WorkbenchState {
  workspaceRoots: string[];
  workspaceName: string;
  recentWorkspaces: WorkspaceRecord[];
  workspaceLoading: boolean;
  workspaceError: string | null;
  sessions: TerminalSession[];
  tree: TreeNode[];
  selectedTreePath: string;
  panes: WorkbenchPane[];
  gridLayout: WorkbenchGridLayout;
  activePaneId: string;
  sessionsCollapsed: boolean;
  filesCollapsed: boolean;
  settingsOpen: boolean;
  commandPaletteOpen: boolean;
  pendingTerminalInputs: Record<string, TerminalInputRequest[]>;
  phrases: QuickPhrase[];
  setRecentWorkspaces(records: WorkspaceRecord[]): void;
  setWorkspaceLoading(loading: boolean): void;
  setWorkspaceError(error: string | null): void;
  loadWorkspace(path: string, children: TreeNode[]): void;
  appendWorkspaceRoot(path: string, children: TreeNode[]): void;
  returnToLauncher(): void;
  toggleTreeNode(id: string): void;
  setNodeChildren(id: string, children: TreeNode[]): void;
  selectTreePath(path: string): void;
  openTreeNode(id: string): void;
  openFilePath(path: string, name?: string): void;
  activateTab(paneId: string, tabId: string): void;
  closeTab(paneId: string, tabId: string): void;
  focusPane(paneId: string): void;
  focusSession(sessionId: string): void;
  setGridLayout(layout: WorkbenchGridLayout): void;
  setTabDirty(tabId: string, dirty: boolean): void;
  renameOpenPaths(previousPath: string, nextPath: string): void;
  toggleSessions(): void;
  toggleFiles(): void;
  setSettingsOpen(open: boolean): void;
  setCommandPaletteOpen(open: boolean): void;
  enqueueTerminalInput(sessionId: string, content: string): void;
  acknowledgeTerminalInput(sessionId: string, requestId: string): void;
  addPhrase(draft: QuickPhraseDraft): QuickPhraseActionResult;
  updatePhrase(id: string, draft: QuickPhraseDraft): QuickPhraseActionResult;
  deletePhrase(id: string): QuickPhraseActionResult;
  replacePhrases(phrases: QuickPhrase[]): void;
  createTerminal(): void;
  createTerminalAt(cwd: string): void;
}

let paneSequence = 0;
const emptyPane = (id = `pane-${Date.now()}-${paneSequence++}`): WorkbenchPane => ({ id, tabs: [], activeTabId: "" });
const initialPane = () => emptyPane("pane-main");

function pathName(path: string) {
  return path.split(/[\\/]/u).filter(Boolean).at(-1) ?? path;
}

function updateTab(
  panes: WorkbenchPane[],
  tabId: string,
  updater: (tab: WorkbenchPane["tabs"][number]) => WorkbenchPane["tabs"][number],
) {
  return panes.map((pane) => ({
    ...pane,
    tabs: pane.tabs.map((tab) => (tab.id === tabId ? updater(tab) : tab)),
  }));
}

export const useWorkbenchStore = create<WorkbenchState>((set, get) => ({
  workspaceRoots: [],
  workspaceName: "",
  recentWorkspaces: [],
  workspaceLoading: false,
  workspaceError: null,
  sessions: [],
  tree: [],
  selectedTreePath: "",
  panes: [initialPane()],
  gridLayout: { rows: 1, columns: 1 },
  activePaneId: "pane-main",
  sessionsCollapsed: false,
  filesCollapsed: false,
  settingsOpen: false,
  commandPaletteOpen: false,
  pendingTerminalInputs: {},
  phrases: loadQuickPhrases(),
  setRecentWorkspaces(recentWorkspaces) { set({ recentWorkspaces }); },
  setWorkspaceLoading(workspaceLoading) { set({ workspaceLoading }); },
  setWorkspaceError(workspaceError) { set({ workspaceError }); },
  loadWorkspace(path, children) {
    const name = pathName(path);
    const root: TreeNode = {
      id: `root:${path}`,
      name,
      path,
      kind: "root",
      depth: 0,
      expanded: true,
      children: children.map((child) => ({ ...child, depth: 1 })),
    };
    set({
      workspaceRoots: [path],
      workspaceName: name,
      workspaceLoading: false,
      workspaceError: null,
      sessions: [],
      tree: [root],
      selectedTreePath: path,
      panes: [initialPane()],
      gridLayout: { rows: 1, columns: 1 },
      activePaneId: "pane-main",
      pendingTerminalInputs: {},
    });
  },
  appendWorkspaceRoot(path, children) {
    if (get().workspaceRoots.includes(path)) return;
    const root: TreeNode = {
      id: `root:${path}`,
      name: pathName(path),
      path,
      kind: "root",
      depth: 0,
      expanded: true,
      children: children.map((child) => ({ ...child, depth: 1 })),
    };
    set((state) => {
      const workspaceRoots = [...state.workspaceRoots, path];
      return {
        workspaceRoots,
        workspaceName: workspaceRoots.map(pathName).join(", "),
        tree: [...state.tree, root],
      };
    });
  },
  returnToLauncher() {
    set({
      workspaceRoots: [],
      workspaceName: "",
      sessions: [],
      tree: [],
      selectedTreePath: "",
      panes: [initialPane()],
      gridLayout: { rows: 1, columns: 1 },
      activePaneId: "pane-main",
      workspaceError: null,
      pendingTerminalInputs: {},
    });
  },
  toggleTreeNode(id) {
    set((state) => ({ tree: toggleTreeNode(state.tree, id) }));
  },
  setNodeChildren(id, children) {
    set((state) => ({ tree: setTreeNodeChildren(state.tree, id, children) }));
  },
  selectTreePath(selectedTreePath) { set({ selectedTreePath }); },
  openTreeNode(id) {
    const node = findTreeNode(get().tree, id);
    if (!node) return;
    get().selectTreePath(node.path);
    if (node.kind === "folder" || node.kind === "root" || node.kind === "history") {
      get().toggleTreeNode(id);
      return;
    }
    if (node.kind !== "file") return;
    get().openFilePath(node.path, node.name);
  },
  openFilePath(path, name = pathName(path)) {
    const tabId = `file:${path}`;
    set((state) => {
      const pane = state.panes.find((item) => item.id === state.activePaneId) ?? state.panes[0];
      const exists = pane.tabs.some((tab) => tab.id === tabId);
      const tabs = exists ? pane.tabs : [...pane.tabs, {
        id: tabId,
        title: name,
        kind: name.endsWith(".md") ? "markdown" as const : "file" as const,
        filePath: path,
      }];
      return {
        selectedTreePath: path,
        activePaneId: pane.id,
        panes: state.panes.map((item) => item.id === pane.id ? { ...item, tabs, activeTabId: tabId } : item),
      };
    });
  },
  activateTab(paneId, tabId) {
    set((state) => {
      const tab = state.panes.find((pane) => pane.id === paneId)?.tabs.find((item) => item.id === tabId);
      return {
        activePaneId: paneId,
        selectedTreePath: tab?.filePath ?? state.selectedTreePath,
        panes: state.panes.map((pane) => pane.id === paneId ? { ...pane, activeTabId: tabId } : pane),
      };
    });
  },
  closeTab(paneId, tabId) {
    set((state) => {
      const closedSessionId = state.panes
        .flatMap((pane) => pane.tabs)
        .find((tab) => tab.id === tabId)?.sessionId;
      const pendingTerminalInputs = { ...state.pendingTerminalInputs };
      if (closedSessionId) delete pendingTerminalInputs[closedSessionId];
      return {
        sessions: closedSessionId
          ? state.sessions.filter((session) => session.id !== closedSessionId)
          : state.sessions,
        pendingTerminalInputs,
        panes: state.panes.map((pane) => {
        if (pane.id !== paneId) return pane;
        const index = pane.tabs.findIndex((tab) => tab.id === tabId);
        const tabs = pane.tabs.filter((tab) => tab.id !== tabId);
        return {
          ...pane,
          tabs,
          activeTabId: pane.activeTabId === tabId ? (tabs[Math.max(0, index - 1)]?.id ?? "") : pane.activeTabId,
        };
      }),
      };
    });
  },
  focusPane(activePaneId) {
    if (get().panes.some((pane) => pane.id === activePaneId)) set({ activePaneId });
  },
  focusSession(sessionId) {
    set((state) => {
      const located = state.panes.find((pane) => pane.tabs.some((tab) => tab.sessionId === sessionId));
      if (located) {
        const tab = located.tabs.find((item) => item.sessionId === sessionId)!;
        return {
          activePaneId: located.id,
          panes: state.panes.map((pane) => pane.id === located.id ? { ...pane, activeTabId: tab.id } : pane),
        };
      }
      return state;
    });
  },
  setGridLayout(layout) {
    const gridLayout = normalizeGridLayout(layout);
    set((state) => {
      const panes = resizeGridPanes(state.panes, gridLayout, emptyPane);
      const activePaneId = panes.some((pane) => pane.id === state.activePaneId)
        ? state.activePaneId
        : panes[panes.length - 1].id;
      return { gridLayout, panes, activePaneId };
    });
  },
  setTabDirty(tabId, dirty) {
    set((state) => ({ panes: updateTab(state.panes, tabId, (tab) => ({ ...tab, dirty })) }));
  },
  renameOpenPaths(previousPath, nextPath) {
    const pathPrefix = `${previousPath}/`;
    set((state) => ({
      selectedTreePath: state.selectedTreePath === previousPath || state.selectedTreePath.startsWith(pathPrefix)
        ? `${nextPath}${state.selectedTreePath.slice(previousPath.length)}`
        : state.selectedTreePath,
      panes: state.panes.map((pane) => {
        let activeTabId = pane.activeTabId;
        const tabs = pane.tabs.map((tab) => {
          if (!tab.filePath || (tab.filePath !== previousPath && !tab.filePath.startsWith(pathPrefix))) return tab;
          const filePath = `${nextPath}${tab.filePath.slice(previousPath.length)}`;
          const id = `file:${filePath}`;
          if (activeTabId === tab.id) activeTabId = id;
          return { ...tab, id, filePath, title: pathName(filePath) };
        });
        return { ...pane, tabs, activeTabId };
      }),
    }));
  },
  toggleSessions() { set((state) => ({ sessionsCollapsed: !state.sessionsCollapsed })); },
  toggleFiles() { set((state) => ({ filesCollapsed: !state.filesCollapsed })); },
  setSettingsOpen(settingsOpen) { set({ settingsOpen }); },
  setCommandPaletteOpen(commandPaletteOpen) { set({ commandPaletteOpen }); },
  enqueueTerminalInput(sessionId, content) {
    const request: TerminalInputRequest = { id: crypto.randomUUID(), content };
    set((state) => ({
      pendingTerminalInputs: {
        ...state.pendingTerminalInputs,
        [sessionId]: [...(state.pendingTerminalInputs[sessionId] ?? []), request],
      },
    }));
  },
  acknowledgeTerminalInput(sessionId, requestId) {
    set((state) => {
      const remaining = (state.pendingTerminalInputs[sessionId] ?? [])
        .filter((request) => request.id !== requestId);
      const pendingTerminalInputs = { ...state.pendingTerminalInputs };
      if (remaining.length > 0) pendingTerminalInputs[sessionId] = remaining;
      else delete pendingTerminalInputs[sessionId];
      return { pendingTerminalInputs };
    });
  },
  addPhrase(draft) {
    const validation = validateQuickPhraseDraft(draft, get().phrases);
    if (!validation.ok) return validation;
    const nextPhrases = [...get().phrases, { id: crypto.randomUUID(), ...validation.value }];
    try {
      saveQuickPhrases(nextPhrases);
      set({ phrases: nextPhrases });
      return { ok: true };
    } catch (cause) {
      return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
    }
  },
  updatePhrase(id, draft) {
    if (!get().phrases.some((phrase) => phrase.id === id)) return { ok: false, error: "快捷短语不存在" };
    const validation = validateQuickPhraseDraft(draft, get().phrases, id);
    if (!validation.ok) return validation;
    const nextPhrases = get().phrases.map((phrase) => phrase.id === id ? { id, ...validation.value } : phrase);
    try {
      saveQuickPhrases(nextPhrases);
      set({ phrases: nextPhrases });
      return { ok: true };
    } catch (cause) {
      return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
    }
  },
  deletePhrase(id) {
    const nextPhrases = get().phrases.filter((phrase) => phrase.id !== id);
    try {
      saveQuickPhrases(nextPhrases);
      set({ phrases: nextPhrases });
      return { ok: true };
    } catch (cause) {
      return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
    }
  },
  replacePhrases(phrases) { set({ phrases }); },
  createTerminal() {
    const cwd = get().workspaceRoots[0];
    if (!cwd) return;
    get().createTerminalAt(cwd);
  },
  createTerminalAt(cwd) {
    const id = `terminal-${Date.now()}`;
    const terminalNumber = get().sessions.length + 1;
    const session: TerminalSession = {
      id,
      title: terminalNumber === 1 ? "终端" : `终端 ${terminalNumber}`,
      project: pathName(cwd),
      cwd,
      branch: "",
      status: "running",
      processLabel: "shell",
      lastActivity: "刚刚",
      color: "#75baff",
    };
    set((state) => {
      const pane = state.panes.find((item) => item.id === state.activePaneId) ?? state.panes[0];
      const tab = { id: `tab-${id}`, title: session.title, kind: "terminal" as const, sessionId: id };
      return {
        sessions: [session, ...state.sessions],
        activePaneId: pane.id,
        panes: state.panes.map((item) => item.id === pane.id ? { ...item, tabs: [...item.tabs, tab], activeTabId: tab.id } : item),
      };
    });
  },
}));
