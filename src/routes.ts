import { Router } from "express";
import authRoutes from "./routes/auth.route.js";
import googleRoutes from "./routes/google.route.js"

const router = Router();

router.get("/health", (_req, res) => res.json({ ok: true, service: "API Movil", ts: Date.now() }));

router.use("/auth",authRoutes)

router.use("/drive",googleRoutes)


export default router;