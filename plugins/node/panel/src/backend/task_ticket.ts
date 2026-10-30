import { randomBytes } from "crypto";

/**
 * Short-lived tickets for the browser's task stream.
 *
 * The panel's HTTP authentication is a bearer token paired with a koa-session
 * cookie, which a Socket.IO handshake cannot read. An authenticated request
 * exchanges its identity for one of these tickets, and the socket middleware
 * accepts it for the next few minutes. Tickets stay in memory and are never
 * logged.
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
