"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/bitacora.routes.ts
const express_1 = require("express");
const bitacora_controller_1 = require("../controllers/bitacora.controller");
// ⚠️ Ajusta esta importación al middleware real de tu proyecto.
// Debe setear req.user (id_trabajador, areaInterna, isSupervisor).
const requireAuth_1 = require("../middlewares/requireAuth");
const router = (0, express_1.Router)();
/**
 * Convención:
 * - /api/bitacoras/mias => trabajador ve solo lo suyo
 * - /api/bitacoras      => admin/supervisor ve global (filtrable)
 * - /api/bitacoras/:id  => dueño o admin/supervisor
 */
// Crear/actualizar bitácora del día (por fecha)
router.post("/", requireAuth_1.requireAuth, bitacora_controller_1.upsertBitacora);
// Listar mis bitácoras
router.get("/mias", requireAuth_1.requireAuth, bitacora_controller_1.listMisBitacoras);
// Listar global (admin/supervisor) — el controller valida permisos
router.get("/", requireAuth_1.requireAuth, bitacora_controller_1.listBitacoras);
// Obtener 1 por id (dueño o admin/supervisor)
router.get("/:id", requireAuth_1.requireAuth, bitacora_controller_1.getBitacoraById);
// Actualizar por id (dueño o admin)
router.put("/:id", requireAuth_1.requireAuth, bitacora_controller_1.updateBitacoraById);
// Eliminar por id (dueño o admin)
router.delete("/:id", requireAuth_1.requireAuth, bitacora_controller_1.deleteBitacoraById);
exports.default = router;
//# sourceMappingURL=bitacora.routes.js.map