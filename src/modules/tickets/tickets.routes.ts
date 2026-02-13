import { Router } from "express";
import { authGuard } from "../../middlewares/auth.middleware";
import {
  diagnosticTicketsInbox,
  listTicketsInbox,
  listTicketAgents,
  getTicketDetail,
  listTicketGroups,
  listTickets,
  listTicketMessages,
  createTicketMessage,
  replyTicketStub,
  syncTickets,
  updateTicket,
} from "./tickets.controller";

const r = Router();

r.get("/groups", authGuard, listTicketGroups);
r.get("/", authGuard, listTickets);
r.get("/inbox", authGuard, listTicketsInbox);
r.get("/inbox/diagnostic", authGuard, diagnosticTicketsInbox);
r.get("/agents", authGuard, listTicketAgents);
r.post("/sync", authGuard, syncTickets);
r.get("/:id", authGuard, getTicketDetail);
r.get("/:id/messages", authGuard, listTicketMessages);
r.post("/:id/messages", authGuard, createTicketMessage);
r.post("/:id/reply", authGuard, replyTicketStub);
r.patch("/:id", authGuard, updateTicket);

export default r;
