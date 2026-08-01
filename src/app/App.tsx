import { CommandPalette } from "../features/commands/CommandPalette";
import { SettingsSheet } from "../features/settings/SettingsSheet";
import { TabCloseController } from "../features/workbench/TabCloseController";
import { AppShell } from "./AppShell";
import { useQuickPhraseSync } from "../hooks/useQuickPhraseSync";

export function App() {
  useQuickPhraseSync();
  return (
    <TabCloseController>
      <AppShell />
      <CommandPalette />
      <SettingsSheet />
    </TabCloseController>
  );
}
