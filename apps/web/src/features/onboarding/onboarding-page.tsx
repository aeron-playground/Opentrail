import { APP_NAME } from "@repo/shared";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { Page } from "../../components/common/page";
import { Button } from "../../components/ui/button";
import { ApiError } from "../../lib/api";
import type { Me } from "../account/use-me";
import {
  canSaveUsername,
  USERNAME_CHANGE_RULE,
  UsernameField,
  usernameSaveError,
} from "../account/username-field";
import { useChangeUsername, useUsernameCheck } from "../account/username-queries";
import { WithAccount } from "../account/with-account";
import { AddFundsDetails } from "../wallet/add-funds-details";

// Two steps after the first sign-in: choose a username, then see where to add funds. The step
// follows the account: until a name is chosen, it's the name.
export function OnboardingPage() {
  return (
    <WithAccount>
      {(me) => (me.usernameChosen ? <AddFundsStep me={me} /> : <UsernameStep me={me} />)}
    </WithAccount>
  );
}

function UsernameStep({ me }: { me: Me }) {
  const [value, setValue] = useState(me.username);
  const check = useUsernameCheck(value, me.username);
  const change = useChangeUsername();

  function save(event: FormEvent) {
    event.preventDefault();
    change.mutate(check.username);
  }

  return (
    <Page title="Choose your username">
      <p className="mt-3 text-ink-2">This is how people see you on {APP_NAME}.</p>
      <form onSubmit={save} className="mt-6 flex flex-col gap-4">
        <UsernameField value={value} onChange={setValue} check={check} />
        <div className="flex flex-col gap-1 text-ink-2">
          <p>{USERNAME_CHANGE_RULE}</p>
          <p>Your username, trades and holdings are public.</p>
        </div>
        {change.isError && (
          <p role="alert">
            {usernameSaveError(change.error instanceof ApiError ? change.error.code : undefined)}
          </p>
        )}
        <div>
          <Button type="submit" disabled={!canSaveUsername(check) || change.isPending}>
            {change.isPending ? "Saving…" : "Continue"}
          </Button>
        </div>
      </form>
    </Page>
  );
}

function AddFundsStep({ me }: { me: Me }) {
  const navigate = useNavigate();
  return (
    <Page title="Add funds">
      <p className="mt-3 text-ink-2">
        Send USDC to trade with, and a little SOL for network fees, to your wallet.
      </p>
      <div className="mt-6">
        <AddFundsDetails address={me.walletAddress} />
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button onClick={() => navigate({ to: "/portfolio" })}>Done</Button>
        <Button variant="ghost" onClick={() => navigate({ to: "/" })}>
          I'll do this later
        </Button>
      </div>
    </Page>
  );
}
