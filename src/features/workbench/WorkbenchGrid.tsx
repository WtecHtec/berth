import { useWorkbenchStore } from "../../store/useWorkbenchStore";
import { WorkbenchPaneView } from "./WorkbenchPaneView";

export function WorkbenchGrid() {
  const panes = useWorkbenchStore((state) => state.panes);
  const layout = useWorkbenchStore((state) => state.gridLayout);
  const activePaneId = useWorkbenchStore((state) => state.activePaneId);

  return (
    <section
      className="workbench"
      aria-label={`${layout.columns} 列 ${layout.rows} 行主工作区`}
      style={{
        gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
      }}
    >
      {panes.map((pane) => (
        <div className={`workbench-pane-slot ${pane.id === activePaneId ? "is-active" : ""}`} key={pane.id}>
          <WorkbenchPaneView pane={pane} />
        </div>
      ))}
    </section>
  );
}
