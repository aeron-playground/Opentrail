import { ShuffleIcon } from "@phosphor-icons/react/Shuffle";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import { USERNAME_CHANGE_DAYS } from "@repo/shared";
import { useId } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import type { UsernameCheck } from "./username-queries";
import { useSuggestUsername } from "./username-queries";

export const USERNAME_RULES = "3–20 letters, numbers or _, starting with a letter.";
export const USERNAME_CHANGE_RULE = `You can change it once every ${USERNAME_CHANGE_DAYS} days.`;

type UsernameFieldProps = {
  value: string;
  onChange: (value: string) => void;
  check: UsernameCheck;
};

// The username input with Shuffle, the rules, and a live answer to "can I have this name?".
export function UsernameField({ value, onChange, check }: UsernameFieldProps) {
  const inputId = useId();
  const rulesId = useId();
  const statusId = useId();
  const suggest = useSuggestUsername();

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="font-medium">
        Username
      </label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          name="username"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={20}
          aria-describedby={`${rulesId} ${statusId}`}
          aria-invalid={
            check.state === "invalid" || check.state === "reserved" || check.state === "taken"
          }
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <Button
          variant="secondary"
          disabled={suggest.isPending}
          onClick={() => suggest.mutate(undefined, { onSuccess: onChange })}
        >
          <ShuffleIcon size={20} aria-hidden="true" />
          Shuffle
        </Button>
      </div>
      <p id={rulesId} className="text-ink-2 text-meta">
        {USERNAME_RULES}
      </p>
      <p id={statusId} aria-live="polite" className="min-h-5 text-meta">
        <CheckMessage check={check} shuffleFailed={suggest.isError} />
      </p>
    </div>
  );
}

function CheckMessage({ check, shuffleFailed }: { check: UsernameCheck; shuffleFailed: boolean }) {
  if (shuffleFailed) {
    return <Problem>We couldn't suggest a name. Try again.</Problem>;
  }
  switch (check.state) {
    case "same":
      return <span className="text-ink-2">This is your username.</span>;
    case "checking":
      return <span className="text-ink-2">Checking…</span>;
    case "available":
      return <span className="text-ink-2">{check.username} is available.</span>;
    case "taken":
      return <Problem>That username is taken.</Problem>;
    case "reserved":
      return <Problem>That username isn't available.</Problem>;
    case "invalid":
      return <Problem>{USERNAME_RULES}</Problem>;
    case "error":
      return <Problem>We couldn't check that name. Try again.</Problem>;
  }
}

// Problems carry an icon, never color alone.
function Problem({ children }: { children: string }) {
  return (
    <span className="flex items-start gap-2">
      <WarningCircleIcon size={18} aria-hidden="true" className="mt-px shrink-0" />
      {children}
    </span>
  );
}

// Can this check be saved? The current name can be kept; a free one can be taken.
export function canSaveUsername(check: UsernameCheck): boolean {
  return check.state === "same" || check.state === "available";
}

// Turns a failed save into a sentence for the person.
export function usernameSaveError(code: string | undefined): string {
  switch (code) {
    case "USERNAME_TAKEN":
      return "That username is taken.";
    case "USERNAME_RESERVED":
      return "That username isn't available.";
    case "VALIDATION_FAILED":
      return USERNAME_RULES;
    case "USERNAME_CHANGE_TOO_SOON":
      return `You can change your username once every ${USERNAME_CHANGE_DAYS} days.`;
    default:
      return "We couldn't save your username. Try again.";
  }
}
