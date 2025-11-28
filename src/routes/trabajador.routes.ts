import { Router } from "express";
import { listTrabajadores } from "../controllers/trabajador.controller";
// import { authMiddleware } from "../middlewares/auth";

const router = Router();

router.get("/trabajadores", listTrabajadores);

export default router;
