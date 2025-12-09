"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findFolderByName = findFolderByName;
exports.resolveFolderPath = resolveFolderPath;
exports.getFullPathFromId = getFullPathFromId;
/**
 * Busca una carpeta por nombre dentro de otra carpeta.
 * Devuelve el ID o null si no existe.
 */
async function findFolderByName(drive, parentId, folderName) {
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
    const data = res.data;
    const files = data.files ?? [];
    const folder = files[0];
    return folder?.id ?? null;
}
/**
 * Resuelve una ruta tipo ["CINTAX", "2025"] empezando desde root.
 * Si en algún paso falta una carpeta, lanza error.
 */
async function resolveFolderPath(drive, path) {
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
async function getFullPathFromId(drive, fileId) {
    const ids = [];
    const names = [];
    let currentId = fileId;
    while (currentId) {
        const res = await drive.files.get({
            fileId: currentId,
            fields: "id, name, parents",
        });
        const file = res.data;
        if (!file.id)
            break;
        ids.unshift(file.id);
        names.unshift(file.name ?? "");
        const parents = (file.parents ?? []);
        // si no tiene padres o llegamos a root, cortamos
        if (parents.length === 0 || parents[0] === "root") {
            break;
        }
        currentId = parents[0];
    }
    return { ids, names };
}
