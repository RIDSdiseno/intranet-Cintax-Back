"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const tickets_controller_1 = require("./tickets.controller");
const r = (0, express_1.Router)();
// Adjuntos de los mensajes del ticket (mismos limites que el controller anterior).
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
});
/* Colecciones y utilidades: siempre antes de "/:id" */
r.get("/groups", auth_middleware_1.authGuard, tickets_controller_1.listTicketGroups);
r.get("/summary", auth_middleware_1.authGuard, tickets_controller_1.getTicketsSummary);
r.get("/", auth_middleware_1.authGuard, tickets_controller_1.listTickets);
r.post("/", auth_middleware_1.authGuard, tickets_controller_1.createTicket);
r.get("/inbox/diagnostic", auth_middleware_1.authGuard, tickets_controller_1.diagnosticTicketsInbox);
r.get("/agents", auth_middleware_1.authGuard, tickets_controller_1.listTicketAgents);
r.post("/sync", auth_middleware_1.authGuard, tickets_controller_1.syncTickets);
/* Ticket individual */
r.get("/:id", auth_middleware_1.authGuard, tickets_controller_1.getTicketDetail);
r.patch("/:id", auth_middleware_1.authGuard, tickets_controller_1.updateTicket);
r.get("/:id/events", auth_middleware_1.authGuard, tickets_controller_1.listTicketEvents);
r.get("/:id/messages", auth_middleware_1.authGuard, tickets_controller_1.listTicketMessages);
r.post("/:id/messages", auth_middleware_1.authGuard, upload.array("attachments", 10), tickets_controller_1.createTicketMessage);
r.post("/:id/reply", auth_middleware_1.authGuard, tickets_controller_1.replyTicketStub);
exports.default = r;
//# sourceMappingURL=tickets.routes.js.map