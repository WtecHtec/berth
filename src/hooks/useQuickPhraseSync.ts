import { useEffect } from "react";
import { subscribeToQuickPhrases } from "../infrastructure/persistence/quickPhraseRepository";
import { useWorkbenchStore } from "../store/useWorkbenchStore";

/** Synchronizes phrase edits arriving from another application window. */
export function useQuickPhraseSync() {
  useEffect(() => subscribeToQuickPhrases((phrases) => {
    useWorkbenchStore.getState().replacePhrases(phrases);
  }), []);
}
