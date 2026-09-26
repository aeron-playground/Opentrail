import { CopyIcon } from "@phosphor-icons/react/Copy";
import { WarningIcon } from "@phosphor-icons/react/Warning";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";

type CopyState = "idle" | "copied" | "failed";

// Where to send funds: the person's Solana address, with a Copy button, what each coin is for,
// and the one mistake that loses money.
export function AddFundsDetails({ address }: { address: string }) {
  const [copy, setCopy] = useState<CopyState>("idle");

  useEffect(() => {
    if (copy === "idle") {
      return;
    }
    const timer = setTimeout(() => setCopy("idle"), 2000);
    return () => clearTimeout(timer);
  }, [copy]);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="font-medium">Your Solana address</p>
        <p className="select-all break-all rounded-control bg-paper-2 px-3 py-3 font-mono text-body">
          {address}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={copyAddress}>
            <CopyIcon size={20} aria-hidden="true" />
            Copy address
          </Button>
          <span role="status" className="text-ink-2 text-meta">
            {copy === "copied"
              ? "Copied."
              : copy === "failed"
                ? "Couldn't copy. Select the address and copy it yourself."
                : ""}
          </span>
        </div>
      </div>
      <ul className="flex flex-col gap-1">
        <li>
          <span className="font-medium">USDC</span>: for trading
        </li>
        <li>
          <span className="font-medium">SOL</span>: for network fees, at least 0.02
        </li>
      </ul>
      <p className="flex items-start gap-2 rounded-control bg-caution-bg px-3 py-3 text-caution">
        <WarningIcon size={20} aria-hidden="true" className="mt-px shrink-0" />
        Send only on the Solana network.
      </p>
    </div>
  );
}
