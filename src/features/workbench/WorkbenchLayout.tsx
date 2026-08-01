import {
  useCallback,
  useMemo,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  WorkbenchLayoutNode,
  WorkbenchPane,
} from "../../domain/workbench/models";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";
import { WorkbenchPaneView } from "./WorkbenchPaneView";

interface SplitLayoutNodeProps {
  node: WorkbenchLayoutNode;
  panes: Map<string, WorkbenchPane>;
  activePaneId: string;
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
}: SplitLayoutNodeProps) {
  if (node.type === "pane") {
    const pane = panes.get(node.paneId);
    if (!pane) return null;
    return (
      <div className={`workbench-pane-slot ${pane.id === activePaneId ? "is-active" : ""}`}>
        <WorkbenchPaneView pane={pane} />
      </div>
    );
  }

  const style = {
    "--split-first": `${node.ratio}fr`,
    "--split-second": `${1 - node.ratio}fr`,
  } as CSSProperties;
  const childProps = { panes, activePaneId };
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
  const paneMap = useMemo(() => new Map(panes.map((pane) => [pane.id, pane])), [panes]);

  return (
    <section className="workbench" aria-label="可调整的主工作区">
      <SplitLayoutNode
        node={layout}
        panes={paneMap}
        activePaneId={activePaneId}
      />
    </section>
  );
}
