import { useEffect, useState } from "react";
import { desktopGateway } from "../app/services";

interface LocalFileUrlState {
  url: string | null;
  error: string | null;
}

/** Resolves Tauri's range-aware asset URL only while a media surface is visible. */
export function useLocalFileUrl(path: string | undefined, enabled: boolean): LocalFileUrlState {
  const [state, setState] = useState<LocalFileUrlState>({ url: null, error: null });

  useEffect(() => {
    if (!path || !enabled) {
      setState({ url: null, error: null });
      return;
    }
    let disposed = false;
    setState({ url: null, error: null });
    void desktopGateway.resolveLocalFileUrl(path).then((url) => {
      if (!disposed) setState({ url, error: null });
    }).catch((cause) => {
      if (!disposed) setState({ url: null, error: cause instanceof Error ? cause.message : String(cause) });
    });
    return () => { disposed = true; };
  }, [enabled, path]);

  return state;
}
