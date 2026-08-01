import { useEffect, useState } from "react";
import { desktopGateway } from "../app/services";
import type { TreeNode } from "../domain/workbench/models";
import { useWorkbenchStore } from "../store/useWorkbenchStore";

const SEARCH_DEBOUNCE_MS = 120;

/** Owns asynchronous workspace search while keeping filesystem I/O out of UI components. */
export function useFileSearch(enabled: boolean) {
  const roots = useWorkbenchStore((state) => state.workspaceRoots);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!enabled || normalizedQuery.length === 0 || roots.length === 0) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    setResults([]);
    const timer = window.setTimeout(() => {
      void desktopGateway.searchFiles(roots, normalizedQuery).then((matches) => {
        if (!active) return;
        setResults(matches);
        setLoading(false);
      }).catch((cause) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setLoading(false);
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [enabled, query, roots]);

  const clear = () => {
    setQuery("");
    setResults([]);
    setLoading(false);
    setError(null);
  };

  return { query, setQuery, results, loading, error, clear };
}
