-- Columnas nuevas para la ticketera (ver plan: Fase 0)
-- Generado con: prisma migrate diff --from-schema-datamodel ... --to-schema-datamodel ... --script
--
-- APLICAR A MANO sobre PostgreSQL. Despues correr:
--   npx prisma db pull && npx prisma generate
--
-- Es aditivo: no borra ni modifica datos existentes.

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "clienteId" INTEGER,
ADD COLUMN     "firstResponseAt" TIMESTAMP(3),
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "Ticket_clienteId_idx" ON "Ticket"("clienteId");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
