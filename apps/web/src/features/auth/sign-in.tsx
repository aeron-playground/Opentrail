import { GithubLogoIcon } from "@phosphor-icons/react/GithubLogo";
import { GoogleLogoIcon } from "@phosphor-icons/react/GoogleLogo";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import {
  createContext,
  type FormEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Sheet } from "../../components/ui/sheet";
import type { OAuthProvider } from "./auth";
import { useAuth } from "./auth-context";

export const SIGN_IN_UNAVAILABLE =
  "Sign-in isn't available right now. Reload the page to try again.";

const PROVIDER_NAMES: Record<OAuthProvider, string> = { google: "Google", github: "GitHub" };

type SignInContextValue = { openSignIn: () => void };

const SignInContext = createContext<SignInContextValue | null>(null);

export function useSignIn(): SignInContextValue {
  const value = useContext(SignInContext);
  if (!value) {
    throw new Error("useSignIn needs a SignInProvider above it.");
  }
  return value;
}

// Holds the one sign-in sheet of the app. Any page can open it with useSignIn().
export function SignInProvider({ children }: { children: ReactNode }) {
  const { status, oauthFailed } = useAuth();
  const [open, setOpen] = useState(false);

  // Back from Google or GitHub without a sign-in: reopen the sheet to say so.
  useEffect(() => {
    if (oauthFailed) {
      setOpen(true);
    }
  }, [oauthFailed]);

  // Signed in: the sheet's job is done.
  useEffect(() => {
    if (status === "signed-in") {
      setOpen(false);
    }
  }, [status]);

  const close = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ openSignIn: () => setOpen(true) }), []);

  return (
    <SignInContext.Provider value={value}>
      {children}
      <Sheet open={open} onClose={close} labelledBy="sign-in-title">
        {/* Mounted only while open, so every visit starts from the first step. */}
        {open && <SignInForm />}
      </Sheet>
    </SignInContext.Provider>
  );
}

type Busy = "send-code" | "sign-in" | OAuthProvider | null;

function SignInForm() {
  const auth = useAuth();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(
    auth.oauthFailed ? "We couldn't finish signing you in. Try again." : null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const emailId = useId();
  const codeId = useId();
  // Privy is still loading: the form shows, and its buttons wait.
  const waiting = auth.status === "loading";

  if (auth.status === "unavailable") {
    return (
      <>
        <Title>Sign in or create an account</Title>
        <p className="mt-3 text-ink-2">{SIGN_IN_UNAVAILABLE}</p>
      </>
    );
  }

  async function sendCode(event?: FormEvent) {
    event?.preventDefault();
    setBusy("send-code");
    setError(null);
    setNotice(null);
    try {
      await auth.sendEmailCode(email.trim());
      if (step === "code") {
        setNotice("We sent a new code.");
      }
      setStep("code");
      setCode("");
    } catch {
      setError("We couldn't send a code to that address. Check it and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy("sign-in");
    setError(null);
    setNotice(null);
    try {
      // Success closes the sheet (see SignInProvider).
      await auth.signInWithEmailCode(code.trim());
    } catch {
      setError("That code didn't work. Check it, or send a new code.");
      setBusy(null);
    }
  }

  async function continueWith(provider: OAuthProvider) {
    setBusy(provider);
    setError(null);
    try {
      // Leaves the page; Google or GitHub send the person back here.
      await auth.signInWithOAuth(provider);
    } catch {
      setError(`We couldn't open ${PROVIDER_NAMES[provider]}. Try again.`);
      setBusy(null);
    }
  }

  if (step === "code") {
    return (
      <>
        <Title>Check your email</Title>
        <p className="mt-3 text-ink-2">
          Enter the code we sent to <span className="font-medium text-ink">{email.trim()}</span>.
        </p>
        <form onSubmit={signIn} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor={codeId} className="font-medium">
              Code
            </label>
            <Input
              id={codeId}
              name="code"
              // The sheet is already open when this step appears, so focus moves here by hand.
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            />
          </div>
          <Message error={error} notice={notice} />
          <Button type="submit" disabled={busy !== null || code.length < 6}>
            {busy === "sign-in" ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="ghost" disabled={busy !== null} onClick={() => sendCode()}>
            {busy === "send-code" ? "Sending code…" : "Send a new code"}
          </Button>
          <Button
            variant="ghost"
            disabled={busy !== null}
            onClick={() => {
              setStep("email");
              setError(null);
              setNotice(null);
            }}
          >
            Use another email
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <Title>Sign in or create an account</Title>
      <p className="mt-3 text-ink-2">We'll email you a code. There's no password to remember.</p>
      <form onSubmit={sendCode} className="mt-6 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor={emailId} className="font-medium">
            Email
          </label>
          <Input
            id={emailId}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <Message error={error} notice={null} />
        <Button type="submit" disabled={waiting || busy !== null}>
          {busy === "send-code" ? "Sending code…" : "Send code"}
        </Button>
      </form>
      <div className="my-5 flex items-center gap-3 text-ink-3 text-meta">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <div className="flex flex-col gap-3">
        {(["google", "github"] as const).map((provider) => {
          const ProviderIcon = provider === "google" ? GoogleLogoIcon : GithubLogoIcon;
          return (
            <Button
              key={provider}
              variant="secondary"
              disabled={waiting || busy !== null}
              onClick={() => continueWith(provider)}
            >
              <ProviderIcon size={20} aria-hidden="true" />
              {busy === provider
                ? `Opening ${PROVIDER_NAMES[provider]}…`
                : `Continue with ${PROVIDER_NAMES[provider]}`}
            </Button>
          );
        })}
      </div>
      {waiting && (
        <p role="status" className="mt-4 text-ink-2 text-meta">
          Getting sign-in ready…
        </p>
      )}
    </>
  );
}

function Title({ children }: { children: ReactNode }) {
  return (
    <h2 id="sign-in-title" className="pr-10 font-semibold text-section">
      {children}
    </h2>
  );
}

// Errors say what happened and what to do; an icon marks them, never color alone.
function Message({ error, notice }: { error: string | null; notice: string | null }) {
  if (error) {
    return (
      <p role="alert" className="flex items-start gap-2 text-meta">
        <WarningCircleIcon size={18} aria-hidden="true" className="mt-px shrink-0" />
        {error}
      </p>
    );
  }
  if (notice) {
    return (
      <p role="status" className="text-ink-2 text-meta">
        {notice}
      </p>
    );
  }
  return null;
}
