"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/cliente.routes.ts
const express_1 = require("express");
const cliente_controller_1 = require("../controllers/cliente.controller");
const requireAuth_1 = require("../middlewares/requireAuth");
const clienteTareaExclusion_controller_1 = require("../controllers/clienteTareaExclusion.controller");
const router = (0, express_1.Router)();
// ✅ Listar (con filtros) + Crear
router.get("/", requireAuth_1.requireAuth, cliente_controller_1.listClientes); // GET /api/clientes
router.post("/", requireAuth_1.requireAuth, cliente_controller_1.createCliente); // POST /api/clientes
// ✅ Reasignación masiva (ADMIN/SUPERVISOR)
// (antes de "/:id" para evitar confusiones con params)
router.patch("/reasignar-masivo", requireAuth_1.requireAuth, cliente_controller_1.bulkAssignAgente); // PATCH /api/clientes/reasignar-masivo
// ✅ CRUD por id
router.get("/:id", requireAuth_1.requireAuth, cliente_controller_1.getClienteById); // GET /api/clientes/:id
router.patch("/:id", requireAuth_1.requireAuth, cliente_controller_1.updateCliente); // PATCH /api/clientes/:id
router.delete("/:id", requireAuth_1.requireAuth, cliente_controller_1.deleteCliente); // DELETE /api/clientes/:id
// ✅ Asignar agente (ADMIN/SUPERVISOR)
router.patch("/:id/asignar-agente", requireAuth_1.requireAuth, cliente_controller_1.assignAgenteToCliente); // PATCH /api/clientes/:id/asignar-agente
// ✅ Activar / desactivar (soft)
router.patch("/:id/estado", requireAuth_1.requireAuth, cliente_controller_1.setClienteActivo); // PATCH /api/clientes/:id/estado
// ✅ Exclusiones por cliente (tareas)
router.get("/:rut/exclusiones-tareas", requireAuth_1.requireAuth, clienteTareaExclusion_controller_1.listExclusionesTareaCliente);
router.post("/:rut/exclusiones-tareas", requireAuth_1.requireAuth, clienteTareaExclusion_controller_1.excluirTareaParaCliente);
router.delete("/:rut/exclusiones-tareas/:tareaPlantillaId", requireAuth_1.requireAuth, clienteTareaExclusion_controller_1.reactivarTareaParaCliente);
exports.default = router;
