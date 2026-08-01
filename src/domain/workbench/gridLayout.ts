import type { WorkbenchGridLayout, WorkbenchPane } from "./models";

export const MAX_GRID_TRACKS = 4;

/** Keeps user-provided dimensions inside the compact desktop workspace limit. */
export function normalizeGridLayout(layout: WorkbenchGridLayout): WorkbenchGridLayout {
  return {
    rows: Math.min(MAX_GRID_TRACKS, Math.max(1, Math.trunc(layout.rows))),
    columns: Math.min(MAX_GRID_TRACKS, Math.max(1, Math.trunc(layout.columns))),
  };
}

/**
 * Reconciles panes without losing tabs when a grid becomes smaller.
 * Tabs from removed cells are folded into the final remaining cell.
 */
export function resizeGridPanes(
  panes: WorkbenchPane[],
  layout: WorkbenchGridLayout,
  createPane: () => WorkbenchPane,
): WorkbenchPane[] {
  const targetCount = layout.rows * layout.columns;
  if (panes.length === targetCount) return panes;
  if (panes.length < targetCount) {
    return [...panes, ...Array.from({ length: targetCount - panes.length }, createPane)];
  }

  const retained = panes.slice(0, targetCount);
  const foldedTabs = panes.slice(targetCount).flatMap((pane) => pane.tabs);
  if (foldedTabs.length === 0) return retained;

  const target = retained[targetCount - 1];
  const knownIds = new Set(target.tabs.map((tab) => tab.id));
  const uniqueFoldedTabs = foldedTabs.filter((tab) => !knownIds.has(tab.id));
  retained[targetCount - 1] = {
    ...target,
    tabs: [...target.tabs, ...uniqueFoldedTabs],
    activeTabId: target.activeTabId || uniqueFoldedTabs[0]?.id || "",
  };
  return retained;
}
