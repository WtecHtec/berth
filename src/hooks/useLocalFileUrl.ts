import { useEffect, useState } from "react";
import { desktopGateway } from "../app/services";

interface LocalFileUrlState {
  url: string | null;
  error: string | null;
}

/** 仅在媒体视图可见时解析支持 Range 的 Tauri 本地资源地址。 */
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
