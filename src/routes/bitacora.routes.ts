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

import {
  createClienteBitacora,
  listClienteBitacoras,
  getClienteBitacoraById,
  updateClienteBitacoraById,
  deleteClienteBitacoraById,
  listClienteBitacorasEquipo
} from "../controllers/clienteBitacora.controller";

import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

router.use(requireAuth);

/**
 * =========================================================
 * BITÁCORA DIARIA PERSONAL
 * =========================================================
 *
 * Base montada:
 * app.use("/api/bitacoras", router)
 *
 * Endpoints finales:
 * - POST   /api/bitacoras
 * - GET    /api/bitacoras/mias
 * - GET    /api/bitacoras
 * - GET    /api/bitacoras/:id
 * - PUT    /api/bitacoras/:id
 * - DELETE /api/bitacoras/:id
 */

// Crear/actualizar bitácora del día
router.post("/", upsertBitacora);

// Listar mis bitácoras
router.get("/mias", listMisBitacoras);

// Listar global (admin/supervisor)
router.get("/", listBitacoras);

/**
 * =========================================================
 * BITÁCORA POR CLIENTE
 * =========================================================
 *
 * Endpoints finales:
 * - POST   /api/bitacoras/clientes/:id/bitacoras
 * - GET    /api/bitacoras/clientes/:id/bitacoras
 * - GET    /api/bitacoras/clientes/bitacoras/:bitacoraId
 * - PUT    /api/bitacoras/clientes/bitacoras/:bitacoraId
 * - DELETE /api/bitacoras/clientes/bitacoras/:bitacoraId
 */
router.get(
  "/clientes/equipo",
  listClienteBitacorasEquipo
);
// Crear bitácora para un cliente
router.post("/clientes/:id/bitacoras", createClienteBitacora);

// Listar bitácoras de un cliente
router.get("/clientes/:id/bitacoras", listClienteBitacoras);

// Obtener una bitácora de cliente por id
router.get("/clientes/bitacoras/:bitacoraId", getClienteBitacoraById);

// Actualizar una bitácora de cliente
router.put("/clientes/bitacoras/:bitacoraId", updateClienteBitacoraById);

// Eliminar una bitácora de cliente
router.delete("/clientes/bitacoras/:bitacoraId", deleteClienteBitacoraById);

/**
 * =========================================================
 * BITÁCORA DIARIA POR ID
 * =========================================================
 */

// Obtener 1 por id
router.get("/:id", getBitacoraById);

// Actualizar por id
router.put("/:id", updateBitacoraById);

// Eliminar por id
router.delete("/:id", deleteBitacoraById);



export default router;