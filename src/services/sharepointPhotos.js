/**
 * Fotos de visitas comerciales — SharePoint vía Microsoft Graph
 * Sitio: cambricondes.sharepoint.com/sites/CRMGrupoCAM
 *
 * Diseño: NO se guarda nada en Dataverse. Cada visita tiene una carpeta
 * determinística en la biblioteca de documentos del sitio:
 *
 *   Visitas CRM/{GUID de la visita}/foto_*.jpg
 *
 * La galería se arma listando la carpeta al abrir la visita. Ventajas:
 * cero columnas nuevas en Dataverse (capacidad cara), las fotos son visibles
 * para todo el equipo desde SharePoint, y no hay URLs que se desincronicen.
 */

import { getGraphToken } from './graphAuth';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const SITE_HOST = 'cambricondes.sharepoint.com';
const SITE_PATH = '/sites/CRMGrupoCAM';
const ROOT_FOLDER = 'Visitas CRM';
const SITE_ID_CACHE_KEY = 'sp_crm_site_id';

async function graphFetch(path, options = {}) {
  const token = await getGraphToken();
  const response = await fetch(`${GRAPH}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  return response;
}

async function parseGraphError(response) {
  let detail = '';
  try {
    const body = await response.json();
    detail = body?.error?.message || '';
  } catch { /* cuerpo no-JSON */ }
  return `HTTP ${response.status}${detail ? ` — ${detail}` : ''}`;
}

// ── Site ID ──────────────────────────────────────────────────────────────────

async function getSiteId() {
  const cached = sessionStorage.getItem(SITE_ID_CACHE_KEY);
  if (cached) return cached;
  const response = await graphFetch(`/sites/${SITE_HOST}:${SITE_PATH}`);
  if (!response.ok) {
    throw new Error(`No se pudo acceder al sitio de SharePoint: ${await parseGraphError(response)}`);
  }
  const data = await response.json();
  sessionStorage.setItem(SITE_ID_CACHE_KEY, data.id);
  return data.id;
}

// ── Compresión client-side ───────────────────────────────────────────────────
// Fotos de obra desde el celular pesan 3-12 MB; el upload simple de Graph
// acepta máx 4 MB. Redimensionamos a 1920px máx y JPEG 0.85 — queda bajo
// 1 MB típicamente, y sube rápido incluso con datos móviles en obra.

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.85;
const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024;

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width <= MAX_DIMENSION && height <= MAX_DIMENSION && file.size <= SIMPLE_UPLOAD_LIMIT) {
        resolve(file); // ya es manejable, no recomprimir
        return;
      }
      const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height, 1);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('No se pudo procesar la imagen.')),
        'image/jpeg',
        JPEG_QUALITY
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`El archivo "${file.name}" no es una imagen válida.`));
    };
    img.src = url;
  });
}

// ── Operaciones ──────────────────────────────────────────────────────────────

function encodePath(...segments) {
  return segments.map(encodeURIComponent).join('/');
}

/**
 * Sube una foto a la carpeta de la visita. Graph crea las carpetas
 * intermedias automáticamente en un PUT por ruta.
 * Devuelve el driveItem creado.
 */
export async function uploadVisitPhoto(visitId, file) {
  const siteId = await getSiteId();
  const blob = await compressImage(file);
  if (blob.size > SIMPLE_UPLOAD_LIMIT) {
    throw new Error(`"${file.name}" sigue pesando más de 4 MB tras comprimir. Reduce la resolución.`);
  }
  const safeName = `foto_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    .replace(/\.(png|heic|heif|webp|bmp)$/i, '.jpg');
  const path = encodePath(ROOT_FOLDER, visitId, safeName);
  const response = await graphFetch(
    `/sites/${siteId}/drive/root:/${path}:/content`,
    {
      method: 'PUT',
      headers: { 'Content-Type': blob.type || 'image/jpeg' },
      body: blob
    }
  );
  if (!response.ok) {
    throw new Error(`Error subiendo "${file.name}": ${await parseGraphError(response)}`);
  }
  return response.json();
}

/**
 * Lista las fotos de una visita con thumbnails listos para <img>.
 * Devuelve [] si la carpeta no existe todavía (visita sin fotos).
 */
export async function listVisitPhotos(visitId) {
  const siteId = await getSiteId();
  const path = encodePath(ROOT_FOLDER, visitId);
  const response = await graphFetch(
    `/sites/${siteId}/drive/root:/${path}:/children` +
    `?$select=id,name,webUrl,size,createdDateTime&$expand=thumbnails&$orderby=name`
  );
  if (response.status === 404) return [];
  if (!response.ok) {
    throw new Error(`No se pudieron cargar las fotos: ${await parseGraphError(response)}`);
  }
  const data = await response.json();
  return (data.value || [])
    .filter(item => !item.folder)
    .map(item => ({
      id: item.id,
      name: item.name,
      webUrl: item.webUrl,
      size: item.size,
      createdDateTime: item.createdDateTime,
      thumbnailUrl: item.thumbnails?.[0]?.medium?.url || item.thumbnails?.[0]?.small?.url || null
    }));
}

/** Elimina una foto por su id de driveItem. */
export async function deleteVisitPhoto(itemId) {
  const siteId = await getSiteId();
  const response = await graphFetch(`/sites/${siteId}/drive/items/${itemId}`, { method: 'DELETE' });
  if (!response.ok && response.status !== 404) {
    throw new Error(`No se pudo eliminar la foto: ${await parseGraphError(response)}`);
  }
  return true;
}

/**
 * Sube varias fotos en secuencia (evita throttling de Graph).
 * Devuelve { uploaded, errors } sin lanzar: la visita ya se guardó y un
 * fallo parcial de fotos no debe romper el flujo principal.
 */
export async function uploadVisitPhotos(visitId, files, onProgress) {
  const uploaded = [];
  const errors = [];
  for (let i = 0; i < files.length; i++) {
    if (onProgress) onProgress(i + 1, files.length);
    try {
      uploaded.push(await uploadVisitPhoto(visitId, files[i]));
    } catch (e) {
      errors.push(e.message);
    }
  }
  return { uploaded, errors };
}
