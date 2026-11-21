import { randomBytes } from "crypto";

/** Use short-lived in-memory tickets because socket handshakes cannot use HTTP bearer tokens. */

export interface TaskTicketIdentity {
  uuid: string;
  elevated: boolean;
}

interface TicketEntry extends TaskTicketIdentity {
  expiresAt: number;
}

const TICKET_TTL = 5 * 60_000;

const tickets = new Map<string, TicketEntry>();

export function issueTaskTicket(identity: TaskTicketIdentity) {
  const ticket = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + TICKET_TTL;
  tickets.set(ticket, { ...identity, expiresAt });
  return { ticket, expiresAt };
}

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

export function sweepTaskTickets(now = Date.now()) {
  for (const [ticket, entry] of tickets) {
    if (entry.expiresAt <= now) tickets.delete(ticket);
  }
}

export function disposeTaskTickets() {
  tickets.clear();
}
