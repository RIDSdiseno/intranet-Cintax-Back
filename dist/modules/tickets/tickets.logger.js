"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logTicketInfo = logTicketInfo;
exports.logTicketWarn = logTicketWarn;
exports.logTicketError = logTicketError;
function basePayload(payload) {
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
function logTicketInfo(payload) {
    console.info("tickets_event", basePayload(payload));
}
function logTicketWarn(payload) {
    console.warn("tickets_event", basePayload(payload));
}
function logTicketError(payload) {
    const err = payload.error;
    const normalizedError = err instanceof Error
        ? { name: err.name, message: err.message }
        : err === undefined
            ? null
            : String(err);
    console.error("tickets_event", {
        ...basePayload(payload),
        error: normalizedError,
    });
}
