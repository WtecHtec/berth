import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { WorkbenchGridLayout, WorkbenchLayoutPreset } from "../../domain/workbench/models";
import {
  inferGridLayout,
  inferLayoutPreset,
  MAX_GRID_TRACKS,
} from "../../domain/workbench/splitLayout";
import { Check, LayoutGrid } from "../../shared/lib/icons";
import { IconButton } from "../../shared/ui/IconButton";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";

const FLEXIBLE_PRESETS: Array<{ id: WorkbenchLayoutPreset; label: string }> = [
  { id: "main-left", label: "主区域在左" },
  { id: "main-right", label: "主区域在右" },
  { id: "main-top", label: "主区域在上" },
];

function LayoutPresetPreview({ preset }: { preset: WorkbenchLayoutPreset }) {
  return (
    <span className={`layout-preset-preview layout-preset-preview--${preset}`} aria-hidden="true">
      {Array.from({ length: 3 }, (_, index) => <i key={index} />)}
    </span>
  );
}

export function LayoutPicker() {
  const layout = useWorkbenchStore((state) => state.layout);
  const applyGridLayout = useWorkbenchStore((state) => state.applyGridLayout);
  const applyLayoutPreset = useWorkbenchStore((state) => state.applyLayoutPreset);
  const [open, setOpen] = useState(false);
  const [hoveredGrid, setHoveredGrid] = useState<WorkbenchGridLayout | null>(null);
  const [continuityNotice, setContinuityNotice] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const currentGrid = inferGridLayout(layout);
  const currentPreset = inferLayoutPreset(layout);
  const currentLabel = currentGrid
    ? `${currentGrid.columns} × ${currentGrid.rows}`
    : FLEXIBLE_PRESETS.find((preset) => preset.id === currentPreset)?.label ?? "自定义";
  const gridPreview = hoveredGrid ?? currentGrid;

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useEffect(() => () => {
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
  }, []);

  const showTerminalContinuityNotice = () => {
    const terminalCount = useWorkbenchStore.getState().panes
      .flatMap((pane) => pane.tabs)
      .filter((tab) => tab.kind === "terminal").length;
    if (terminalCount === 0) return;
    setContinuityNotice(`布局已更新，${terminalCount} 个终端保持运行`);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setContinuityNotice(null), 2400);
  };

  const selectPreset = (preset: WorkbenchLayoutPreset) => {
    applyLayoutPreset(preset);
    showTerminalContinuityNotice();
    setOpen(false);
  };

  const selectGrid = (grid: WorkbenchGridLayout) => {
    applyGridLayout(grid);
    showTerminalContinuityNotice();
    setHoveredGrid(null);
    setOpen(false);
  };

  return (
    <>
      <div className="layout-picker" ref={rootRef}>
        <IconButton
          label={`工作区布局：${currentLabel}`}
          variant="glass"
          className={open ? "is-active" : ""}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <LayoutGrid size={15} />
        </IconButton>
        {open ? (
          <div className="layout-popover" role="dialog" aria-label="选择工作区布局">
            <div className="layout-popover__title">
              <div>
                <span>工作区</span>
                <strong>选择布局</strong>
              </div>
              <em>{currentLabel}</em>
            </div>
            <section className="layout-grid-section" aria-labelledby="regular-grid-heading">
              <div className="layout-section-heading">
                <strong id="regular-grid-heading">规则网格</strong>
                <span>{gridPreview ? `${gridPreview.columns} × ${gridPreview.rows}` : "选择"}</span>
              </div>
              <div
                className="layout-grid-options"
                onPointerLeave={() => setHoveredGrid(null)}
                style={{ gridTemplateColumns: `repeat(${MAX_GRID_TRACKS}, 1fr)` }}
              >
                {Array.from({ length: MAX_GRID_TRACKS ** 2 }, (_, index) => {
                  const row = Math.floor(index / MAX_GRID_TRACKS) + 1;
                  const column = index % MAX_GRID_TRACKS + 1;
                  const highlighted = Boolean(gridPreview && row <= gridPreview.rows && column <= gridPreview.columns);
                  return (
                    <button
                      type="button"
                      key={`${column}x${row}`}
                      className={highlighted ? "is-highlighted" : ""}
                      aria-label={`设置为 ${column} 列 ${row} 行`}
                      onPointerEnter={() => setHoveredGrid({ rows: row, columns: column })}
                      onFocus={() => setHoveredGrid({ rows: row, columns: column })}
                      onClick={() => selectGrid({ rows: row, columns: column })}
                    />
                  );
                })}
              </div>
            </section>
            <section className="layout-flexible-section" aria-labelledby="flexible-layout-heading">
              <div className="layout-section-heading">
                <strong id="flexible-layout-heading">灵活布局</strong>
                <span>可继续拖动调整</span>
              </div>
              <div className="layout-preset-list">
                {FLEXIBLE_PRESETS.map((preset) => (
                  <button
                    type="button"
                    key={preset.id}
                    className={currentPreset === preset.id ? "is-selected" : ""}
                    aria-pressed={currentPreset === preset.id}
                    onClick={() => selectPreset(preset.id)}
                  >
                    <LayoutPresetPreview preset={preset.id} />
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            </section>
            <p>规则网格与自由分割可以随时切换</p>
          </div>
        ) : null}
      </div>
      {continuityNotice ? createPortal(
        <div className="layout-continuity-notice" role="status" aria-live="polite">
          <Check size={13} />
          <span>{continuityNotice}</span>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
