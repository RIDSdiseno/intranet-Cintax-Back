// src/routes/auth.routes.ts
import { Router } from "express";
import {
  authGuard,
  requireSupervisorOrAdmin,
} from "../middlewares/auth.middleware";
import {
  connectDrive,
  googleLoginTrabajador,
  listTareasAsignadas,
  loginTrabajador,
  logoutTrabajador,
  registerTrabajador,
  getMe,
  getMyProfile,
} from "../controllers/auth.controller";

const r = Router();

// Auth
//
// `register` NO es publica. Crear la cuenta es dar acceso a la intranet, asi
// que la pide un supervisor o un admin, igual que cualquier otra alta.
//
// Estuvo abierta: sin guard, sin verificar el correo y sin restringir el
// dominio, creando el trabajador con `status: true`. Cualquiera en internet se
// registraba y con `/login` obtenia un JWT valido de AGENTE, que alcanza todo
// lo que solo exige `requireAuth`. El filtro de dominio de Google no cubria
// esto: solo corre en `/auth/google`, no aca.
//
// Tampoco basta con exigir el dominio aqui. Seguiria siendo publica, y deja
// pasar el secuestro previo: registrar `alguien@cintax.cl` antes de que exista
// y esperar a que la persona real entre por Google, que vincula las dos
// cuentas (ver `googleLoginTrabajador`) dejando viva la clave del atacante
// sobre una cuenta que ya heredo area y rol.
//
// El alta normal no pasa por aqui: la hace el primer login con Google. Esta
// ruta queda como el alta manual, para cuentas con contrasena.
r.post("/register", authGuard, requireSupervisorOrAdmin, registerTrabajador);
r.post("/google", googleLoginTrabajador);
r.post("/login", loginTrabajador);
r.post("/logout", authGuard, logoutTrabajador);

// Resumen (para navbar, permisos, etc.)
r.get("/me", authGuard, getMe);

// Perfil completo (para Configuración)
r.get("/profile", authGuard, getMyProfile);

// Tickets: viven en /api/tickets (src/modules/tickets).
// Las rutas que estaban aqui consultaban la tabla Ticket por su cuenta,
// sin filtro por area y sin consumidores en el front.

// Tareas asignadas
r.get("/tareas-asignadas", authGuard, listTareasAsignadas);

//Drive
r.get("/drive/connect", authGuard, connectDrive);

export default r;
