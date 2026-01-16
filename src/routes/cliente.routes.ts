// src/routes/cliente.routes.ts
import { Router } from "express";
import {
  listClientes,
  getClienteById,
  createCliente,
  updateCliente,
  deleteCliente,
  setClienteActivo,
  assignAgenteToCliente,
  bulkAssignAgente,
} from "../controllers/cliente.controller";
import { requireAuth } from "../middlewares/requireAuth";
import {
  listExclusionesTareaCliente,
  excluirTareaParaCliente,
  reactivarTareaParaCliente,
} from "../controllers/clienteTareaExclusion.controller";

const router = Router();

// ✅ Listar (con filtros) + Crear
router.get("/", requireAuth, listClientes); // GET /api/clientes
router.post("/", requireAuth, createCliente); // POST /api/clientes

// ✅ Reasignación masiva (ADMIN/SUPERVISOR)
// (antes de "/:id" para evitar confusiones con params)
router.patch("/reasignar-masivo", requireAuth, bulkAssignAgente); // PATCH /api/clientes/reasignar-masivo

// ✅ CRUD por id
router.get("/:id", requireAuth, getClienteById); // GET /api/clientes/:id
router.patch("/:id", requireAuth, updateCliente); // PATCH /api/clientes/:id
router.delete("/:id", requireAuth, deleteCliente); // DELETE /api/clientes/:id

// ✅ Asignar agente (ADMIN/SUPERVISOR)
router.patch("/:id/asignar-agente", requireAuth, assignAgenteToCliente); // PATCH /api/clientes/:id/asignar-agente

// ✅ Activar / desactivar (soft)
router.patch("/:id/estado", requireAuth, setClienteActivo); // PATCH /api/clientes/:id/estado

// ✅ Exclusiones por cliente (tareas)
router.get("/:rut/exclusiones-tareas", requireAuth, listExclusionesTareaCliente);
router.post("/:rut/exclusiones-tareas", requireAuth, excluirTareaParaCliente);
router.delete(
  "/:rut/exclusiones-tareas/:tareaPlantillaId",
  requireAuth,
  reactivarTareaParaCliente
);

export default router;
