import { useEffect, useRef } from "react";

/** 只把系统保存快捷键路由给当前活动面板中的文件编辑器。 */
export function useFileSaveShortcut(enabled: boolean, onSave: () => void | Promise<void>) {
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      // 编辑器会就地展示保存失败，此处消费 rejection，避免升级为全局错误。
      void Promise.resolve(onSaveRef.current()).catch(() => undefined);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
