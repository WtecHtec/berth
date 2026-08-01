import { useCallback, useEffect, useRef, useState } from "react";
import { gitGateway } from "../app/services";
import type { GitDiffResult, GitDiffTarget } from "../domain/git/models";

const EMPTY_DIFF: GitDiffResult = { content: "", truncated: false };

export function useGitDiff(target: GitDiffTarget, revision: number, active: boolean) {
  const [result, setResult] = useState<GitDiffResult>(EMPTY_DIFF);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const next = await gitGateway.fileDiff(
        target.repositoryRoot,
        target.path,
        target.mode === "staged",
      );
      if (request === requestRef.current) setResult(next);
    } catch (reason) {
      if (request === requestRef.current) {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [target.mode, target.path, target.repositoryRoot]);

  useEffect(() => {
    if (active) void load();
    return () => { requestRef.current += 1; };
  }, [active, load, revision]);

  return { ...result, loading, error, reload: load };
}
