import type { WorkbenchLayoutNode } from "../../domain/workbench/models";
import {
  serializeLayoutShape,
  type WorkbenchLayoutShape,
} from "../../domain/workbench/splitLayout";

const STORAGE_KEY = "berth.workbench-layouts.v1";
const MAX_LAYOUT_DEPTH = 8;
const MAX_LAYOUT_PANES = 16;

function workspaceKey(roots: string[]) {
  return roots.join("\u001f");
}

function parseShape(value: unknown, depth = 0): WorkbenchLayoutShape | null {
  if (!value || typeof value !== "object" || depth > MAX_LAYOUT_DEPTH) return null;
  const candidate = value as Partial<WorkbenchLayoutShape>;
  if (candidate.type === "pane") return { type: "pane" };
  if (candidate.type !== "split"
    || (candidate.axis !== "horizontal" && candidate.axis !== "vertical")
    || typeof candidate.ratio !== "number"
    || !Array.isArray(candidate.children)
    || candidate.children.length !== 2) return null;
  const first = parseShape(candidate.children[0], depth + 1);
  const second = parseShape(candidate.children[1], depth + 1);
  if (!first || !second) return null;
  return {
    type: "split",
    axis: candidate.axis,
    ratio: candidate.ratio,
    children: [first, second],
  };
}

function paneCount(shape: WorkbenchLayoutShape): number {
  return shape.type === "pane" ? 1 : paneCount(shape.children[0]) + paneCount(shape.children[1]);
}

function loadRecords(): Record<string, unknown> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function loadWorkbenchLayout(roots: string[]): WorkbenchLayoutShape | null {
  if (roots.length === 0) return null;
  const shape = parseShape(loadRecords()[workspaceKey(roots)]);
  if (!shape || paneCount(shape) > MAX_LAYOUT_PANES) return null;
  return shape;
}

export function saveWorkbenchLayout(roots: string[], layout: WorkbenchLayoutNode) {
  if (roots.length === 0) return;
  try {
    const records = loadRecords();
    records[workspaceKey(roots)] = serializeLayoutShape(layout);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Layout persistence is best-effort and must never block direct manipulation.
  }
}
