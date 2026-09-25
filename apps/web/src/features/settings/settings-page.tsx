import { Page } from "../../components/common/page";
import { ThemeSwitch } from "./theme-switch";

export function SettingsPage() {
  return (
    <Page title="Settings">
      <p className="mt-3 text-ink-2">Your account settings will show here once you've signed in.</p>
      <div className="mt-8">
        <ThemeSwitch />
      </div>
    </Page>
  );
}
