// src/routes/mailbox.routes.ts
//
// DESMONTADO (2026-11-13): este router ya no se monta. La linea que lo
// montaba esta comentada en `src/routes.ts`, con el motivo y como revertirlo.
// Nada de lo que hay aqui se ejecuta.

import { Router } from "express";
import multer from "multer";
import {
  listMailboxThreads,
  getMailboxThread,
  replyMailboxThread, // 
} from "../controllers/mailbox.controller";
import { authGuard } from "../middlewares/auth.middleware";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

router.use(authGuard);

router.get("/threads", listMailboxThreads);
router.get("/threads/:threadId", getMailboxThread);

router.post(
  "/threads/:threadId/reply",
  upload.array("attachments", 10),
  replyMailboxThread
);

// La ingesta de correo -> tickets vive en POST /api/tickets/sync
// (src/modules/tickets/email/ingestInbox.ts). La que estaba aqui solo
// agregaba mensajes a tickets ya existentes y descartaba los correos nuevos.

export default router;
