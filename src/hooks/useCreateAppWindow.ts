import { useCallback, useState } from "react";
import { desktopGateway } from "../app/services";

/** 编排新窗口创建，避免命令面板直接依赖 Tauri。 */
export function useCreateAppWindow() {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async () => {
    if (creating) return false;
    setCreating(true);
    setError(null);
    try {
      await desktopGateway.createWindow();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setCreating(false);
    }
  }, [creating]);

  return { create, creating, error };
}
