import { Router } from "express";
import {
  listTrabajadores,
  listTrabajadoresLite,
  updateTrabajador,
} from "../controllers/trabajador.controller";
import {
  authGuard,
  requireSupervisorOrAdmin,
} from "../middlewares/auth.middleware";


const router = Router();

// 🔒 Listado protegido (recomendado)
router.get("/trabajadores", authGuard, listTrabajadores);

// 🔒 Update: solo supervisor/admin (doble seguro: middleware + controller)
router.patch(
  "/trabajadores/:id",
  authGuard,
  requireSupervisorOrAdmin,
  updateTrabajador
);

router.get("/trabajadores/lite", authGuard, listTrabajadoresLite);

export default router;
