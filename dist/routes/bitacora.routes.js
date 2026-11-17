"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/bitacora.routes.ts
const express_1 = require("express");
const bitacora_controller_1 = require("../controllers/bitacora.controller");
const clienteBitacora_controller_1 = require("../controllers/clienteBitacora.controller");
const requireAuth_1 = require("../middlewares/requireAuth");
const router = (0, express_1.Router)();
router.use(requireAuth_1.requireAuth);
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
router.post("/", bitacora_controller_1.upsertBitacora);
// Listar mis bitácoras
router.get("/mias", bitacora_controller_1.listMisBitacoras);
// Listar global (admin/supervisor)
router.get("/", bitacora_controller_1.listBitacoras);
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
router.get("/clientes/equipo", clienteBitacora_controller_1.listClienteBitacorasEquipo);
// Crear bitácora para un cliente
router.post("/clientes/:id/bitacoras", clienteBitacora_controller_1.createClienteBitacora);
// Listar bitácoras de un cliente
router.get("/clientes/:id/bitacoras", clienteBitacora_controller_1.listClienteBitacoras);
// Obtener una bitácora de cliente por id
router.get("/clientes/bitacoras/:bitacoraId", clienteBitacora_controller_1.getClienteBitacoraById);
// Actualizar una bitácora de cliente
router.put("/clientes/bitacoras/:bitacoraId", clienteBitacora_controller_1.updateClienteBitacoraById);
// Eliminar una bitácora de cliente
router.delete("/clientes/bitacoras/:bitacoraId", clienteBitacora_controller_1.deleteClienteBitacoraById);
/**
 * =========================================================
 * BITÁCORA DIARIA POR ID
 * =========================================================
 */
// Obtener 1 por id
router.get("/:id", bitacora_controller_1.getBitacoraById);
// Actualizar por id
router.put("/:id", bitacora_controller_1.updateBitacoraById);
// Eliminar por id
router.delete("/:id", bitacora_controller_1.deleteBitacoraById);
exports.default = router;
//# sourceMappingURL=bitacora.routes.js.map