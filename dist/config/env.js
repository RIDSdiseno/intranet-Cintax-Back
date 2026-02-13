"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
require("dotenv/config");
exports.env = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: Number(process.env.PORT || 3000),
    CORS_ORIGINS: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:4173')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    CORS_CREDENTIALS: String(process.env.CORS_CREDENTIALS ?? process.env.AUTH_COOKIE ?? 'false') ===
        'true',
    JWT_SECRET: process.env.JWT_SECRET || 'change_me',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1d',
    DATABASE_URL: process.env.DATABASE_URL || '',
};
