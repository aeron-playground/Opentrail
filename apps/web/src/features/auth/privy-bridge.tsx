import {
  type PrivyClientConfig,
  PrivyProvider,
  useLoginWithEmail,
  useLoginWithOAuth,
  usePrivy,
} from "@privy-io/react-auth";
import { memo, useEffect, useRef } from "react";
import type { Auth } from "./auth";

// Our own screens do the talking. Privy creates each person's Solana wallet without asking,
// never shows its wallet windows, and makes no Ethereum wallets.
const PRIVY_CONFIG: PrivyClientConfig = {
  loginMethods: ["email", "google", "github"],
  appearance: { walletChainType: "solana-only" },
  embeddedWallets: {
    ethereum: { createOnLogin: "off" },
    solana: { createOnLogin: "users-without-wallets" },
    showWalletUIs: false,
  },
};

type BridgeProps = {
  appId: string;
  onChange: (auth: Auth) => void;
};

// Loaded in its own file once the page shows (see privy-auth-provider.tsx). It draws nothing
// of its own: it hands Privy's state and actions up to the app as an Auth.
export const PrivyBridge = memo(function PrivyBridge({ appId, onChange }: BridgeProps) {
  return (
    <PrivyProvider appId={appId} config={PRIVY_CONFIG}>
      <Bridge onChange={onChange} />
    </PrivyProvider>
  );
});

function Bridge({ onChange }: Pick<BridgeProps, "onChange">) {
  const privy = usePrivy();
  const email = useLoginWithEmail();
  const oauth = useLoginWithOAuth();

  // The hooks hand out new functions on every render. The Auth passed up calls the latest
  // ones, so it only has to change when the status does.
  const latest = useRef({ privy, email, oauth });
  useEffect(() => {
    latest.current = { privy, email, oauth };
  });

  const status = !privy.ready ? "loading" : privy.authenticated ? "signed-in" : "signed-out";
  const oauthFailed = oauth.state.status === "error";

  useEffect(() => {
    onChange({
      status,
      oauthFailed,
      sendEmailCode: (address) => latest.current.email.sendCode({ email: address }),
      signInWithEmailCode: (code) => latest.current.email.loginWithCode({ code }),
      signInWithOAuth: (provider) => latest.current.oauth.initOAuth({ provider }),
      signOut: () => latest.current.privy.logout(),
      getAccessToken: () => latest.current.privy.getAccessToken(),
    });
  }, [status, oauthFailed, onChange]);

  return null;
}
