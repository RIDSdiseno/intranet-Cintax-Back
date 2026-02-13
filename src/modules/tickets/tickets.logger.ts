export type TicketLogAction =
  | "tickets_groups"
  | "tickets_list"
  | "tickets_inbox"
  | "ticket_detail"
  | "ticket_messages_list"
  | "ticket_message_create"
  | "ticket_update"
  | "tickets_agents_list";

type TicketLogPayload = {
  action: TicketLogAction;
  requestId?: string | null;
  userId?: number | null;
  role?: string | null;
  ticketId?: number | null;
  meta?: Record<string, unknown>;
};

function basePayload(payload: TicketLogPayload) {
  return {
    scope: "tickets",
    ts: new Date().toISOString(),
    action: payload.action,
    requestId: payload.requestId ?? null,
    userId: payload.userId ?? null,
    role: payload.role ?? null,
    ticketId: payload.ticketId ?? null,
    meta: payload.meta ?? {},
  };
}

export function logTicketInfo(payload: TicketLogPayload) {
  console.info("tickets_event", basePayload(payload));
}

export function logTicketWarn(payload: TicketLogPayload) {
  console.warn("tickets_event", basePayload(payload));
}

export function logTicketError(payload: TicketLogPayload & { error?: unknown }) {
  const err = payload.error;
  const normalizedError =
    err instanceof Error
      ? { name: err.name, message: err.message }
      : err === undefined
      ? null
      : String(err);

  console.error("tickets_event", {
    ...basePayload(payload),
    error: normalizedError,
  });
}
