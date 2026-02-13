import type { RequestHandler } from "express";
import { randomUUID } from "crypto";

const REQUEST_ID_HEADER = "x-request-id";
const MAX_REQUEST_ID_LENGTH = 128;

function normalizeRequestId(raw: string | undefined) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_REQUEST_ID_LENGTH) {
    return trimmed.slice(0, MAX_REQUEST_ID_LENGTH);
  }
  return trimmed;
}

export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const incomingHeader = req.header(REQUEST_ID_HEADER) ?? undefined;
  const requestId = normalizeRequestId(incomingHeader) ?? randomUUID();

  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  next();
};
