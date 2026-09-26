import { Page } from "../../components/common/page";
import { WithAccount } from "../account/with-account";
import { AddFundsDetails } from "./add-funds-details";

export function DepositPage() {
  return (
    <Page title="Add funds">
      <p className="mt-3 text-ink-2">
        Send USDC to trade with, and a little SOL for network fees, to your wallet.
      </p>
      <div className="mt-6">
        <WithAccount>{(me) => <AddFundsDetails address={me.walletAddress} />}</WithAccount>
      </div>
    </Page>
  );
}
