import { useCallback, useEffect, useRef, useState } from "react";
import { desktopGateway } from "../app/services";
import type { AiSessionSummary } from "../domain/workbench/models";
import { loadAiSessionCache, saveAiSessionCache } from "../infrastructure/persistence/aiSessionCache";
import { useWorkbenchStore } from "../store/useWorkbenchStore";

export const AI_SESSION_LIMIT_PER_PROVIDER = 20;
export type AiSessionRefreshPhase = "idle" | "refreshing" | "complete";

/** Loads cached metadata first, then refreshes bounded provider metadata in the background. */
export function useAiSessions() {
  const roots = useWorkbenchStore((state) => state.workspaceRoots);
  const [sessions, setSessions] = useState<AiSessionSummary[]>(() => loadAiSessionCache(roots));
  const [refreshPhase, setRefreshPhase] = useState<AiSessionRefreshPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const completionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (roots.length === 0) return;
    const request = ++requestSequence.current;
    if (completionTimer.current) clearTimeout(completionTimer.current);
    completionTimer.current = null;
    setRefreshPhase("refreshing");
    setError(null);
    let completed = false;
    try {
      const response = await desktopGateway.listAiSessions(roots, AI_SESSION_LIMIT_PER_PROVIDER);
      if (request !== requestSequence.current) return;
      setSessions(response.sessions);
      saveAiSessionCache(roots, response.sessions);
      setError(response.warnings.length > 0 ? response.warnings.join("；") : null);
      completed = true;
    } catch (cause) {
      if (request === requestSequence.current) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (request !== requestSequence.current) return;
      if (!completed) {
        setRefreshPhase("idle");
        return;
      }

      // Keep a brief, non-blocking completion state so fast local reads still feel acknowledged.
      setRefreshPhase("complete");
      completionTimer.current = setTimeout(() => {
        if (request === requestSequence.current) setRefreshPhase("idle");
        completionTimer.current = null;
      }, 420);
    }
  }, [roots]);

  useEffect(() => {
    setSessions(loadAiSessionCache(roots));
    void refresh();
    return () => {
      requestSequence.current += 1;
      if (completionTimer.current) clearTimeout(completionTimer.current);
      completionTimer.current = null;
    };
  }, [refresh, roots]);

  return {
    sessions,
    refreshing: refreshPhase === "refreshing",
    refreshPhase,
    error,
    refresh,
  };
}
