/**
 * Planos por cotizar: SharePoint vía Microsoft Graph
 * Sitio: cambricondes.sharepoint.com/sites/GESTIONCOMERCIAL
 *
 * Cada oportunidad tiene una carpeta determinística:
 *
 *   CRM_CAM_Reportes/Planos/{Cliente - Código - guid8}/plano_*.pdf|dwg|...
 *
 * Igual que las fotos de visitas, no se guarda nada en Dataverse. El KPI
 * "planos por cotizar" se calcula listando las carpetas de Planos/: la fecha
 * de creación de la carpeta es la fecha del primer plano de esa oportunidad,
 * así cada oportunidad cuenta una sola vez aunque se suban varios archivos.
 * El sufijo guid8 liga la carpeta a la oportunidad aunque cambie el cliente.
 */

import { getGraphToken, getGraphTokenSilent } from './graphAuth';
import { getSiteId, parseGraphError, encodePath, sanitizeFolderName } from './sharepointPhotos';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const ROOT_SEGMENTS = ['CRM_CAM_Reportes', 'Planos'];
const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024;
// Graph exige fragmentos múltiplos de 320 KiB en upload sessions.
const CHUNK_SIZE = 320 * 1024 * 16; // 5 MiB
export const MAX_PLANO_SIZE = 250 * 1024 * 1024;
export const PLANO_ACCEPT = '.pdf,.dwg,.dxf,.rvt,.ifc,.skp,.zip,.jpg,.jpeg,.png';

async function gfetch(token, path, options = {}) {
  return fetch(path.startsWith('http') ? path : `${GRAPH}${path}`, {
    ...options,
    headers: { 'Authorization': `Bearer ${token}`, ...(options.headers || {}) }
  });
}

export function opGuid8(op) {
  return (op?.id || '').replace(/-/g, '').slice(0, 8).toLowerCase();
}

/** "CARRANZA STUDIO - OP-2026-014 - 3f01b1d8" */
export function planoFolderName(op) {
  const parts = [sanitizeFolderName(op.cliente) || 'Oportunidad'];
  if (op.codigo) parts.push(sanitizeFolderName(op.codigo));
  parts.push(opGuid8(op));
  return parts.join(' - ');
}

/** Lista las carpetas de Planos/ (una por oportunidad con plano). */
async function listPlanoFoldersWithToken(token) {
  const siteId = await getSiteId();
  const out = [];
  let url = `/sites/${siteId}/drive/root:/${encodePath(...ROOT_SEGMENTS)}:/children` +
    `?$select=id,name,folder,createdDateTime,createdBy,webUrl&$top=999`;
  while (url) {
    const response = await gfetch(token, url);
    if (response.status === 404) return []; // aún no se ha subido ningún plano
    if (!response.ok) throw new Error(`No se pudieron listar los planos: ${await parseGraphError(response)}`);
    const data = await response.json();
    for (const item of data.value || []) {
      if (!item.folder) continue;
      const m = item.name.match(/ - ([0-9a-f]{8})$/i);
      out.push({
        id: item.id,
        name: item.name,
        guid8: m ? m[1].toLowerCase() : null,
        createdDateTime: item.createdDateTime,
        childCount: item.folder.childCount || 0,
        webUrl: item.webUrl
      });
    }
    url = data['@odata.nextLink'] || null;
  }
  return out;
}

/**
 * Para el Dashboard: usa solo token silencioso. Devuelve
 * { ok: true, folders } o { ok: false, needsAuth: true } si no hay sesión
 * de Graph (el usuario debe pulsar "Conectar SharePoint").
 */
export async function listPlanoFolders({ interactive = false } = {}) {
  const token = interactive ? await getGraphToken() : await getGraphTokenSilent();
  if (!token) return { ok: false, needsAuth: true, folders: [] };
  const folders = await listPlanoFoldersWithToken(token);
  return { ok: true, folders };
}

/** Busca la carpeta existente de la oportunidad por su guid8 (aunque cambie el cliente). */
async function resolvePlanoFolder(token, op) {
  const g8 = opGuid8(op);
  const folders = await listPlanoFoldersWithToken(token);
  const found = folders.find(f => f.guid8 === g8);
  return found ? found.name : planoFolderName(op);
}

/** Lista los archivos de plano de una oportunidad. [] si aún no tiene. */
export async function listPlanos(op) {
  const token = await getGraphToken();
  const siteId = await getSiteId();
  const folder = await resolvePlanoFolder(token, op);
  const response = await gfetch(token,
    `/sites/${siteId}/drive/root:/${encodePath(...ROOT_SEGMENTS, folder)}:/children` +
    `?$select=id,name,webUrl,size,createdDateTime,createdBy,folder&$orderby=name`);
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`No se pudieron cargar los planos: ${await parseGraphError(response)}`);
  const data = await response.json();
  return (data.value || []).filter(i => !i.folder).map(i => ({
    id: i.id,
    name: i.name,
    webUrl: i.webUrl,
    size: i.size,
    createdDateTime: i.createdDateTime,
    createdBy: i.createdBy?.user?.displayName || ''
  }));
}

function safeFileName(name) {
  const clean = (name || 'plano').replace(/[^a-zA-Z0-9._-]/g, '_');
  const stamp = new Date().toISOString().slice(0, 10);
  return `plano_${stamp}_${Date.now().toString().slice(-5)}_${clean}`;
}

/** Sube un plano (cualquier tamaño hasta MAX_PLANO_SIZE). */
export async function uploadPlano(op, file, onProgress) {
  if (!op?.id) throw new Error('Guarda la oportunidad antes de subir planos.');
  if (file.size > MAX_PLANO_SIZE) throw new Error(`"${file.name}" supera 250 MB.`);
  const token = await getGraphToken();
  const siteId = await getSiteId();
  const folder = await resolvePlanoFolder(token, op);
  const path = encodePath(...ROOT_SEGMENTS, folder, safeFileName(file.name));

  if (file.size <= SIMPLE_UPLOAD_LIMIT) {
    const response = await gfetch(token, `/sites/${siteId}/drive/root:/${path}:/content`, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file
    });
    if (!response.ok) throw new Error(`Error subiendo "${file.name}": ${await parseGraphError(response)}`);
    if (onProgress) onProgress(1);
    return response.json();
  }

  // Archivos grandes (planos PDF/DWG pesan fácil 10-100 MB): upload session.
  const sessionRes = await gfetch(token, `/sites/${siteId}/drive/root:/${path}:/createUploadSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename' } })
  });
  if (!sessionRes.ok) throw new Error(`No se pudo iniciar la subida de "${file.name}": ${await parseGraphError(sessionRes)}`);
  const { uploadUrl } = await sessionRes.json();

  let start = 0;
  let last = null;
  while (start < file.size) {
    const end = Math.min(start + CHUNK_SIZE, file.size);
    // uploadUrl ya viene autenticada: NO se envía Authorization.
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Range': `bytes ${start}-${end - 1}/${file.size}` },
      body: file.slice(start, end)
    });
    if (!res.ok && res.status !== 202) {
      try { await fetch(uploadUrl, { method: 'DELETE' }); } catch { /* sesión ya cerrada */ }
      throw new Error(`Error subiendo "${file.name}": HTTP ${res.status}`);
    }
    last = res;
    start = end;
    if (onProgress) onProgress(start / file.size);
  }
  return last.json();
}
