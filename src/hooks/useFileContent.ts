import { useCallback, useEffect, useState } from "react";
import { desktopGateway } from "../app/services";
import { refreshGitWorkspace } from "./useGitWorkspace";
import { useWorkbenchStore } from "../store/useWorkbenchStore";

export function useFileContent(path?: string, enabled = true) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!path || !enabled) {
      setContent("");
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void desktopGateway.readTextFile(path).then((nextContent) => {
      if (!active) return;
      setContent(nextContent);
      setLoading(false);
    }).catch((cause) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setLoading(false);
    });
    return () => { active = false; };
  }, [enabled, path]);

  const save = useCallback(async (nextContent: string) => {
    if (!path) return;
    setSaving(true);
    setSaveError(null);
    try {
      await desktopGateway.writeTextFile(path, nextContent);
      setContent(nextContent);
      void refreshGitWorkspace(useWorkbenchStore.getState().workspaceRoots);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    } finally {
      setSaving(false);
    }
  }, [path]);

  return { content, loading, saving, error, saveError, save };
}
