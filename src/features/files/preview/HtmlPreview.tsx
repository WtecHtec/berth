import { useState } from "react";
import { desktopGateway } from "../../../app/services";
import { useHtmlPreviewService } from "../../../hooks/useHtmlPreviewService";
import { ExternalLink } from "../../../shared/lib/icons";
import { IconButton } from "../../../shared/ui/IconButton";

interface HtmlPreviewProps {
  path: string;
  content: string;
  active: boolean;
  title: string;
}

export function HtmlPreview({ path, content, active, title }: HtmlPreviewProps) {
  const { url, loading, error } = useHtmlPreviewService(path, content, active);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  if (!active) return null;
  if (loading) return <div className="content-state">正在启动本地预览…</div>;
  if (error) return <div className="content-state content-state--error">{error}</div>;
  if (!url) return null;

  const openInSystemBrowser = async () => {
    if (opening) return;
    setOpening(true);
    setOpenError(null);
    try {
      await desktopGateway.openPreviewInSystemBrowser(url);
    } catch (cause) {
      setOpenError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="html-preview">
      <div className="html-preview__addressbar">
        <span className="html-preview__address" title={url}>{url}</span>
        {openError ? <span className="html-preview__open-error" role="alert">{openError}</span> : null}
        <IconButton
          label="在默认浏览器中打开预览"
          disabled={opening}
          onClick={() => void openInSystemBrowser()}
        >
          <ExternalLink size={13} />
        </IconButton>
      </div>
      <iframe
        className="html-preview-frame"
        src={url}
        title={`${title} HTML 预览`}
        sandbox="allow-downloads allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
      />
    </div>
  );
}
