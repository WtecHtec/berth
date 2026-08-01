import { useCallback, useState } from "react";
import { desktopGateway } from "../app/services";

/** 封装异步系统终端跳转，使终端工具栏保持纯展示职责。 */
export function useOpenSystemTerminal(path?: string) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(async () => {
    if (!path || opening) return;
    setOpening(true);
    setError(null);
    try {
      await desktopGateway.openInSystemTerminal(path);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setOpening(false);
    }
  }, [opening, path]);

  return { open, opening, error };
}
