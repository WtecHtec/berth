import { CommandPalette } from "../features/commands/CommandPalette";
import { SettingsSheet } from "../features/settings/SettingsSheet";
import { TabCloseController } from "../features/workbench/TabCloseController";
import { AppShell } from "./AppShell";
import { useQuickPhraseSync } from "../hooks/useQuickPhraseSync";
import { useCommandEnvironmentSync } from "../hooks/useCommandEnvironmentSync";
import { usePinnedTerminalSync } from "../hooks/usePinnedTerminalSync";

export function App() {
  useQuickPhraseSync();
  useCommandEnvironmentSync();
  usePinnedTerminalSync();
  return (
    <TabCloseController>
      <AppShell />
      <CommandPalette />
      <SettingsSheet />
    </TabCloseController>
  );
}
