import { Router } from "express";

// Rutas hijas
import authRoutes from "./routes/auth.route";
import googleRoutes from "./routes/google.route";
import clienteRoutes from "./routes/cliente.routes";
import ticketsRoutes from "./modules/tickets/tickets.routes";
// import mailboxRoutes from "./routes/mailbox.routes"; // ver MAILBOX, mas abajo
import bitacoraRoutes from "./routes/bitacora.routes";
import tareasRoutes from "./routes/tareas.routes";
import asistenteRoutes from "./modules/asistente/asistente.routes";
import informesRoutes from "./modules/informes/informes.routes";

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
//  MAILBOX (lectura Gmail) — DESMONTADO
// =============================
// Webmail crudo de la casilla de soporte, anterior a la ticketera: listar
// hilos, abrir uno y responder por correo. Lo reemplazo `/api/tickets`, que
// hace lo mismo pero creando tickets de verdad.
//
// Se desmonto el 2026-11-13 despues de comprobar que no lo llama nadie: cero
// referencias en todo el front, y en el backend solo se importaban entre
// ellos mismos. Queda comentado y no borrado para poder volver atras con dos
// lineas si apareciera algun consumidor externo (un script, Postman) que el
// codigo no deja ver.
//
// Ojo si se revive: `GET /threads/:id` acepta `?markRead=true`, que marca el
// hilo como leido en la casilla real de la empresa y no se revierte. Por
// defecto no lo hace, igual que la sincronizacion de tickets.
//
// router.use("/mailbox", mailboxRoutes);

//=============================
//  BITACORA
// =============================
router.use("/bitacoras", bitacoraRoutes);


//==============================
//  TAREAS
//==============================

router.use("/tareas", tareasRoutes);


//==============================
//  ASISTENTE (Claude)
//==============================

router.use("/asistente", asistenteRoutes);


//==============================
//  INFORMES SEMANALES
//==============================

router.use("/informes", informesRoutes);


export default router;
