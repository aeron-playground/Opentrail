// Postgres NOTIFY channels between the apps. Payloads carry ids only: a listener reads everything
// else from the database, so nothing private travels in a notification.

// The indexer saw a user's balances change. Payload: the user's id.
export const BALANCE_CHANGED_CHANNEL = "balance_changed";
