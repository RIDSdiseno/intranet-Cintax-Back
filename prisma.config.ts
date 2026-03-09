import { defineConfig } from "prisma/config";
import "dotenv/config";

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "DATABASE_URL no está definida. Revisa tu archivo .env en la raíz del proyecto."
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    url,
  },
});