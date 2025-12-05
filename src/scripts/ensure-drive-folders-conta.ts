// src/scripts/ensure-drive-folders-conta.ts
import "dotenv/config";
import { PrismaClient, Area } from "@prisma/client";
import { ensureContaTaskFolderForTareaAsignada } from "../services/driveContaTasks";

const prisma = new PrismaClient();

// 🔒 Por ahora lo fijamos a A01 (Camila, id_trabajador = 7)
const ONLY_WORKER_ID = 7;

async function main() {
  console.log("🔹 Iniciando creación de carpetas Drive para tareas CONTA...");

  // Filtro base: solo tareas sin carpeta y con trabajador del área CONTA
  const where: any = {
    driveTareaFolderId: null,
    asignado: {
      areaInterna: Area.CONTA,
    },
  };

  // Limitar a A01 (Camila)
  if (ONLY_WORKER_ID && !Number.isNaN(ONLY_WORKER_ID)) {
    where.trabajadorId = ONLY_WORKER_ID;
    console.log("📌 Filtrando solo tareas del trabajadorId =", ONLY_WORKER_ID);
  }

  const tareas = await prisma.tareaAsignada.findMany({
    where,
    select: {
      id_tarea_asignada: true,
      trabajadorId: true,
      rutCliente: true,
      fechaProgramada: true,
      tareaPlantillaId: true,
    },
    orderBy: {
      id_tarea_asignada: "asc",
    },
  });

  console.log("📌 Tareas encontradas sin carpeta Drive:", tareas.length);

  if (tareas.length === 0) {
    console.log("✅ No hay tareas pendientes de carpeta. Nada que hacer.");
    return;
  }

  let ok = 0;
  let fail = 0;

  for (const t of tareas) {
    const id = t.id_tarea_asignada;
    const fechaISO = t.fechaProgramada
      ? t.fechaProgramada.toISOString()
      : "NULL";

    console.log(
      `\n▶️ Procesando tarea ${id} (trabajadorId=${t.trabajadorId}, rut=${t.rutCliente}, fecha=${fechaISO})`
    );

    try {
      const folderId = await ensureContaTaskFolderForTareaAsignada(id);
      console.log(`   ✅ Carpeta creada/asegurada → ${folderId}`);
      ok++;

      // Pausita para no bombardear la API de Drive
      await new Promise((r) => setTimeout(r, 200));
    } catch (e: any) {
      console.error(
        `   ❌ Error creando carpeta para tarea ${id}:`,
        e?.message ?? e
      );
      fail++;
    }
  }

  console.log("\n🏁 Proceso terminado.");
  console.log("   ✅ OK:", ok);
  console.log("   ❌ Errores:", fail);
}

main()
  .catch((e) => {
    console.error("❌ Error general del script:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
