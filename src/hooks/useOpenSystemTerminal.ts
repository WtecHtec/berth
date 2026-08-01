import { useCallback, useState } from "react";
import { desktopGateway } from "../app/services";

/** Owns the async desktop handoff so the terminal toolbar stays presentational. */
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
