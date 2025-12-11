-- CreateEnum
CREATE TYPE "TipoRelacion" AS ENUM ('CLIENTES', 'PROVEEDORES', 'INTERNO');

-- CreateEnum
CREATE TYPE "Area" AS ENUM ('CONTA', 'ADMIN', 'RRHH', 'TRIBUTARIO');

-- CreateEnum
CREATE TYPE "Presentacion" AS ENUM ('CLIENTE', 'INTERNO');

-- CreateEnum
CREATE TYPE "EstadoTarea" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'COMPLETADA', 'VENCIDA');

-- CreateEnum
CREATE TYPE "FrecuenciaTarea" AS ENUM ('MENSUAL', 'SEMANAL', 'UNICA');

-- AlterTable
ALTER TABLE "Trabajador" ADD COLUMN     "areaInterna" "Area",
ADD COLUMN     "carpetaDriveCodigo" VARCHAR(50),
ADD COLUMN     "googleRefreshToken" TEXT,
ADD COLUMN     "lastActivityAt" TIMESTAMP(3),
ADD COLUMN     "tipoRelacion" "TipoRelacion";

-- CreateTable
CREATE TABLE "Ticket" (
    "id_ticket" SERIAL NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "prioridad" INTEGER,
    "requesterEmail" TEXT NOT NULL,
    "freshdeskId" INTEGER,
    "trabajadorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id_ticket")
);

-- CreateTable
CREATE TABLE "TareaPlantilla" (
    "id_tarea_plantilla" SERIAL NOT NULL,
    "area" "Area" NOT NULL,
    "nombre" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "frecuenciaTexto" TEXT,
    "plazoMaximoTexto" TEXT,
    "frecuencia" "FrecuenciaTarea" NOT NULL,
    "diaMesVencimiento" INTEGER,
    "diaSemanaVencimiento" INTEGER,
    "presentacion" "Presentacion" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "responsableDefaultId" INTEGER,
    "codigoDocumento" TEXT,

    CONSTRAINT "TareaPlantilla_pkey" PRIMARY KEY ("id_tarea_plantilla")
);

-- CreateTable
CREATE TABLE "TareaAsignada" (
    "id_tarea_asignada" SERIAL NOT NULL,
    "tareaPlantillaId" INTEGER NOT NULL,
    "trabajadorId" INTEGER,
    "estado" "EstadoTarea" NOT NULL DEFAULT 'PENDIENTE',
    "fechaProgramada" TIMESTAMP(3) NOT NULL,
    "fechaComplecion" TIMESTAMP(3),
    "comentarios" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "rutCliente" TEXT,
    "driveTareaFolderId" VARCHAR(255),

    CONSTRAINT "TareaAsignada_pkey" PRIMARY KEY ("id_tarea_asignada")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" SERIAL NOT NULL,
    "rut" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "alias" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "agenteId" INTEGER,
    "codigoCartera" TEXT,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notificacion" (
    "id" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "trabajadorId" INTEGER NOT NULL,
    "tareaId" INTEGER,

    CONSTRAINT "Notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_freshdeskId_key" ON "Ticket"("freshdeskId");

-- CreateIndex
CREATE UNIQUE INDEX "TareaPlantilla_nombre_key" ON "TareaPlantilla"("nombre");

-- CreateIndex
CREATE INDEX "TareaPlantilla_area_idx" ON "TareaPlantilla"("area");

-- CreateIndex
CREATE INDEX "TareaPlantilla_responsableDefaultId_idx" ON "TareaPlantilla"("responsableDefaultId");

-- CreateIndex
CREATE INDEX "TareaAsignada_trabajadorId_idx" ON "TareaAsignada"("trabajadorId");

-- CreateIndex
CREATE INDEX "TareaAsignada_rutCliente_idx" ON "TareaAsignada"("rutCliente");

-- CreateIndex
CREATE INDEX "TareaAsignada_tareaPlantillaId_idx" ON "TareaAsignada"("tareaPlantillaId");

-- CreateIndex
CREATE INDEX "Cliente_agenteId_idx" ON "Cliente"("agenteId");

-- CreateIndex
CREATE INDEX "Cliente_codigoCartera_idx" ON "Cliente"("codigoCartera");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_rut_razonSocial_key" ON "Cliente"("rut", "razonSocial");

-- CreateIndex
CREATE INDEX "Notificacion_trabajadorId_idx" ON "Notificacion"("trabajadorId");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "Trabajador"("id_trabajador") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TareaPlantilla" ADD CONSTRAINT "TareaPlantilla_responsableDefaultId_fkey" FOREIGN KEY ("responsableDefaultId") REFERENCES "Trabajador"("id_trabajador") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TareaAsignada" ADD CONSTRAINT "TareaAsignada_tareaPlantillaId_fkey" FOREIGN KEY ("tareaPlantillaId") REFERENCES "TareaPlantilla"("id_tarea_plantilla") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TareaAsignada" ADD CONSTRAINT "TareaAsignada_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "Trabajador"("id_trabajador") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "Trabajador"("id_trabajador") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_tareaId_fkey" FOREIGN KEY ("tareaId") REFERENCES "TareaAsignada"("id_tarea_asignada") ON DELETE SET NULL ON UPDATE CASCADE;
