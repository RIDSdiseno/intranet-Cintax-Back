import { Router } from "express";
import { authGuard } from "../../middlewares/auth.middleware";
import { chat, redactarRespuesta } from "./asistente.controller";

const r = Router();

// Cualquier usuario autenticado puede usar el asistente. El alcance de los
// datos lo decide cada herramienta a partir del JWT, no esta ruta.
r.post("/chat", authGuard, chat);
r.post("/redactar-respuesta", authGuard, redactarRespuesta);

export default r;
