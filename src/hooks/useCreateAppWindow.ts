import { useCallback, useState } from "react";
import { desktopGateway } from "../app/services";

/** Coordinates new-window creation without coupling command UI to Tauri. */
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
