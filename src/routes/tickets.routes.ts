import { Router } from "express";
import multer from "multer";
import { authGuard } from "../middlewares/auth.middleware";
import * as TicketsController from "../controllers/tickets.controller";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

/** Helper: evita "argument handler must be a function" en producción */
function mustBeFn(name: keyof typeof TicketsController) {
  const fn = (TicketsController as any)[name];
  if (typeof fn !== "function") {
    // Importante: NO revienta el server, solo deja log para que sepas qué falta
    console.warn(`[tickets.routes] Handler faltante o no es function: ${String(name)}`);
    // handler dummy para que Express no rompa al registrar rutas
    return (_req: any, res: any) =>
      res.status(501).json({ ok: false, error: `Endpoint no implementado: ${String(name)}` });
  }
  return fn;
}

/* ----------------------------- */
/* Core (UI TicketsPage)         */
/* ----------------------------- */

// Tabs / grupos (para TicketsTabs + total)
router.get("/groups", authGuard, mustBeFn("getGroups"));

// Agentes (para filtros y reasignación) -> DEBE IR ANTES QUE "/:id"
router.get("/agents/list", authGuard, mustBeFn("getTicketAgents"));

/* ----------------------------- */
/* Admin tools (UI TicketsPage)  */
/* ----------------------------- */

// Diagnóstico inbox -> DEBE IR ANTES QUE "/:id"
router.get("/admin/inbox-diagnostic", authGuard, mustBeFn("getInboxDiagnostic"));

// Sincronizar correos -> tickets
router.post("/admin/sync", authGuard, mustBeFn("syncTickets"));

/* ----------------------------- */
/* Tickets list/detail/update    */
/* ----------------------------- */

// Listado (para TicketsTable + filtros)
router.get("/", authGuard, mustBeFn("listTickets"));

// Detalle (para TicketDetailPage)
router.get("/:id", authGuard, mustBeFn("getTicketById"));

// Update propiedades (estado/prioridad/tags/agente/areaDetected/etc)
router.put("/:id", authGuard, mustBeFn("updateTicket"));

/* ----------------------------- */
/* Thread / messages / events    */
/* ----------------------------- */

// Thread
router.get("/:id/messages", authGuard, mustBeFn("getTicketMessages"));

// Crear mensaje (reply / note / forward) + adjuntos
router.post(
  "/:id/messages",
  authGuard,
  upload.array("attachments", 10),
  mustBeFn("createTicketMessage")
);

// Eventos
router.get("/:id/events", authGuard, mustBeFn("getTicketEvents"));

/* ----------------------------- */
/* Email endpoints (legacy/op1)  */
/* ----------------------------- */

// Crear ticket enviando email (CC actor, Reply-To soporte)
router.post(
  "/email",
  authGuard,
  upload.array("attachments", 10),
  mustBeFn("createEmailTicket")
);

// Responder un ticket por email
router.post(
  "/:ticketId/reply-email",
  authGuard,
  upload.array("attachments", 10),
  mustBeFn("replyTicketByEmail")
);

export default router;