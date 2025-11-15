// src/services/googleDrivePath.ts
import { drive_v3 } from "googleapis";

/**
 * Busca una carpeta por nombre dentro de otra carpeta.
 * Devuelve el ID o null si no existe.
 */
export async function findFolderByName(
  drive: drive_v3.Drive,
  parentId: string,
  folderName: string
): Promise<string | null> {
  const res = await drive.files.list({
    q: [
      `'${parentId}' in parents`,
      "mimeType = 'application/vnd.google-apps.folder'",
      "trashed = false",
      `name = '${folderName.replace(/'/g, "\\'")}'`,
    ].join(" and "),
    fields: "files(id, name)",
    pageSize: 1,
  });

  const folder = res.data.files?.[0];
  return folder?.id ?? null;
}

/**
 * Resuelve una ruta tipo ["CINTAX", "2025"] empezando desde root.
 * Si en algún paso falta una carpeta, lanza error.
 */
export async function resolveFolderPath(
  drive: drive_v3.Drive,
  path: string[]
): Promise<string> {
  let currentParent = "root";

  for (const folderName of path) {
    const id = await findFolderByName(drive, currentParent, folderName);
    if (!id) {
      throw new Error(`No se encontró la carpeta "${folderName}" en la ruta dada`);
    }
    currentParent = id;
  }

  return currentParent; // ID final (ej: carpeta "2025")
}
