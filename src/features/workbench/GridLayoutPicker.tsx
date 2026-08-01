import { useEffect, useRef, useState } from "react";
import { MAX_GRID_TRACKS } from "../../domain/workbench/gridLayout";
import type { WorkbenchGridLayout } from "../../domain/workbench/models";
import { LayoutGrid } from "../../shared/lib/icons";
import { IconButton } from "../../shared/ui/IconButton";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";

export function GridLayoutPicker() {
  const layout = useWorkbenchStore((state) => state.gridLayout);
  const setGridLayout = useWorkbenchStore((state) => state.setGridLayout);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<WorkbenchGridLayout | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const preview = hovered ?? layout;

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const selectLayout = (nextLayout: WorkbenchGridLayout) => {
    setGridLayout(nextLayout);
    setOpen(false);
    setHovered(null);
  };

  return (
    <div className="grid-layout-picker" ref={rootRef}>
      <IconButton
        label={`工作区布局：${layout.columns} 列 ${layout.rows} 行`}
        variant="glass"
        className={open ? "is-active" : ""}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <LayoutGrid size={15} />
      </IconButton>
      {open ? (
        <div className="grid-layout-popover" role="dialog" aria-label="选择工作区网格布局">
          <div className="grid-layout-popover__title">
            <strong>工作区布局</strong>
            <span>{preview.columns} × {preview.rows}</span>
          </div>
          <div
            className="grid-layout-options"
            onPointerLeave={() => setHovered(null)}
            style={{ gridTemplateColumns: `repeat(${MAX_GRID_TRACKS}, 1fr)` }}
          >
            {Array.from({ length: MAX_GRID_TRACKS ** 2 }, (_, index) => {
              const row = Math.floor(index / MAX_GRID_TRACKS) + 1;
              const column = index % MAX_GRID_TRACKS + 1;
              const highlighted = row <= preview.rows && column <= preview.columns;
              return (
                <button
                  type="button"
                  key={`${column}x${row}`}
                  className={highlighted ? "is-highlighted" : ""}
                  aria-label={`设置为 ${column} 列 ${row} 行`}
                  onPointerEnter={() => setHovered({ rows: row, columns: column })}
                  onFocus={() => setHovered({ rows: row, columns: column })}
                  onClick={() => selectLayout({ rows: row, columns: column })}
                />
              );
            })}
          </div>
          <p>选择最多 4 × 4 的面板网格</p>
        </div>
      ) : null}
    </div>
  );
}
