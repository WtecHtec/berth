import { useEffect } from "react";
import { subscribeToQuickPhrases } from "../infrastructure/persistence/quickPhraseRepository";
import { useWorkbenchStore } from "../store/useWorkbenchStore";

/** 同步其他应用窗口产生的快捷短语变更。 */
export function useQuickPhraseSync() {
  useEffect(() => subscribeToQuickPhrases((phrases) => {
    useWorkbenchStore.getState().replacePhrases(phrases);
  }), []);
}
