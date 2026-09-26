import { formatExactTime } from "@repo/format";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { Page } from "../../components/common/page";
import { Button } from "../../components/ui/button";
import { ApiError } from "../../lib/api";
import type { Me } from "../account/use-me";
import { USERNAME_CHANGE_RULE, UsernameField, usernameSaveError } from "../account/username-field";
import { useChangeUsername, useUsernameCheck } from "../account/username-queries";
import { WithAccount } from "../account/with-account";
import { useAuth } from "../auth/auth-context";
import { ThemeSwitch } from "./theme-switch";

export function SettingsPage() {
  return (
    <Page title="Settings">
      <section aria-labelledby="account-title" className="mt-8">
        <h2 id="account-title" className="font-semibold text-section">
          Account
        </h2>
        <div className="mt-2">
          <WithAccount>
            {(me) => (
              <>
                <UsernameRow me={me} />
                <WalletRow me={me} />
              </>
            )}
          </WithAccount>
        </div>
        <SignOutButton />
      </section>
      <div className="mt-10">
        <ThemeSwitch />
      </div>
    </Page>
  );
}

const rowClass = "flex flex-col gap-3 border-line border-b py-4";

function UsernameRow({ me }: { me: Me }) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const changeableAt = me.usernameChangeableAt === null ? null : new Date(me.usernameChangeableAt);

  if (editing) {
    return (
      <UsernameForm
        me={me}
        onDone={(username) => {
          setEditing(false);
          setSaved(username === me.username ? null : `Your username is now ${username}.`);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }
  return (
    <div className={rowClass}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">Username</p>
          <p className="text-ink-2">{me.username}</p>
        </div>
        {changeableAt === null && (
          <Button
            variant="secondary"
            onClick={() => {
              setSaved(null);
              setEditing(true);
            }}
          >
            Change
          </Button>
        )}
      </div>
      {changeableAt !== null && (
        <p className="text-ink-2 text-meta">
          You can change it again on {formatExactTime(changeableAt)}.
        </p>
      )}
      <p role="status" className="text-ink-2 text-meta empty:hidden">
        {saved ?? ""}
      </p>
    </div>
  );
}

function UsernameForm({
  me,
  onDone,
  onCancel,
}: {
  me: Me;
  onDone: (username: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(me.username);
  const check = useUsernameCheck(value, me.username);
  const change = useChangeUsername();

  function save(event: FormEvent) {
    event.preventDefault();
    change.mutate(check.username, { onSuccess: (updated) => onDone(updated.username) });
  }

  return (
    <form onSubmit={save} className={rowClass}>
      <UsernameField value={value} onChange={setValue} check={check} />
      <p className="text-ink-2">{USERNAME_CHANGE_RULE}</p>
      {change.isError && (
        <p role="alert">
          {usernameSaveError(change.error instanceof ApiError ? change.error.code : undefined)}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={check.state !== "available" || change.isPending}>
          {change.isPending ? "Saving…" : "Save"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function WalletRow({ me }: { me: Me }) {
  const auth = useAuth();
  const [failed, setFailed] = useState(false);

  async function exportWallet() {
    setFailed(false);
    try {
      await auth.exportWallet(me.walletAddress);
    } catch {
      setFailed(true);
    }
  }

  return (
    <div className={rowClass}>
      <div>
        <p className="font-medium">Wallet</p>
        <p className="text-ink-2">
          Export your wallet's private key to use it in another wallet app. Privy shows it in its
          own secure window; we never see it.
        </p>
      </div>
      <div>
        <Button variant="secondary" onClick={exportWallet}>
          Export wallet
        </Button>
      </div>
      {failed && <p role="alert">We couldn't open the export window. Try again.</p>}
    </div>
  );
}

function SignOutButton() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await auth.signOut();
      await navigate({ to: "/" });
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <Button variant="secondary" className="mt-6" disabled={signingOut} onClick={signOut}>
      {signingOut ? "Signing out…" : "Sign out"}
    </Button>
  );
}
