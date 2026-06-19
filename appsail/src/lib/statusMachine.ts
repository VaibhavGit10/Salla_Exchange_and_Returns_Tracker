// appsail/src/lib/statusMachine.ts
// Return-request status machine (BRD §5 pipeline). Enforced via assertTransition() before
// every status write so the workflow can never enter an invalid state.
import { AppError } from "./errors";

export type ReturnStatus =
  | "requested"
  | "approved"
  | "in_transit"
  | "received"
  | "resolved"
  | "rejected"
  | "cancelled";

export const RETURN_STATUSES: ReturnStatus[] = [
  "requested",
  "approved",
  "in_transit",
  "received",
  "resolved",
  "rejected",
  "cancelled",
];

const VALID_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  requested: ["approved", "rejected", "cancelled"],
  approved: ["in_transit", "received", "resolved", "cancelled"],
  in_transit: ["received", "resolved"],
  received: ["resolved"],
  resolved: [], // terminal
  rejected: [], // terminal
  cancelled: [], // terminal
};

export function isReturnStatus(s: string): s is ReturnStatus {
  return (RETURN_STATUSES as string[]).includes(String(s).toLowerCase().trim());
}

export function nextStates(current: string): ReturnStatus[] {
  const c = String(current).toLowerCase().trim() as ReturnStatus;
  return VALID_TRANSITIONS[c] ?? [];
}

export function assertTransition(currentStatus: string, targetStatus: string): void {
  const current = String(currentStatus).toLowerCase().trim();
  const target = String(targetStatus).toLowerCase().trim();
  const allowed = VALID_TRANSITIONS[current as ReturnStatus];
  if (!allowed) throw new AppError(409, `Unknown current status: ${current}`, "INVALID_STATUS");
  if (!allowed.includes(target as ReturnStatus)) {
    throw new AppError(
      409,
      `Cannot transition '${current}' → '${target}'. Allowed: [${allowed.join(", ")}]`,
      "INVALID_TRANSITION"
    );
  }
}

export function isTerminalStatus(status: string): boolean {
  const s = String(status).toLowerCase().trim();
  return s === "resolved" || s === "rejected" || s === "cancelled";
}
