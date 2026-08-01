import { AppWindow, Search, Settings2, SquareTerminal } from "../../shared/lib/icons";
import { useCreateAppWindow } from "../../hooks/useCreateAppWindow";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";

const commands = [
  { icon: SquareTerminal, label: "新建终端", action: "terminal" },
  { icon: AppWindow, label: "新窗口", action: "window" },
  { icon: Settings2, label: "打开 Berth 设置", action: "settings" },
] as const;

export function CommandPalette() {
  const open = useWorkbenchStore((state) => state.commandPaletteOpen);
  const setOpen = useWorkbenchStore((state) => state.setCommandPaletteOpen);
  const setSettingsOpen = useWorkbenchStore((state) => state.setSettingsOpen);
  const createTerminal = useWorkbenchStore((state) => state.createTerminal);
  const newWindow = useCreateAppWindow();

  if (!open) return null;
  return (
    <div className="modal-scrim" role="presentation" onMouseDown={() => setOpen(false)}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="命令面板" onMouseDown={(event) => event.stopPropagation()}>
        <div className="command-palette__input"><Search size={17} /><input autoFocus placeholder="搜索文件或运行命令" aria-label="搜索命令" /></div>
        <div className="command-palette__label">建议</div>
        <div className="command-list">
          {commands.map((command, index) => {
            const Icon = command.icon;
            return (
              <button
                key={command.label}
                type="button"
                className={index === 0 ? "is-selected" : ""}
                onClick={() => {
                  if (command.action === "window") {
                    void newWindow.create().then((created) => {
                      if (created) setOpen(false);
                    });
                    return;
                  }
                  setOpen(false);
                  if (command.action === "settings") setSettingsOpen(true);
                  if (command.action === "terminal") createTerminal();
                }}
                disabled={command.action === "window" && newWindow.creating}
              >
                <span><Icon size={15} />{command.action === "window" && newWindow.creating ? "正在创建窗口…" : command.label}</span>
              </button>
            );
          })}
        </div>
        {newWindow.error ? <div className="command-action-error" role="alert">{newWindow.error}</div> : null}
      </section>
    </div>
  );
}
