// src/routes/bitacora.routes.ts
import { Router } from "express";
import {
  upsertBitacora,
  listMisBitacoras,
  listBitacoras,
  getBitacoraById,
  updateBitacoraById,
  deleteBitacoraById,
} from "../controllers/bitacora.controller";

// ⚠️ Ajusta esta importación al middleware real de tu proyecto.
// Debe setear req.user (id_trabajador, areaInterna, isSupervisor).
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

/**
 * Convención:
 * - /api/bitacoras/mias => trabajador ve solo lo suyo
 * - /api/bitacoras      => admin/supervisor ve global (filtrable)
 * - /api/bitacoras/:id  => dueño o admin/supervisor
 */

// Crear/actualizar bitácora del día (por fecha)
router.post("/", requireAuth, upsertBitacora);

// Listar mis bitácoras
router.get("/mias", requireAuth, listMisBitacoras);

// Listar global (admin/supervisor) — el controller valida permisos
router.get("/", requireAuth, listBitacoras);

// Obtener 1 por id (dueño o admin/supervisor)
router.get("/:id", requireAuth, getBitacoraById);

// Actualizar por id (dueño o admin)
router.put("/:id", requireAuth, updateBitacoraById);

// Eliminar por id (dueño o admin)
router.delete("/:id", requireAuth, deleteBitacoraById);

export default router;