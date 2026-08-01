import { create } from "zustand";
import type { GitRepository, GitWorkspaceStatus } from "../domain/git/models";

type GitOperation = "stage" | "unstage";

interface GitState {
  repositories: GitRepository[];
  warnings: string[];
  ignoredPaths: Record<string, true>;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  revision: number;
  busyPaths: Record<string, GitOperation>;
  beginRefresh(initial: boolean): void;
  finishRefresh(result: GitWorkspaceStatus): void;
  failRefresh(error: string): void;
  replaceIgnoredPaths(paths: string[]): void;
  beginOperation(path: string, operation: GitOperation): void;
  finishOperation(path: string): void;
  setError(error: string | null): void;
  clear(): void;
}

export const useGitStore = create<GitState>((set) => ({
  repositories: [],
  warnings: [],
  ignoredPaths: {},
  loading: false,
  refreshing: false,
  error: null,
  revision: 0,
  busyPaths: {},
  beginRefresh(initial) {
    set((state) => ({
      loading: initial && state.repositories.length === 0,
      refreshing: !initial,
      error: null,
    }));
  },
  finishRefresh(result) {
    set((state) => ({
      repositories: result.repositories,
      warnings: result.warnings,
      loading: false,
      refreshing: false,
      error: null,
      revision: state.revision + 1,
    }));
  },
  failRefresh(error) {
    set({ loading: false, refreshing: false, error });
  },
  replaceIgnoredPaths(paths) {
    set({ ignoredPaths: Object.fromEntries(paths.map((path) => [path, true])) });
  },
  beginOperation(path, operation) {
    set((state) => ({
      error: null,
      busyPaths: { ...state.busyPaths, [path]: operation },
    }));
  },
  finishOperation(path) {
    set((state) => {
      const busyPaths = { ...state.busyPaths };
      delete busyPaths[path];
      return { busyPaths };
    });
  },
  setError(error) { set({ error }); },
  clear() {
    set((state) => ({
      repositories: [],
      warnings: [],
      ignoredPaths: {},
      loading: false,
      refreshing: false,
      error: null,
      busyPaths: {},
      revision: state.revision + 1,
    }));
  },
}));
