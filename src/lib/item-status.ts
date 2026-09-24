// Pure. What a connected bank's status means to the person looking at it.

type ItemLike = { status: string; error_code: string | null };

// The statuses a new sign-in fixes: the bank logged the connection out, or
// is about to.
const RECONNECT_STATUSES = new Set(["requires_reauth", "pending_expiration", "pending_disconnect"]);

export function needsReconnect(item: ItemLike): boolean {
  return RECONNECT_STATUSES.has(item.status) || item.error_code === "ITEM_LOGIN_REQUIRED";
}

/** True when the bank has already stopped syncing, not just about to. */
export function isDisconnected(item: ItemLike): boolean {
  return item.status === "requires_reauth" || item.error_code === "ITEM_LOGIN_REQUIRED";
}

export function statusLabel(item: ItemLike): string {
  if (isDisconnected(item)) return "Sign-in needed";
  switch (item.status) {
    case "active":
      return "Connected";
    case "pending_expiration":
      return "Expires soon";
    case "pending_disconnect":
      return "Disconnecting soon";
    case "error":
      return "Sync error";
    default:
      return item.status;
  }
}
