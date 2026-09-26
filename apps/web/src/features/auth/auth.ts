// What the app knows about sign-in. Only this folder talks to Privy; everything else uses Auth,
// so tests can hand the app a fake.

export type AuthStatus =
  | "loading"
  // Privy isn't configured here, or couldn't load: the rest of the app still works.
  | "unavailable"
  | "signed-out"
  | "signed-in";

export type OAuthProvider = "google" | "github";

export type Auth = {
  status: AuthStatus;
  /** True when the person came back from Google or GitHub without being signed in. */
  oauthFailed: boolean;
  sendEmailCode(email: string): Promise<void>;
  signInWithEmailCode(code: string): Promise<void>;
  /** Leaves the page for Google or GitHub, which send the person back signed in. */
  signInWithOAuth(provider: OAuthProvider): Promise<void>;
  signOut(): Promise<void>;
  /** A fresh access token for the API, or null when nobody is signed in. */
  getAccessToken(): Promise<string | null>;
};
