import { useEffect, useState } from "react";
import type { FilePresentation } from "../../../domain/files/filePreview";
import { useLocalFileUrl } from "../../../hooks/useLocalFileUrl";
import { Volume2 } from "../../../shared/lib/icons";

interface MediaPreviewProps {
  path: string;
  title: string;
  presentation: Extract<FilePresentation, "image" | "video" | "audio">;
  active: boolean;
}

export function MediaPreview({ path, title, presentation, active }: MediaPreviewProps) {
  const { url, error } = useLocalFileUrl(path, active);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => setRenderError(null), [path, presentation]);

  if (error || renderError) {
    return <div className="content-state content-state--error">{error ?? renderError}</div>;
  }
  if (!url) return <div className="content-state">正在准备预览…</div>;

  return (
    <div className={`media-preview media-preview--${presentation}`}>
      {presentation === "image" ? (
        <img src={url} alt={title} onError={() => setRenderError("无法渲染该图片格式")} />
      ) : presentation === "video" ? (
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          onError={() => setRenderError("无法播放该视频格式或视频已损坏")}
        >
          当前系统不支持播放该视频。
        </video>
      ) : (
        <div className="audio-preview">
          <div className="audio-preview__identity" aria-hidden="true"><Volume2 size={23} /></div>
          <strong title={title}>{title}</strong>
          <audio
            src={url}
            controls
            preload="metadata"
            onError={() => setRenderError("无法播放该音频格式或音频已损坏")}
          >
            当前系统不支持播放该音频。
          </audio>
        </div>
      )}
    </div>
  );
}
