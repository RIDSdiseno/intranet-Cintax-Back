// src/routes/cliente.routes.ts
import { Router } from "express";
import {
  listClientes,
  getClienteById,
  createCliente,
  updateCliente,
  deleteCliente,
  setClienteActivo,
} from "../controllers/cliente.controller";
import { requireAuth } from "../middlewares/requireAuth";
import {
  listExclusionesTareaCliente,
  excluirTareaParaCliente,
  reactivarTareaParaCliente,
} from "../controllers/clienteTareaExclusion.controller";

const router = Router();

// ✅ Listar (con filtros) + Crear
router.get("/", requireAuth, listClientes);     // GET /api/clientes
router.post("/", requireAuth, createCliente);   // POST /api/clientes

// ✅ CRUD por id
router.get("/:id", requireAuth, getClienteById);        // GET /api/clientes/:id
router.patch("/:id", requireAuth, updateCliente);       // PATCH /api/clientes/:id
router.delete("/:id", requireAuth, deleteCliente);      // DELETE /api/clientes/:id

// ✅ Activar / desactivar (soft)
router.patch("/:id/estado", requireAuth, setClienteActivo); // PATCH /api/clientes/:id/estado

router.get("/:rut/exclusiones-tareas", listExclusionesTareaCliente);
router.post("/:rut/exclusiones-tareas", excluirTareaParaCliente);
router.delete("/:rut/exclusiones-tareas/:tareaPlantillaId", reactivarTareaParaCliente);
export default router;
