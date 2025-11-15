import { Router } from "express";
import { authGuard } from "../middlewares/auth.middleware";
import { connectDrive, createTicket, googleLoginTrabajador, listTickets, loginTrabajador, logoutTrabajador, registerTrabajador, syncTickets } from "../controllers/auth.controller";

const r = Router();

r.get("/health", (_req, res) => res.json({ ok: true, service: "API Movil", ts: Date.now() }));

r.post("/register", registerTrabajador);      // si quieres registro manual
r.post("/google", googleLoginTrabajador);     // login con Google
r.post("/login", loginTrabajador)
r.post("/logout", authGuard, logoutTrabajador);

r.post("/sync-freshdesk",authGuard,syncTickets)
r.get("/getTickets",authGuard,listTickets)
r.post("/createTicket",authGuard,createTicket)



export default r