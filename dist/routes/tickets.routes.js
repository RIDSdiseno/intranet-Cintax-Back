"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const auth_middleware_1 = require("../middlewares/auth.middleware");
const tickets_controller_1 = require("../controllers/tickets.controller");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
});
// Crear ticket enviando email (opción 1: CC soporte + trabajador, Reply-To soporte)
router.post("/email", auth_middleware_1.authGuard, upload.array("attachments", 10), tickets_controller_1.createEmailTicket);
// Responder un ticket por email (opción 1)
router.post("/:ticketId/reply-email", auth_middleware_1.authGuard, upload.array("attachments", 10), tickets_controller_1.replyTicketByEmail);
exports.default = router;
