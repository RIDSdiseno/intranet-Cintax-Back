import { Router } from "express";

// Rutas hijas
import authRoutes from "./routes/auth.route";
import googleRoutes from "./routes/google.route";
import clienteRoutes from "./routes/cliente.routes";
import ticketsRoutes from "./routes/tickets.routes";
import mailboxRoutes from "./routes/mailbox.routes";

const router = Router();

// =============================
//  HEALTHCHECK
// =============================
router.get("/health", (_req, res) =>
  res.json({ ok: true, service: "API Movil", ts: Date.now() })
);

// =============================
//  AUTH
// =============================
router.use("/auth", authRoutes);

// =============================
//  GOOGLE DRIVE
// =============================
router.use("/drive", googleRoutes);

// =============================
//  CLIENTES
// =============================
router.use("/clientes", clienteRoutes);

// =============================
//  TICKETS (incluye /email)
// =============================
router.use("/tickets", ticketsRoutes);

// =============================
//  MAILBOX (lectura Gmail)
// =============================
router.use("/mailbox", mailboxRoutes);

export default router;
