/**
 * Full lifecycle of a license request.
 *
 * Valid transitions:
 *
 *   PENDING → APPROVED      (artist responds positively)
 *   PENDING → REJECTED      (artist responds negatively)
 *   PENDING → WITHDRAWN     (requester cancels before response)
 *   PENDING → EXPIRED       (TTL passed without any response)
 *   EXPIRED → REOPENED      (requester restarts the request)
 *   REOPENED → APPROVED     (artist approves the reopened request)
 *   REOPENED → REJECTED     (artist rejects the reopened request)
 *   REOPENED → WITHDRAWN    (requester withdraws the reopened request)
 *
 * Terminal states: APPROVED, REJECTED, WITHDRAWN
 * (EXPIRED can be reopened once; REOPENED follows the same rules as PENDING)
 */
export enum LicensingLifecycle {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
  WITHDRAWN = "withdrawn",
  EXPIRED = "expired",
  REOPENED = "reopened",
}

/** States from which a requester may withdraw. */
export const WITHDRAWABLE_STATES: LicensingLifecycle[] = [
  LicensingLifecycle.PENDING,
  LicensingLifecycle.REOPENED,
];

/** States from which a request may be reopened. */
export const REOPENABLE_STATES: LicensingLifecycle[] = [
  LicensingLifecycle.EXPIRED,
];

/** States that the artist can respond to (approve/reject). */
export const RESPONDABLE_STATES: LicensingLifecycle[] = [
  LicensingLifecycle.PENDING,
  LicensingLifecycle.REOPENED,
];
