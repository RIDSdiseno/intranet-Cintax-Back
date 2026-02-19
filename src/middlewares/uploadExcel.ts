// src/middlewares/uploadExcel.ts
import multer from "multer";

export const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});
