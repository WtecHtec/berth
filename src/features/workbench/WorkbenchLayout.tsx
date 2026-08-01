import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  WorkbenchLayoutNode,
  WorkbenchPane,
  WorkbenchPaneDropZone,
} from "../../domain/workbench/models";
import { GripVertical } from "../../shared/lib/icons";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";
import { WorkbenchPaneView } from "./WorkbenchPaneView";

interface PaneDropTarget {
  paneId: string;
  zone: WorkbenchPaneDropZone;
}

interface SplitLayoutNodeProps {
  node: WorkbenchLayoutNode;
  panes: Map<string, WorkbenchPane>;
  activePaneId: string;
  draggingPaneId: string | null;
  dropTarget: PaneDropTarget | null;
  onPaneDragStart(paneId: string, event: ReactPointerEvent<HTMLButtonElement>): void;
}

const DROP_ZONE_LABELS: Record<WorkbenchPaneDropZone, string> = {
  left: "放到左侧",
  right: "放到右侧",
  top: "放到上方",
  bottom: "放到下方",
  center: "交换面板",
};

const DRAG_THRESHOLD_SQUARED = 64;

function dropZoneAtPoint(x: number, y: number, bounds: DOMRect): WorkbenchPaneDropZone {
  const horizontal = (x - bounds.left) / bounds.width;
  const vertical = (y - bounds.top) / bounds.height;
  const distances: Array<[WorkbenchPaneDropZone, number]> = [
    ["left", horizontal],
    ["right", 1 - horizontal],
    ["top", vertical],
    ["bottom", 1 - vertical],
  ];
  const [nearestZone, nearestDistance] = distances.reduce((nearest, current) => (
    current[1] < nearest[1] ? current : nearest
  ));
  return nearestDistance < 0.28 ? nearestZone : "center";
}

function sameDropTarget(first: PaneDropTarget | null, second: PaneDropTarget | null) {
  return first?.paneId === second?.paneId && first?.zone === second?.zone;
}

function SplitDivider({ node }: { node: Extract<WorkbenchLayoutNode, { type: "split" }> }) {
  const setSplitRatio = useWorkbenchStore((state) => state.setSplitRatio);

  const startResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const divider = event.currentTarget;
    const container = divider.parentElement as HTMLDivElement | null;
    if (!container) return;
    divider.setPointerCapture(event.pointerId);
    document.documentElement.classList.add(`is-resizing-${node.axis}`);
    let committedRatio = node.ratio;
    let frame = 0;

    const renderRatio = () => {
      frame = 0;
      const first = `${committedRatio}fr`;
      const second = `${1 - committedRatio}fr`;
      if (node.axis === "horizontal") container.style.gridTemplateColumns = `${first} 1px ${second}`;
      else container.style.gridTemplateRows = `${first} 1px ${second}`;
    };
    const handleMove = (moveEvent: PointerEvent) => {
      const bounds = container.getBoundingClientRect();
      const size = node.axis === "horizontal" ? bounds.width : bounds.height;
      const position = node.axis === "horizontal"
        ? moveEvent.clientX - bounds.left
        : moveEvent.clientY - bounds.top;
      const minimumPixels = node.axis === "horizontal" ? 240 : 150;
      const minimumRatio = Math.min(0.45, minimumPixels / Math.max(1, size));
      const rawRatio = position / Math.max(1, size);
      if (rawRatio < minimumRatio) committedRatio = minimumRatio - (minimumRatio - rawRatio) * 0.14;
      else if (rawRatio > 1 - minimumRatio) committedRatio = 1 - minimumRatio + (rawRatio - (1 - minimumRatio)) * 0.14;
      else committedRatio = rawRatio;
      if (!frame) frame = requestAnimationFrame(renderRatio);
    };
    const finish = () => {
      if (frame) cancelAnimationFrame(frame);
      divider.removeEventListener("pointermove", handleMove);
      divider.removeEventListener("pointerup", finish);
      divider.removeEventListener("pointercancel", finish);
      document.documentElement.classList.remove(`is-resizing-${node.axis}`);
      setSplitRatio(node.id, Math.min(0.85, Math.max(0.15, committedRatio)));
    };

    divider.addEventListener("pointermove", handleMove);
    divider.addEventListener("pointerup", finish, { once: true });
    divider.addEventListener("pointercancel", finish, { once: true });
  }, [node.axis, node.id, node.ratio, setSplitRatio]);

  return (
    <button
      type="button"
      className={`split-divider split-divider--${node.axis}`}
      role="separator"
      aria-label={node.axis === "horizontal" ? "调整左右面板宽度" : "调整上下面板高度"}
      aria-orientation={node.axis === "horizontal" ? "vertical" : "horizontal"}
      aria-valuemin={15}
      aria-valuemax={85}
      aria-valuenow={Math.round(node.ratio * 100)}
      onPointerDown={startResize}
      onDoubleClick={() => setSplitRatio(node.id, 0.5)}
    />
  );
}

