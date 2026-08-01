import { create } from "zustand";
import type { GitDiffTarget } from "../domain/git/models";
import type {
  AiSessionSummary,
  QuickPhrase,
  QuickPhraseActionResult,
  QuickPhraseDraft,
  TerminalInputRequest,
  TerminalSession,
  TreeNode,
  WorkbenchGridLayout,
  WorkbenchLayoutNode,
  WorkbenchLayoutPreset,
  WorkbenchPaneDropZone,
  WorkbenchPane,
  WorkspaceRecord,
} from "../domain/workbench/models";
import {
  countLayoutShapePanes,
  createGridLayout,
  createPresetLayout,
  gridLayoutPaneCount,
  hydrateLayoutShape,
  layoutPaneIds,
  layoutPresetPaneCount,
  movePaneInLayout,
  updateLayoutRatio,
} from "../domain/workbench/splitLayout";
import { validateQuickPhraseDraft } from "../domain/phrases/phraseRules";
import { loadQuickPhrases, saveQuickPhrases } from "../infrastructure/persistence/quickPhraseRepository";
import {
  loadWorkbenchLayout,
  saveWorkbenchLayout,
} from "../infrastructure/persistence/workbenchLayoutRepository";
import { buildAiSessionResumeCommand } from "../infrastructure/terminal/aiSessionCommand";
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
  layout: WorkbenchLayoutNode;
  activePaneId: string;
  sessionsCollapsed: boolean;
  filesCollapsed: boolean;
  sidebarView: "files" | "git";
  settingsOpen: boolean;
  commandPaletteOpen: boolean;
  pendingTerminalInputs: Record<string, TerminalInputRequest[]>;
  phrases: QuickPhrase[];
  setRecentWorkspaces(records: WorkspaceRecord[]): void;
  setWorkspaceLoading(loading: boolean): void;
  setWorkspaceError(error: string | null): void;
  loadWorkspace(path: string, children: TreeNode[]): void;
  appendWorkspaceRoot(path: string, children: TreeNode[]): void;
  removeWorkspaceRoot(path: string): void;
  returnToLauncher(): void;
  toggleTreeNode(id: string): void;
  setNodeChildren(id: string, children: TreeNode[]): void;
  selectTreePath(path: string): void;
  openTreeNode(id: string): void;
  openFilePath(path: string, name?: string): void;
  openGitDiff(target: GitDiffTarget): void;
  activateTab(paneId: string, tabId: string): void;
  closeTab(paneId: string, tabId: string): void;
  focusPane(paneId: string): void;
  focusSession(sessionId: string): void;
  applyGridLayout(layout: WorkbenchGridLayout): void;
  applyLayoutPreset(preset: WorkbenchLayoutPreset): void;
  movePane(sourcePaneId: string, targetPaneId: string, zone: WorkbenchPaneDropZone): void;
  setSplitRatio(splitId: string, ratio: number): void;
  restoreWorkspaceLayout(roots: string[]): void;
  setTabDirty(tabId: string, dirty: boolean): void;
  renameOpenPaths(previousPath: string, nextPath: string): void;
  toggleSessions(): void;
  toggleFiles(): void;
  toggleSidebarView(view: "files" | "git"): void;
  setSettingsOpen(open: boolean): void;
  setCommandPaletteOpen(open: boolean): void;
  enqueueTerminalInput(sessionId: string, content: string, submit?: boolean): void;
  acknowledgeTerminalInput(sessionId: string, requestId: string): void;
  addPhrase(draft: QuickPhraseDraft): QuickPhraseActionResult;
  updatePhrase(id: string, draft: QuickPhraseDraft): QuickPhraseActionResult;
  deletePhrase(id: string): QuickPhraseActionResult;
  replacePhrases(phrases: QuickPhrase[]): void;
  createTerminal(): void;
  createTerminalAt(cwd: string): void;
  openAiSession(session: AiSessionSummary): void;
}

let paneSequence = 0;
const emptyPane = (id = `pane-${Date.now()}-${paneSequence++}`): WorkbenchPane => ({ id, tabs: [], activeTabId: "" });
const initialPane = () => emptyPane("pane-main");
const initialLayout = (): WorkbenchLayoutNode => ({ type: "pane", paneId: "pane-main" });

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

