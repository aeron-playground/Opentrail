import {
  type PrivyClientConfig,
  PrivyProvider,
  type User,
  useLoginWithEmail,
  useLoginWithOAuth,
  usePrivy,
} from "@privy-io/react-auth";
import { useCreateWallet, useExportWallet, useWallets } from "@privy-io/react-auth/solana";
import { memo, useEffect, useRef } from "react";
import { waitUntil } from "../../lib/wait-until";
import type { Auth } from "./auth";

// Our own screens do the talking: Privy never shows its wallet windows, and makes no Ethereum
// wallets. Its "create on login" setting only works inside Privy's own sign-in screens, so the
// Solana wallet is created below, right after sign-in.
const PRIVY_CONFIG: PrivyClientConfig = {
  loginMethods: ["email", "google", "github"],
  appearance: { walletChainType: "solana-only" },
  embeddedWallets: {
    ethereum: { createOnLogin: "off" },
    solana: { createOnLogin: "off" },
    showWalletUIs: false,
  },
};

// Privy's wallet frame needs a moment after each page load; export fails until it's ready.
const WALLET_READY_WAIT_MS = 10_000;

// The wallet Privy keeps for this person on Solana. External wallets don't count.
function hasSolanaWallet(user: User): boolean {
  return user.linkedAccounts.some(
    (account) =>
      account.type === "wallet" &&
      account.chainType === "solana" &&
      account.walletClientType === "privy",
  );
}

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
  const wallet = useCreateWallet();
  const exporter = useExportWallet();
  const solanaWallets = useWallets();

  // The hooks hand out new functions on every render. The Auth passed up calls the latest
  // ones, so it only has to change when the status does.
  const latest = useRef({ privy, email, oauth, wallet, exporter, solanaWallets });
  useEffect(() => {
    latest.current = { privy, email, oauth, wallet, exporter, solanaWallets };
  });

  // Every account needs its Solana wallet. Until it exists the API answers WALLET_NOT_READY,
  // which the app waits out. If creating fails, the next visit tries again.
  const needsWallet =
    privy.ready && privy.authenticated && privy.user !== null && !hasSolanaWallet(privy.user);
  const creatingWallet = useRef(false);
  useEffect(() => {
    if (!needsWallet || creatingWallet.current) {
      return;
    }
    creatingWallet.current = true;
    latest.current.wallet.createWallet().catch(() => {
      creatingWallet.current = false;
    });
  }, [needsWallet]);

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
      exportWallet: async (address) => {
        await waitUntil(() => latest.current.solanaWallets.ready, {
          timeoutMs: WALLET_READY_WAIT_MS,
        });
        await latest.current.exporter.exportWallet({ address });
      },
      getAccessToken: () => latest.current.privy.getAccessToken(),
    });
  }, [status, oauthFailed, onChange]);

  return null;
}
