import { Router } from "express";
import { authGuard } from "../../middlewares/auth.middleware";
import { detalle, generar, listar, soloInformes } from "./informes.controller";

const r = Router();

// Las tres rutas exigen estar autenticado Y estar en la lista de informes.
// El guard va en cada una, no solo en el front: ocultar el menu no protege
// nada si el endpoint responde igual.
r.use(authGuard, soloInformes);

r.get("/", listar);
r.post("/generar", generar);
r.get("/:semana", detalle);

export default r;
