/**
 * Fotos de visitas comerciales — SharePoint vía Microsoft Graph
 * Sitio: cambricondes.sharepoint.com/sites/GESTIONCOMERCIAL
 *
 * Diseño: NO se guarda nada en Dataverse. Cada visita tiene una carpeta
 * determinística en la biblioteca de documentos del sitio:
 *
 *   CRM_CAM_Reportes/Visitas/{Proyecto - fecha - guid8}/foto_*.jpg
 *
 * El nombre de la carpeta es legible (nombre del proyecto + fecha) y el
 * sufijo guid8 (primeros 8 caracteres del GUID de la visita) garantiza
 * unicidad y permite reencontrar la carpeta si el proyecto se renombra.
 * Las carpetas viejas nombradas con el GUID completo se renombran
 * automáticamente al nuevo formato la primera vez que se resuelven.
 *
 * (Subcarpeta "Visitas" para no mezclar las carpetas por visita con los
 * reportes que ya viven en CRM_CAM_Reportes.)
 *
 * La galería se arma listando la carpeta al abrir la visita. Ventajas:
 * cero columnas nuevas en Dataverse (capacidad cara), las fotos son visibles
 * para todo el equipo desde SharePoint, y no hay URLs que se desincronicen.
 */

import { getGraphToken } from './graphAuth';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const SITE_HOST = 'cambricondes.sharepoint.com';
const SITE_PATH = '/sites/GESTIONCOMERCIAL';
// Segmentos de la ruta raíz (se codifican por separado en las URLs de Graph).
const ROOT_SEGMENTS = ['CRM_CAM_Reportes', 'Visitas'];
// La clave incluye el sitio: si quedara la vieja ('sp_crm_site_id', sitio
// CRMGrupoCAM) cacheada en el navegador de alguien, apuntaría al sitio anterior.
const SITE_ID_CACHE_KEY = 'sp_gc_site_id';

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

// ── Carpeta por visita ───────────────────────────────────────────────────────

function encodePath(...segments) {
  return segments.map(encodeURIComponent).join('/');
}

/** Quita caracteres inválidos/problemáticos para nombres de carpeta en SharePoint. */
function sanitizeFolderName(name) {
  return (name || '')
    .replace(/["*:<>?/\\|#%~&{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '')
    .slice(0, 80)
    .trim();
}

/**
 * Nombre determinístico de la carpeta de una visita:
 *   "Edificio Torres del Norte - 2026-07-07 - 3f01b1d8"
 * visit: { id (GUID), nombreProyecto, fecha }
 */
export function visitFolderName(visit) {
  const guid8 = (visit.id || '').replace(/-/g, '').slice(0, 8).toLowerCase();
  const parts = [sanitizeFolderName(visit.nombreProyecto) || 'Visita'];
  if (visit.fecha) parts.push(visit.fecha);
  parts.push(guid8);
  return parts.join(' - ');
}

/** GET metadata de una carpeta bajo Visitas/. Devuelve el driveItem o null (404). */
async function getFolderItem(siteId, folderName) {
  const response = await graphFetch(
    `/sites/${siteId}/drive/root:/${encodePath(...ROOT_SEGMENTS, folderName)}` +
    `?$select=id,name,folder`
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`No se pudo verificar la carpeta de la visita: ${await parseGraphError(response)}`);
  }
  return response.json();
}

/** Renombra un driveItem. Best-effort: devuelve true/false, no lanza. */
async function renameItem(siteId, itemId, newName) {
  try {
    const response = await graphFetch(`/sites/${siteId}/drive/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName })
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Resuelve el nombre de carpeta a usar para una visita:
 *  1. Carpeta con el nombre nuevo → usarla.
 *  2. Carpeta legacy nombrada con el GUID completo → renombrarla al formato
 *     nuevo (migración automática) y usarla.
 *  3. Carpeta con el sufijo " - guid8" pero otro nombre de proyecto/fecha
 *     (el proyecto fue renombrado) → renombrarla al nombre actual.
 *  4. Nada existe → devolver el nombre nuevo (se crea al subir la 1ª foto).
 * Cachea el resultado en sessionStorage por visita.
 */
async function resolveVisitFolder(visit) {
  const target = visitFolderName(visit);
  const cacheKey = `sp_visit_folder_${visit.id}`;
  if (sessionStorage.getItem(cacheKey) === target) return target;

  const siteId = await getSiteId();

  // 1. Ya existe con el nombre correcto.
  if (await getFolderItem(siteId, target)) {
    sessionStorage.setItem(cacheKey, target);
    return target;
  }

  // 2. Carpeta legacy = GUID completo.
  const legacy = await getFolderItem(siteId, visit.id);
  if (legacy) {
    const renamed = await renameItem(siteId, legacy.id, target);
    const name = renamed ? target : visit.id;
    sessionStorage.setItem(cacheKey, name);
    return name;
  }

  // 3. Proyecto/fecha cambiaron: buscar por sufijo guid8 entre las carpetas.
  const guid8 = (visit.id || '').replace(/-/g, '').slice(0, 8).toLowerCase();
  if (guid8) {
    const response = await graphFetch(
      `/sites/${siteId}/drive/root:/${encodePath(...ROOT_SEGMENTS)}:/children?$select=id,name,folder&$top=999`
    );
    if (response.ok) {
      const data = await response.json();
      const match = (data.value || []).find(
        item => item.folder && item.name.toLowerCase().endsWith(` - ${guid8}`)
      );
      if (match) {
        const renamed = await renameItem(siteId, match.id, target);
        const name = renamed ? target : match.name;
        sessionStorage.setItem(cacheKey, name);
        return name;
      }
    }
  }

  // 4. Visita sin fotos todavía.
  sessionStorage.setItem(cacheKey, target);
  return target;
}

// ── Operaciones ──────────────────────────────────────────────────────────────

/**
 * Sube una foto a la carpeta de la visita. Graph crea las carpetas
 * intermedias automáticamente en un PUT por ruta.
 * visit: { id, nombreProyecto, fecha }. Devuelve el driveItem creado.
 */
export async function uploadVisitPhoto(visit, file) {
  const siteId = await getSiteId();
  const folder = await resolveVisitFolder(visit);
  const blob = await compressImage(file);
  if (blob.size > SIMPLE_UPLOAD_LIMIT) {
    throw new Error(`"${file.name}" sigue pesando más de 4 MB tras comprimir. Reduce la resolución.`);
  }
  const safeName = `foto_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    .replace(/\.(png|heic|heif|webp|bmp)$/i, '.jpg');
  const path = encodePath(...ROOT_SEGMENTS, folder, safeName);
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
 * visit: { id, nombreProyecto, fecha }.
 * Devuelve [] si la carpeta no existe todavía (visita sin fotos).
 */
export async function listVisitPhotos(visit) {
  const siteId = await getSiteId();
  const folder = await resolveVisitFolder(visit);
  const path = encodePath(...ROOT_SEGMENTS, folder);
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
 * visit: { id, nombreProyecto, fecha }.
 * Devuelve { uploaded, errors } sin lanzar: la visita ya se guardó y un
 * fallo parcial de fotos no debe romper el flujo principal.
 */
export async function uploadVisitPhotos(visit, files, onProgress) {
  const uploaded = [];
  const errors = [];
  for (let i = 0; i < files.length; i++) {
    if (onProgress) onProgress(i + 1, files.length);
    try {
      uploaded.push(await uploadVisitPhoto(visit, files[i]));
    } catch (e) {
      errors.push(e.message);
    }
  }
  return { uploaded, errors };
}
