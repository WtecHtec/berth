import { CommandPalette } from "../features/commands/CommandPalette";
import { SettingsSheet } from "../features/settings/SettingsSheet";
import { AppShell } from "./AppShell";
import { useQuickPhraseSync } from "../hooks/useQuickPhraseSync";

export function App() {
  useQuickPhraseSync();
  return (
    <>
      <AppShell />
      <CommandPalette />
      <SettingsSheet />
    </>
  );
}
