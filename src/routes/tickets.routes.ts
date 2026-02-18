import { Router } from "express";
import multer from "multer";
import { authGuard } from "../middlewares/auth.middleware";
import {
  createEmailTicket,
  replyTicketByEmail, // ✅ NUEVO
} from "../controllers/tickets.controller";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

// Crear ticket enviando email (opción 1: CC soporte + trabajador, Reply-To soporte)
router.post(
  "/email",
  authGuard,
  upload.array("attachments", 10),
  createEmailTicket
);

// Responder un ticket por email (opción 1)
router.post(
  "/:ticketId/reply-email",
  authGuard,
  upload.array("attachments", 10),
  replyTicketByEmail
);

export default router;