function SplitLayoutNode({
  node,
  panes,
  activePaneId,
  draggingPaneId,
  dropTarget,
  onPaneDragStart,
}: SplitLayoutNodeProps) {
  if (node.type === "pane") {
    const pane = panes.get(node.paneId);
    if (!pane) return null;
    const dropZone = dropTarget?.paneId === pane.id ? dropTarget.zone : null;
    return (
      <div
        className={`workbench-pane-slot ${pane.id === activePaneId ? "is-active" : ""} ${pane.id === draggingPaneId ? "is-dragging" : ""}`}
        data-workbench-pane-id={pane.id}
      >
        <WorkbenchPaneView pane={pane} onPaneDragStart={onPaneDragStart} />
        {dropZone ? (
          <div className={`pane-drop-preview pane-drop-preview--${dropZone}`} aria-hidden="true">
            <span>{DROP_ZONE_LABELS[dropZone]}</span>
          </div>
        ) : null}
      </div>
    );
  }

  const style = {
    "--split-first": `${node.ratio}fr`,
    "--split-second": `${1 - node.ratio}fr`,
  } as CSSProperties;
  const childProps = { panes, activePaneId, draggingPaneId, dropTarget, onPaneDragStart };
  return (
    <div className={`split-layout split-layout--${node.axis}`} style={style}>
      <SplitLayoutNode node={node.children[0]} {...childProps} />
      <SplitDivider node={node} />
      <SplitLayoutNode node={node.children[1]} {...childProps} />
    </div>
  );
}

export function WorkbenchLayout() {
  const panes = useWorkbenchStore((state) => state.panes);
  const layout = useWorkbenchStore((state) => state.layout);
  const activePaneId = useWorkbenchStore((state) => state.activePaneId);
  const focusPane = useWorkbenchStore((state) => state.focusPane);
  const movePane = useWorkbenchStore((state) => state.movePane);
  const paneMap = useMemo(() => new Map(panes.map((pane) => [pane.id, pane])), [panes]);
  const [draggingPaneId, setDraggingPaneId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<PaneDropTarget | null>(null);
  const dragGhostRef = useRef<HTMLDivElement>(null);
  const dragPointRef = useRef({ x: 0, y: 0 });
  const dragFrameRef = useRef(0);

  const positionDragGhost = useCallback(() => {
    if (dragFrameRef.current) return;
    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = 0;
      const { x, y } = dragPointRef.current;
      if (dragGhostRef.current) dragGhostRef.current.style.transform = `translate3d(${x + 14}px, ${y + 14}px, 0)`;
    });
  }, []);

  const onPaneDragStart = useCallback((paneId: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || panes.length < 2) return;
    event.preventDefault();
    event.stopPropagation();
    focusPane(paneId);
    const handle = event.currentTarget;
    const origin = { x: event.clientX, y: event.clientY };
    let dragging = false;
    let latestTarget: PaneDropTarget | null = null;
    handle.setPointerCapture(event.pointerId);

    const handleMove = (moveEvent: PointerEvent) => {
      if (!dragging) {
        const deltaX = moveEvent.clientX - origin.x;
        const deltaY = moveEvent.clientY - origin.y;
        if ((deltaX * deltaX) + (deltaY * deltaY) < DRAG_THRESHOLD_SQUARED) return;
        dragging = true;
        setDraggingPaneId(paneId);
        document.documentElement.classList.add("is-pane-dragging");
      }
      moveEvent.preventDefault();
      dragPointRef.current = { x: moveEvent.clientX, y: moveEvent.clientY };
      positionDragGhost();

      const element = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      const paneElement = element?.closest<HTMLElement>("[data-workbench-pane-id]");
      const targetPaneId = paneElement?.dataset.workbenchPaneId;
      const nextTarget = paneElement && targetPaneId && targetPaneId !== paneId
        ? { paneId: targetPaneId, zone: dropZoneAtPoint(moveEvent.clientX, moveEvent.clientY, paneElement.getBoundingClientRect()) }
        : null;
      latestTarget = nextTarget;
      setDropTarget((current) => sameDropTarget(current, nextTarget) ? current : nextTarget);
    };
    const finish = () => {
      handle.removeEventListener("pointermove", handleMove);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
      document.documentElement.classList.remove("is-pane-dragging");
      if (dragFrameRef.current) cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = 0;
      setDraggingPaneId(null);
      setDropTarget(null);
      if (dragging && latestTarget) movePane(paneId, latestTarget.paneId, latestTarget.zone);
    };

    handle.addEventListener("pointermove", handleMove);
    handle.addEventListener("pointerup", finish, { once: true });
    handle.addEventListener("pointercancel", finish, { once: true });
  }, [focusPane, movePane, panes.length, positionDragGhost]);

  const draggedPane = draggingPaneId ? paneMap.get(draggingPaneId) : null;
  const draggedTab = draggedPane?.tabs.find((tab) => tab.id === draggedPane.activeTabId) ?? draggedPane?.tabs[0];

  return (
    <section className="workbench" aria-label="可调整的主工作区">
      <SplitLayoutNode
        node={layout}
        panes={paneMap}
        activePaneId={activePaneId}
        draggingPaneId={draggingPaneId}
        dropTarget={dropTarget}
        onPaneDragStart={onPaneDragStart}
      />
      {draggingPaneId ? (
        <div className="pane-drag-ghost" ref={dragGhostRef} aria-hidden="true">
          <GripVertical size={13} />
          <span>{draggedTab?.title ?? "空面板"}</span>
        </div>
      ) : null}
    </section>
  );
}
