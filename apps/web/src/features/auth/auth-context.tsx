import { createContext, useContext } from "react";
import type { Auth } from "./auth";

export const AuthContext = createContext<Auth | null>(null);

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) {
    throw new Error("useAuth needs an auth provider above it.");
  }
  return auth;
}

// Before Privy has loaded, and when it can't: nobody is signed in and every sign-in step fails.
export function placeholderAuth(status: "loading" | "unavailable"): Auth {
  const refuse = () => Promise.reject(new Error("Sign-in isn't ready."));
  return {
    status,
    oauthFailed: false,
    sendEmailCode: refuse,
    signInWithEmailCode: refuse,
    signInWithOAuth: refuse,
    signOut: async () => {},
    getAccessToken: async () => null,
  };
}
