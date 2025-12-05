import { Router } from "express";
import { authGuard } from "../middlewares/auth.middleware";
import {
  connectDrive,
  createTicket,
  googleLoginTrabajador,
  listTareasAsignadas,
  listTickets,
  loginTrabajador,
  logoutTrabajador,
  registerTrabajador,
  syncTickets,
  // 👇 nuevos controllers
} from "../controllers/auth.controller";

const r = Router();

// 🔐 Auth
r.post("/register", registerTrabajador);      // registro manual
r.post("/google", googleLoginTrabajador);     // login con Google
r.post("/login", loginTrabajador);
r.post("/logout", authGuard, logoutTrabajador);

// 🎫 Tickets / Freshdesk
r.post("/sync-freshdesk", authGuard, syncTickets);
r.get("/getTickets", authGuard, listTickets);
r.post("/createTicket", authGuard, createTicket);

// 📌 Tareas asignadas (vista tipo analistas)
r.get("/tareas-asignadas", authGuard, listTareasAsignadas);

// 📂 Conexión a Google Drive (usa el id del trabajador en el state)
r.get("/drive/connect", authGuard, connectDrive);

export default r;
