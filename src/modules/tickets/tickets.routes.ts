import { Router } from "express";
import multer from "multer";
import { authGuard } from "../../middlewares/auth.middleware";
import {
  createTicket,
  diagnosticTicketsInbox,
  listTicketAgents,
  getTicketDetail,
  getTicketsSummary,
  listTicketEvents,
  listTicketGroups,
  listTickets,
  listTicketMessages,
  createTicketMessage,
  replyTicketStub,
  syncTickets,
  updateTicket,
} from "./tickets.controller";

const r = Router();

// Adjuntos de los mensajes del ticket (mismos limites que el controller anterior).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

/* Colecciones y utilidades: siempre antes de "/:id" */
r.get("/groups", authGuard, listTicketGroups);
r.get("/summary", authGuard, getTicketsSummary);
r.get("/", authGuard, listTickets);
r.post("/", authGuard, createTicket);
r.get("/inbox/diagnostic", authGuard, diagnosticTicketsInbox);
r.get("/agents", authGuard, listTicketAgents);
r.post("/sync", authGuard, syncTickets);

/* Ticket individual */
r.get("/:id", authGuard, getTicketDetail);
r.patch("/:id", authGuard, updateTicket);
r.get("/:id/events", authGuard, listTicketEvents);
r.get("/:id/messages", authGuard, listTicketMessages);
r.post(
  "/:id/messages",
  authGuard,
  upload.array("attachments", 10),
  createTicketMessage
);
r.post("/:id/reply", authGuard, replyTicketStub);

export default r;
