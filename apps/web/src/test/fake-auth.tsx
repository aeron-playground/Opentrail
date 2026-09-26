import { act } from "@testing-library/react";
import { type ReactNode, useMemo, useState } from "react";
import type { Auth, AuthStatus, OAuthProvider } from "../features/auth/auth";
import { AuthContext } from "../features/auth/auth-context";

// Stand-ins for Privy: the one code that signs in, and the token the fake API accepts.
export const FAKE_CODE = "123456";
export const FAKE_TOKEN = "fake-access-token";

type State = { status: AuthStatus; oauthFailed: boolean };

export type FakeAuth = {
  Provider: (props: { children: ReactNode }) => ReactNode;
  calls: { emails: string[]; codes: string[]; oauth: OAuthProvider[]; signOuts: number };
  getAccessToken: () => Promise<string | null>;
  setState: (next: Partial<State>) => void;
};

type FakeAuthOptions = {
  status?: AuthStatus;
  oauthFailed?: boolean;
  sendCodeFails?: boolean;
  oauthFails?: boolean;
};

// An auth that behaves like Privy's: codes, sign-in, sign-out, tokens. No network.
export function createFakeAuth({
  status = "signed-out",
  oauthFailed = false,
  sendCodeFails = false,
  oauthFails = false,
}: FakeAuthOptions = {}): FakeAuth {
  const calls: FakeAuth["calls"] = { emails: [], codes: [], oauth: [], signOuts: 0 };
  let state: State = { status, oauthFailed };
  let render: (next: State) => void = () => {};
  const update = (next: Partial<State>) => {
    state = { ...state, ...next };
    render(state);
  };

  function Provider({ children }: { children: ReactNode }) {
    const [current, setCurrent] = useState(state);
    render = setCurrent;
    const auth = useMemo<Auth>(
      () => ({
        ...current,
        sendEmailCode: async (email) => {
          calls.emails.push(email);
          if (sendCodeFails) {
            throw new Error("fake: no code sent");
          }
        },
        signInWithEmailCode: async (code) => {
          calls.codes.push(code);
          if (code !== FAKE_CODE) {
            throw new Error("fake: wrong code");
          }
          update({ status: "signed-in" });
        },
        signInWithOAuth: async (provider) => {
          calls.oauth.push(provider);
          if (oauthFails) {
            throw new Error("fake: no redirect");
          }
        },
        signOut: async () => {
          calls.signOuts += 1;
          update({ status: "signed-out" });
        },
        getAccessToken: async () => (state.status === "signed-in" ? FAKE_TOKEN : null),
      }),
      [current],
    );
    return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
  }

  return {
    Provider,
    calls,
    getAccessToken: async () => (state.status === "signed-in" ? FAKE_TOKEN : null),
    setState: (next) => act(() => update(next)),
  };
}
