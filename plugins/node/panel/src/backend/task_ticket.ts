import { randomBytes } from "crypto";

/**
 * Exchange HTTP-authenticated identities for short-lived Socket.IO tickets.
 * Keep tickets in memory because the socket handshake cannot use the HTTP bearer-token flow.
 */

export interface TaskTicketIdentity {
  uuid: string;
  elevated: boolean;
}

interface TicketEntry extends TaskTicketIdentity {
  expiresAt: number;
}

const TICKET_TTL = 5 * 60_000;

const tickets = new Map<string, TicketEntry>();

/** Issues a ticket bound to the authenticated caller. */
export function issueTaskTicket(identity: TaskTicketIdentity) {
  const ticket = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + TICKET_TTL;
  tickets.set(ticket, { ...identity, expiresAt });
  return { ticket, expiresAt };
}

/** Resolves a handshake ticket, or `undefined` when it is unknown or expired. */
export function verifyTaskTicket(value: unknown): TaskTicketIdentity | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const entry = tickets.get(value);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    tickets.delete(value);
    return undefined;
  }
  return { uuid: entry.uuid, elevated: entry.elevated };
}

/** Drops expired tickets; the interval itself belongs to the plugin scope. */
export function sweepTaskTickets(now = Date.now()) {
  for (const [ticket, entry] of tickets) {
    if (entry.expiresAt <= now) tickets.delete(ticket);
  }
}

export function disposeTaskTickets() {
  tickets.clear();
}
