"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestIdMiddleware = void 0;
const crypto_1 = require("crypto");
const REQUEST_ID_HEADER = "x-request-id";
const MAX_REQUEST_ID_LENGTH = 128;
function normalizeRequestId(raw) {
    if (!raw)
        return null;
    const trimmed = raw.trim();
    if (!trimmed)
        return null;
    if (trimmed.length > MAX_REQUEST_ID_LENGTH) {
        return trimmed.slice(0, MAX_REQUEST_ID_LENGTH);
    }
    return trimmed;
}
const requestIdMiddleware = (req, res, next) => {
    const incomingHeader = req.header(REQUEST_ID_HEADER) ?? undefined;
    const requestId = normalizeRequestId(incomingHeader) ?? (0, crypto_1.randomUUID)();
    req.requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    next();
};
exports.requestIdMiddleware = requestIdMiddleware;
