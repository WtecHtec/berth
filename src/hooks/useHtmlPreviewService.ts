import { useEffect, useState } from "react";
import { desktopGateway } from "../app/services";

interface HtmlPreviewState {
  url: string | null;
  loading: boolean;
  error: string | null;
}

const IDLE_STATE: HtmlPreviewState = { url: null, loading: false, error: null };

/** 独占一个 HTML 预览服务，并保证标签或模式切换时停止服务。 */
export function useHtmlPreviewService(
  path: string | undefined,
  content: string,
  enabled: boolean,
): HtmlPreviewState {
  const [state, setState] = useState<HtmlPreviewState>(IDLE_STATE);

  useEffect(() => {
    if (!path || !enabled) {
      setState(IDLE_STATE);
      return;
    }

    let disposed = false;
    let sessionId: string | null = null;
    setState({ url: null, loading: true, error: null });

    void desktopGateway.startHtmlPreview(path, content).then((session) => {
      sessionId = session.id;
      if (disposed) {
        void desktopGateway.stopHtmlPreview(session.id);
        return;
      }
      setState({ url: session.url, loading: false, error: null });
    }).catch((cause) => {
      if (!disposed) {
        setState({ url: null, loading: false, error: cause instanceof Error ? cause.message : String(cause) });
      }
    });

    return () => {
      disposed = true;
      if (sessionId) void desktopGateway.stopHtmlPreview(sessionId);
    };
  }, [content, enabled, path]);

  return state;
}
