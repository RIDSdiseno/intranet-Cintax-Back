"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const mailbox_controller_1 = require("../controllers/mailbox.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
router.use(auth_middleware_1.authGuard);
router.get("/threads", mailbox_controller_1.listMailboxThreads);
router.get("/threads/:threadId", mailbox_controller_1.getMailboxThread);
router.post("/threads/:threadId/reply", upload.array("attachments", 10), mailbox_controller_1.replyMailboxThread);
router.post("/sync", mailbox_controller_1.syncMailboxInbox);
exports.default = router;
