import { useEffect, useRef } from "react";

/** Routes the platform save shortcut only to the file editor in the active pane. */
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
      // The editor displays save failures inline; consume the rejection here to avoid a global error.
      void Promise.resolve(onSaveRef.current()).catch(() => undefined);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
