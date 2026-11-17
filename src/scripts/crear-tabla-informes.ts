/**
 * Crea la tabla `InformeSemanal`. Nada mas.
 *
 * Por que un script y no una migracion: este proyecto no tiene historial de
 * migraciones usable (el baseline esta vacio y el schema se mantiene con
 * `db pull`). Correr `migrate dev` aqui intentaria reconciliar toda la base
 * contra un historial que no existe, y eso si seria peligroso. Un CREATE TABLE
 * suelto solo agrega.
 *
 * Garantias de este script:
 *  - Solo ejecuta CREATE TABLE / CREATE INDEX, con IF NOT EXISTS.
 *  - No hay ALTER, DROP, UPDATE, DELETE ni INSERT en ninguna parte.
 *  - No toca ninguna tabla existente. `generadoPor` guarda el id del
 *    trabajador como entero suelto, a proposito sin FOREIGN KEY: una FK
 *    agregaria una dependencia sobre `Trabajador` y la idea es no rozarla.
 *  - Es idempotente: correrlo dos veces no hace nada la segunda vez.
 *
 * Uso:
 *   npx tsx src/scripts/crear-tabla-informes.ts
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";

const SENTENCIAS: { descripcion: string; sql: string }[] = [
  {
    descripcion: 'Tabla "InformeSemanal"',
    sql: `
      CREATE TABLE IF NOT EXISTS "InformeSemanal" (
        "id"           SERIAL       PRIMARY KEY,
        "semana"       VARCHAR(10)  NOT NULL,
        "desde"        TIMESTAMP(3) NOT NULL,
        "hasta"        TIMESTAMP(3) NOT NULL,
        "resumen"      TEXT         NOT NULL,
        "datos"        JSONB        NOT NULL,
        "generadoPor"  INTEGER,
        "generadoAuto" BOOLEAN      NOT NULL DEFAULT false,
        "modelo"       VARCHAR(100),
        "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `,
  },
  {
    // Una semana, un informe. Regenerar reemplaza el de esa semana.
    descripcion: 'Indice unico por semana',
    sql: `
      CREATE UNIQUE INDEX IF NOT EXISTS "InformeSemanal_semana_key"
        ON "InformeSemanal"("semana")
    `,
  },
  {
    descripcion: 'Indice por fecha de creacion',
    sql: `
      CREATE INDEX IF NOT EXISTS "InformeSemanal_createdAt_idx"
        ON "InformeSemanal"("createdAt")
    `,
  },
];

async function main() {
  console.log("Base:", process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":****@"));

  for (const { descripcion, sql } of SENTENCIAS) {
    await prisma.$executeRawUnsafe(sql);
    console.log("OK ->", descripcion);
  }

  // Verificacion: leer la estructura recien creada.
  const columnas = await prisma.$queryRawUnsafe<
    { column_name: string; data_type: string; is_nullable: string }[]
  >(`
    SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
     WHERE table_name = 'InformeSemanal'
     ORDER BY ordinal_position
  `);

  console.log("\nColumnas de InformeSemanal:");
  console.table(columnas);

  const filas = await prisma.$queryRawUnsafe<{ total: bigint }[]>(
    `SELECT COUNT(*)::bigint AS total FROM "InformeSemanal"`
  );
  console.log("Filas:", Number(filas[0]?.total ?? 0));

  // La tabla puede existir y el cliente de Prisma seguir sin conocerla si
  // falto el `prisma generate`. Esta lectura tipada lo confirma de verdad.
  const prueba = await prisma.informeSemanal.findMany({ take: 1 });
  console.log(
    "Cliente de Prisma: prisma.informeSemanal responde,",
    prueba.length,
    "fila(s)."
  );
}

main()
  .catch((error) => {
    console.error("Fallo creando la tabla:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
