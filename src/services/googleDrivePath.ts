// src/services/googleDrivePath.ts
import type { drive_v3 } from "googleapis";

type DrivePath = {
  ids: string[];
  names: string[];
};

// Alias de tipos de la API de Drive
type DriveFile = drive_v3.Schema$File;
type DriveFileList = drive_v3.Schema$FileList;

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

  const data: DriveFileList = res.data;
  const files: DriveFile[] = data.files ?? [];
  const folder = files[0];

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

/**
 * Dado el ID de un archivo/carpeta, reconstruye la ruta completa
 * subiendo por los padres hasta llegar a root.
 */
export async function getFullPathFromId(
  drive: drive_v3.Drive,
  fileId: string
): Promise<DrivePath> {
  const ids: string[] = [];
  const names: string[] = [];

  let currentId: string | null | undefined = fileId;

  while (currentId) {
    const res = await drive.files.get({
      fileId: currentId,
      fields: "id, name, parents",
    });

    const file: DriveFile = res.data;
    if (!file.id) break;

    ids.unshift(file.id);
    names.unshift(file.name ?? "");

    const parents: string[] = (file.parents ?? []) as string[];

    // si no tiene padres o llegamos a root, cortamos
    if (parents.length === 0 || parents[0] === "root") {
      break;
    }

    currentId = parents[0];
  }

  return { ids, names };
}
