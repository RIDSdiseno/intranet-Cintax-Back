// src/routes/auth.routes.ts
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
  getMe,
  getMyProfile,
} from "../controllers/auth.controller";

const r = Router();

// 🔐 Auth
r.post("/register", registerTrabajador);
r.post("/google", googleLoginTrabajador);
r.post("/login", loginTrabajador);
r.post("/logout", authGuard, logoutTrabajador);

// 👇 Resumen (para navbar, permisos, etc.)
r.get("/me", authGuard, getMe);

// 👇 Perfil completo (para Configuración)
r.get("/profile", authGuard, getMyProfile);

// 🎫 Tickets
r.post("/sync-freshdesk", authGuard, syncTickets);
r.get("/getTickets", authGuard, listTickets);
r.post("/createTicket", authGuard, createTicket);

// 📌 Tareas asignadas
r.get("/tareas-asignadas", authGuard, listTareasAsignadas);

// 📂 Drive
r.get("/drive/connect", authGuard, connectDrive);

export default r;
