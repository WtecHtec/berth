import type {
  WorkbenchLayoutAxis,
  WorkbenchGridLayout,
  WorkbenchLayoutNode,
  WorkbenchLayoutPreset,
  WorkbenchPaneDropZone,
} from "./models";

export interface WorkbenchLayoutShapePane {
  type: "pane";
}

export interface WorkbenchLayoutShapeSplit {
  type: "split";
  axis: WorkbenchLayoutAxis;
  ratio: number;
  children: [WorkbenchLayoutShape, WorkbenchLayoutShape];
}

export type WorkbenchLayoutShape = WorkbenchLayoutShapePane | WorkbenchLayoutShapeSplit;

const MIN_RATIO = 0.15;
const MAX_RATIO = 0.85;
export const MAX_GRID_TRACKS = 4;

let splitSequence = 0;

function splitId() {
  splitSequence += 1;
  return `split-${Date.now()}-${splitSequence}`;
}

function pane(paneId: string): WorkbenchLayoutNode {
  return { type: "pane", paneId };
}

function split(
  axis: WorkbenchLayoutAxis,
  first: WorkbenchLayoutNode,
  second: WorkbenchLayoutNode,
  ratio = 0.5,
): WorkbenchLayoutNode {
  return {
    type: "split",
    id: splitId(),
    axis,
    ratio: clampLayoutRatio(ratio),
    children: [first, second],
  };
}

export function clampLayoutRatio(ratio: number) {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
}

export function layoutPaneIds(node: WorkbenchLayoutNode): string[] {
  if (node.type === "pane") return [node.paneId];
  return [...layoutPaneIds(node.children[0]), ...layoutPaneIds(node.children[1])];
}

export function layoutPresetPaneCount(preset: WorkbenchLayoutPreset) {
  if (preset === "single") return 1;
  if (preset === "columns" || preset === "rows") return 2;
  if (preset === "quad") return 4;
  return 3;
}

export function normalizeGridLayout(layout: WorkbenchGridLayout): WorkbenchGridLayout {
  return {
    rows: Math.min(MAX_GRID_TRACKS, Math.max(1, Math.trunc(layout.rows))),
    columns: Math.min(MAX_GRID_TRACKS, Math.max(1, Math.trunc(layout.columns))),
  };
}

export function gridLayoutPaneCount(layout: WorkbenchGridLayout) {
  const normalized = normalizeGridLayout(layout);
  return normalized.rows * normalized.columns;
}

function createEqualTracks(axis: WorkbenchLayoutAxis, nodes: WorkbenchLayoutNode[]): WorkbenchLayoutNode {
  if (nodes.length === 1) return nodes[0];
  return split(axis, nodes[0], createEqualTracks(axis, nodes.slice(1)), 1 / nodes.length);
}

/** Converts a regular M × N choice into the same split tree used by custom layouts. */
export function createGridLayout(
  grid: WorkbenchGridLayout,
  paneIds: string[],
): WorkbenchLayoutNode {
  const normalized = normalizeGridLayout(grid);
  const requiredCount = gridLayoutPaneCount(normalized);
  if (paneIds.length < requiredCount) {
    throw new Error(`网格布局需要 ${requiredCount} 个面板`);
  }
  const rows = Array.from({ length: normalized.rows }, (_, row) => {
    const start = row * normalized.columns;
    const rowPanes = paneIds.slice(start, start + normalized.columns).map(pane);
    return createEqualTracks("horizontal", rowPanes);
  });
  return createEqualTracks("vertical", rows);
}

function flattenTracks(node: WorkbenchLayoutNode, axis: WorkbenchLayoutAxis): WorkbenchLayoutNode[] {
  if (node.type !== "split" || node.axis !== axis) return [node];
  return [...flattenTracks(node.children[0], axis), ...flattenTracks(node.children[1], axis)];
}

export function inferGridLayout(node: WorkbenchLayoutNode): WorkbenchGridLayout | null {
  const rows = flattenTracks(node, "vertical");
  const columnsByRow = rows.map((row) => flattenTracks(row, "horizontal"));
  const columns = columnsByRow[0]?.length ?? 0;
  if (columns === 0
    || rows.length > MAX_GRID_TRACKS
    || columns > MAX_GRID_TRACKS
    || columnsByRow.some((row) => row.length !== columns || row.some((cell) => cell.type !== "pane"))) {
    return null;
  }
  return { rows: rows.length, columns };
}

/** Builds common arrangements while always assigning the first pane to the main region. */
export function createPresetLayout(
  preset: WorkbenchLayoutPreset,
  paneIds: string[],
): WorkbenchLayoutNode {
  const requiredCount = layoutPresetPaneCount(preset);
  if (paneIds.length < requiredCount) {
    throw new Error(`布局 ${preset} 需要 ${requiredCount} 个面板`);
  }
  const [main, secondary, tertiary, fourth] = paneIds;
  if (preset === "single") return pane(main);
  if (preset === "columns") return split("horizontal", pane(main), pane(secondary));
  if (preset === "rows") return split("vertical", pane(main), pane(secondary));
  if (preset === "main-left") {
    return split("horizontal", pane(main), split("vertical", pane(secondary), pane(tertiary)), 0.58);
  }
  if (preset === "main-right") {
    return split("horizontal", split("vertical", pane(secondary), pane(tertiary)), pane(main), 0.42);
  }
  if (preset === "main-top") {
    return split("vertical", pane(main), split("horizontal", pane(secondary), pane(tertiary)), 0.58);
  }
  return split(
    "vertical",
    split("horizontal", pane(main), pane(secondary)),
    split("horizontal", pane(tertiary), pane(fourth)),
  );
}