function mergePaneTabs(target: WorkbenchPane, sources: WorkbenchPane[]): WorkbenchPane {
  const knownTabIds = new Set(target.tabs.map((tab) => tab.id));
  const appendedTabs = sources
    .flatMap((pane) => pane.tabs)
    .filter((tab) => {
      if (knownTabIds.has(tab.id)) return false;
      knownTabIds.add(tab.id);
      return true;
    });
  return {
    ...target,
    tabs: [...target.tabs, ...appendedTabs],
    activeTabId: target.activeTabId || appendedTabs[0]?.id || "",
  };
}

/** Reuses current pane instances and folds removed pane tabs into the main pane. */
function reconcilePresetPanes(
  panes: WorkbenchPane[],
  layout: WorkbenchLayoutNode,
  activePaneId: string,
  targetCount: number,
) {
  const paneById = new Map(panes.map((pane) => [pane.id, pane]));
  const visualOrder = layoutPaneIds(layout).flatMap((paneId) => {
    const pane = paneById.get(paneId);
    return pane ? [pane] : [];
  });
  const activePane = paneById.get(activePaneId) ?? visualOrder[0] ?? panes[0];
  const ordered = [activePane, ...visualOrder.filter((pane) => pane.id !== activePane.id)];
  for (const pane of panes) {
    if (!ordered.some((item) => item.id === pane.id)) ordered.push(pane);
  }
  while (ordered.length < targetCount) ordered.push(emptyPane());
  if (ordered.length === targetCount) return ordered;

  const retained = ordered.slice(0, targetCount);
  retained[0] = mergePaneTabs(retained[0], ordered.slice(targetCount));
  return retained;
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
  layout: initialLayout(),
  activePaneId: "pane-main",
  sessionsCollapsed: false,
  filesCollapsed: false,
  sidebarView: "files",
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
      layout: initialLayout(),
      activePaneId: "pane-main",
      sidebarView: "files",
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
  removeWorkspaceRoot(path) {
    const current = get();
    if (!current.workspaceRoots.includes(path)) return;
    if (current.workspaceRoots.length === 1) {
      get().returnToLauncher();
      return;
    }
    set((state) => {
      const workspaceRoots = state.workspaceRoots.filter((root) => root !== path);
      const insideRemovedRoot = (candidate?: string) => {
        if (!candidate) return false;
        return candidate === path || candidate.startsWith(`${path}/`) || candidate.startsWith(`${path}\\`);
      };
      const panes = state.panes.map((pane) => {
        const tabs = pane.tabs.filter((tab) => !insideRemovedRoot(tab.filePath));
        return {
          ...pane,
          tabs,
          activeTabId: tabs.some((tab) => tab.id === pane.activeTabId)
            ? pane.activeTabId
            : tabs[0]?.id ?? "",
        };
      });
      saveWorkbenchLayout(workspaceRoots, state.layout);
      return {
        workspaceRoots,
        workspaceName: workspaceRoots.map(pathName).join(", "),
        tree: state.tree.filter((node) => node.path !== path),
        selectedTreePath: insideRemovedRoot(state.selectedTreePath)
          ? workspaceRoots[0]
          : state.selectedTreePath,
        panes,
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
      layout: initialLayout(),
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
  openGitDiff(target) {
    const tabId = `git-diff:${target.mode}:${target.path}`;
    set((state) => {
      const pane = state.panes.find((item) => item.id === state.activePaneId) ?? state.panes[0];
      const exists = pane.tabs.some((tab) => tab.id === tabId);
      const tabs = exists ? pane.tabs : [...pane.tabs, {
        id: tabId,
        title: `${pathName(target.path)} — 更改`,
        kind: "git-diff" as const,
        filePath: target.path,
        gitDiffTarget: target,
      }];
      return {
        selectedTreePath: target.path,
        activePaneId: pane.id,
        panes: state.panes.map((item) => item.id === pane.id
          ? { ...item, tabs, activeTabId: tabId }
          : item),
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
  applyGridLayout(grid) {
    set((state) => {
      const panes = reconcilePresetPanes(
        state.panes,
        state.layout,
        state.activePaneId,
        gridLayoutPaneCount(grid),
      );
      const layout = createGridLayout(grid, panes.map((pane) => pane.id));
      saveWorkbenchLayout(state.workspaceRoots, layout);
      return { layout, panes, activePaneId: panes[0].id };
    });
  },
  applyLayoutPreset(preset) {
    set((state) => {
      const panes = reconcilePresetPanes(
        state.panes,
        state.layout,
        state.activePaneId,
        layoutPresetPaneCount(preset),
      );
      const layout = createPresetLayout(preset, panes.map((pane) => pane.id));
      saveWorkbenchLayout(state.workspaceRoots, layout);
      return {
        layout,
        panes,
        activePaneId: panes[0].id,
      };
    });
  },
  movePane(sourcePaneId, targetPaneId, zone) {
    if (sourcePaneId === targetPaneId) return;
    set((state) => {
      const layout = movePaneInLayout(state.layout, sourcePaneId, targetPaneId, zone);
      if (layout === state.layout) return state;
      saveWorkbenchLayout(state.workspaceRoots, layout);
      return { layout, activePaneId: sourcePaneId };
    });
  },
  setSplitRatio(splitId, ratio) {
    set((state) => {
      const layout = updateLayoutRatio(state.layout, splitId, ratio);
      if (layout === state.layout) return state;
      saveWorkbenchLayout(state.workspaceRoots, layout);
      return { layout };
    });
  },
  restoreWorkspaceLayout(roots) {
    const shape = loadWorkbenchLayout(roots);
    if (!shape) return;
    const paneCount = countLayoutShapePanes(shape);
    const panes = Array.from({ length: paneCount }, (_, index) => (
      index === 0 ? initialPane() : emptyPane()
    ));
    const layout = hydrateLayoutShape(shape, panes.map((pane) => pane.id));
    set({ panes, layout, activePaneId: panes[0].id });
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
          const gitDiffTarget = tab.gitDiffTarget
            ? {
                ...tab.gitDiffTarget,
                path: `${nextPath}${tab.gitDiffTarget.path.slice(previousPath.length)}`,
                relativePath: tab.gitDiffTarget.relativePath,
              }
            : undefined;
          const id = gitDiffTarget
            ? `git-diff:${gitDiffTarget.mode}:${filePath}`
            : `file:${filePath}`;
          if (activeTabId === tab.id) activeTabId = id;
          return {
            ...tab,
            id,
            filePath,
            gitDiffTarget,
            title: gitDiffTarget ? `${pathName(filePath)} — 更改` : pathName(filePath),
          };
        });
        return { ...pane, tabs, activeTabId };
      }),
    }));
  },
  toggleSessions() { set((state) => ({ sessionsCollapsed: !state.sessionsCollapsed })); },
  toggleFiles() { set((state) => ({ filesCollapsed: !state.filesCollapsed })); },
  toggleSidebarView(sidebarView) {
    set((state) => state.sidebarView === sidebarView && !state.filesCollapsed
      ? { filesCollapsed: true }
      : { sidebarView, filesCollapsed: false });
  },
  setSettingsOpen(settingsOpen) { set({ settingsOpen }); },
  setCommandPaletteOpen(commandPaletteOpen) { set({ commandPaletteOpen }); },
  enqueueTerminalInput(sessionId, content, submit = false) {
    const request: TerminalInputRequest = { id: crypto.randomUUID(), content, submit };
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
  openAiSession(aiSession) {
    const state = get();
    const existing = state.sessions.find((session) => (
      session.aiSession?.provider === aiSession.provider
      && session.aiSession.id === aiSession.id
      && state.panes.some((pane) => pane.tabs.some((tab) => tab.sessionId === session.id))
    ));
    if (existing) {
      get().focusSession(existing.id);
      return;
    }

    const id = `terminal-${crypto.randomUUID()}`;
    const providerLabel = aiSession.provider === "claude" ? "claude" : "codex";
    const session: TerminalSession = {
      id,
      title: aiSession.title,
      project: pathName(aiSession.rootPath),
      cwd: aiSession.rootPath,
      branch: aiSession.branch ?? "",
      status: "running",
      processLabel: providerLabel,
      lastActivity: "正在恢复",
      color: aiSession.provider === "claude" ? "#d49a72" : "#75baff",
      aiSession: { id: aiSession.id, provider: aiSession.provider },
    };
    const resumeRequest: TerminalInputRequest = {
      id: crypto.randomUUID(),
      content: buildAiSessionResumeCommand(aiSession),
      submit: true,
    };
    set((state) => {
      const pane = state.panes.find((item) => item.id === state.activePaneId) ?? state.panes[0];
      const tab = { id: `tab-${id}`, title: session.title, kind: "terminal" as const, sessionId: id };
      return {
        sessions: [session, ...state.sessions],
        activePaneId: pane.id,
        pendingTerminalInputs: {
          ...state.pendingTerminalInputs,
          [id]: [resumeRequest],
        },
        panes: state.panes.map((item) => item.id === pane.id
          ? { ...item, tabs: [...item.tabs, tab], activeTabId: tab.id }
          : item),
      };
    });
  },
}));