function sameShape(node: WorkbenchLayoutNode, shape: WorkbenchLayoutShape): boolean {
  if (node.type !== shape.type) return false;
  if (node.type === "pane" || shape.type === "pane") return true;
  return node.axis === shape.axis
    && sameShape(node.children[0], shape.children[0])
    && sameShape(node.children[1], shape.children[1]);
}

export function inferLayoutPreset(node: WorkbenchLayoutNode): WorkbenchLayoutPreset | null {
  const candidates: WorkbenchLayoutPreset[] = [
    "single", "columns", "rows", "main-left", "main-right", "main-top", "quad",
  ];
  for (const preset of candidates) {
    const count = layoutPresetPaneCount(preset);
    const candidate = createPresetLayout(preset, Array.from({ length: count }, (_, index) => `${index}`));
    if (sameShape(node, serializeLayoutShape(candidate))) return preset;
  }
  return null;
}

export function updateLayoutRatio(
  node: WorkbenchLayoutNode,
  splitNodeId: string,
  ratio: number,
): WorkbenchLayoutNode {
  if (node.type === "pane") return node;
  if (node.id === splitNodeId) return { ...node, ratio: clampLayoutRatio(ratio) };
  const first = updateLayoutRatio(node.children[0], splitNodeId, ratio);
  const second = updateLayoutRatio(node.children[1], splitNodeId, ratio);
  if (first === node.children[0] && second === node.children[1]) return node;
  return { ...node, children: [first, second] };
}

function removePane(
  node: WorkbenchLayoutNode,
  paneId: string,
): { layout: WorkbenchLayoutNode | null; removed: boolean } {
  if (node.type === "pane") {
    return node.paneId === paneId
      ? { layout: null, removed: true }
      : { layout: node, removed: false };
  }
  const first = removePane(node.children[0], paneId);
  if (first.removed) return first.layout
    ? { layout: { ...node, children: [first.layout, node.children[1]] }, removed: true }
    : { layout: node.children[1], removed: true };
  const second = removePane(node.children[1], paneId);
  if (!second.removed) return { layout: node, removed: false };
  return second.layout
    ? { layout: { ...node, children: [node.children[0], second.layout] }, removed: true }
    : { layout: node.children[0], removed: true };
}

function replacePane(
  node: WorkbenchLayoutNode,
  paneId: string,
  replacement: WorkbenchLayoutNode,
): WorkbenchLayoutNode {
  if (node.type === "pane") return node.paneId === paneId ? replacement : node;
  const first = replacePane(node.children[0], paneId, replacement);
  const second = replacePane(node.children[1], paneId, replacement);
  if (first === node.children[0] && second === node.children[1]) return node;
  return { ...node, children: [first, second] };
}

function swapPanes(node: WorkbenchLayoutNode, firstPaneId: string, secondPaneId: string): WorkbenchLayoutNode {
  if (node.type === "pane") {
    if (node.paneId === firstPaneId) return pane(secondPaneId);
    if (node.paneId === secondPaneId) return pane(firstPaneId);
    return node;
  }
  return {
    ...node,
    children: [
      swapPanes(node.children[0], firstPaneId, secondPaneId),
      swapPanes(node.children[1], firstPaneId, secondPaneId),
    ],
  };
}

/** Moves a pane without touching its tabs or terminal session ownership. */
export function movePaneInLayout(
  node: WorkbenchLayoutNode,
  sourcePaneId: string,
  targetPaneId: string,
  zone: WorkbenchPaneDropZone,
): WorkbenchLayoutNode {
  if (sourcePaneId === targetPaneId) return node;
  if (zone === "center") return swapPanes(node, sourcePaneId, targetPaneId);

  const removed = removePane(node, sourcePaneId);
  if (!removed.removed || !removed.layout) return node;
  const axis: WorkbenchLayoutAxis = zone === "left" || zone === "right" ? "horizontal" : "vertical";
  const target = pane(targetPaneId);
  const source = pane(sourcePaneId);
  const replacement = zone === "left" || zone === "top"
    ? split(axis, source, target)
    : split(axis, target, source);
  return replacePane(removed.layout, targetPaneId, replacement);
}

export function serializeLayoutShape(node: WorkbenchLayoutNode): WorkbenchLayoutShape {
  if (node.type === "pane") return { type: "pane" };
  return {
    type: "split",
    axis: node.axis,
    ratio: clampLayoutRatio(node.ratio),
    children: [serializeLayoutShape(node.children[0]), serializeLayoutShape(node.children[1])],
  };
}

export function countLayoutShapePanes(shape: WorkbenchLayoutShape): number {
  if (shape.type === "pane") return 1;
  return countLayoutShapePanes(shape.children[0]) + countLayoutShapePanes(shape.children[1]);
}

export function hydrateLayoutShape(
  shape: WorkbenchLayoutShape,
  paneIds: string[],
): WorkbenchLayoutNode {
  let paneIndex = 0;
  const hydrate = (current: WorkbenchLayoutShape): WorkbenchLayoutNode => {
    if (current.type === "pane") {
      const paneId = paneIds[paneIndex];
      paneIndex += 1;
      if (!paneId) throw new Error("恢复布局时缺少面板标识");
      return pane(paneId);
    }
    return split(
      current.axis,
      hydrate(current.children[0]),
      hydrate(current.children[1]),
      current.ratio,
    );
  };
  return hydrate(shape);
}
