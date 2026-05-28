/**
 * Dataverse REST API Connector — Visitas Comerciales
 * Tabla: cr168_visits | Grupo Empresarial CAM
 */

import { authenticateOAuth, getSettings } from './dataverse';

let logSubscribers = [];

export function subscribeToVisitLogs(callback) {
  logSubscribers.push(callback);
  return () => { logSubscribers = logSubscribers.filter(cb => cb !== callback); };
}

function pushLog(method, url, status, requestBody = null, responseBody = null) {
  const logEntry = {
    id: 'vlog_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    timestamp: new Date().toLocaleTimeString('es-ES', { hour12: false }),
    method, url, status,
    requestBody: requestBody ? JSON.stringify(requestBody, null, 2) : null,
    responseBody: responseBody ? JSON.stringify(responseBody, null, 2) : null
  };
  logSubscribers.forEach(cb => cb(logEntry));
}

const ENTITY_NAME = 'cr168_visitses';

// ── Campo mapping: app → OData ──────────────────────────────────────────────

function mapToOData(v) {
  const payload = {};

  // Fecha y hora
  if (v.fecha) {
    payload.cr168_visitdatetime = v.hora
      ? `${v.fecha}T${v.hora}:00Z`
      : `${v.fecha}T00:00:00Z`;
  }

  // Campos de texto — solo se envían si tienen valor
  if (v.ejecutivo)           payload.cr168_executive          = v.ejecutivo;
  if (v.sector)              payload.cr168_sector             = v.sector;
  if (v.tipoVisita)          payload.cr168_visittype          = v.tipoVisita;
  if (v.nombreProyecto)      payload.cr168_projectname        = v.nombreProyecto;
  if (v.direccion)           payload.cr168_address            = v.direccion;
  if (v.linkMaps)            payload.cr168_mapslink           = v.linkMaps;
  if (v.coordenadas)         payload.cr168_coordinates        = v.coordenadas;
  if (v.secuenciaRecorrido)  payload.cr168_routesequence      = v.secuenciaRecorrido;
  if (v.tipoCliente)         payload.cr168_clienttype         = v.tipoCliente;
  if (v.etapaObra)           payload.cr168_constructionstage  = v.etapaObra;
  if (v.lineaNegocio)        payload.cr168_businessline       = v.lineaNegocio;
  if (v.contacto)            payload.cr168_contactidentified  = v.contacto;
  if (v.decisor)             payload.cr168_decisionmaker      = v.decisor;
  if (v.necesidadDetectada)  payload.cr168_detectedneeds      = v.necesidadDetectada;
  if (v.prioridad)           payload.cr168_commercialpriority = v.prioridad;
  if (v.estadoOportunidad)   payload.cr168_opportunitystatus  = v.estadoOportunidad;
  if (v.proximaAccion)       payload.cr168_nextaction         = v.proximaAccion;
  if (v.responsableSiguiente)payload.cr168_nextstepowner      = v.responsableSiguiente;
  if (v.observaciones)       payload.cr168_observations       = v.observaciones;
  if (v.proyectos?.length)   payload.cr168_projects           = v.proyectos.join(',');
  if (v.productos?.length)   payload.cr168_products           = v.productos.join(',');

  // Fecha seguimiento
  if (v.fechaSeguimiento) {
    payload.cr168_followupdate = `${v.fechaSeguimiento}T00:00:00Z`;
  }

  // Número decimal
  if (v.probabilidadCierre != null) {
    payload.cr168_closeprobability = parseFloat(v.probabilidadCierre) || 0;
  }

  // Lookup — formato OData bind (evita error 400 con Currency/Lookup)
  if (v.oportunidadId) {
    payload['cr168_opportunityref@odata.bind'] =
      `/cr168_salesopportunities(${v.oportunidadId})`;
  }

  return payload;
}

// ── Campo mapping: OData → app ──────────────────────────────────────────────

function mapFromOData(o) {
  const dt = o.cr168_visitdatetime;
  return {
    id: o.cr168_visitid || 'visit_' + Math.random().toString(36).substr(2, 9),
    fecha: dt ? dt.split('T')[0] : '',
    hora: dt ? dt.split('T')[1]?.slice(0, 5) : '',
    ejecutivo: o.cr168_executive || '',
    sector: o.cr168_sector || '',
    tipoVisita: o.cr168_visittype || 'Primera visita',
    nombreProyecto: o.cr168_projectname || '',
    direccion: o.cr168_address || '',
    linkMaps: o.cr168_mapslink || '',
    coordenadas: o.cr168_coordinates || '',
    secuenciaRecorrido: o.cr168_routesequence || '',
    tipoCliente: o.cr168_clienttype || '',
    etapaObra: o.cr168_constructionstage || '',
    lineaNegocio: o.cr168_businessline || '',
    contacto: o.cr168_contactidentified || '',
    decisor: o.cr168_decisionmaker || '',
    necesidadDetectada: o.cr168_detectedneeds || '',
    montoEstimado: Number(o.cr168_estimatedamount || 0),
    prioridad: o.cr168_commercialpriority || 'P2 — Media',
    estadoOportunidad: o.cr168_opportunitystatus || 'En seguimiento',
    proximaAccion: o.cr168_nextaction || 'Llamada',
    fechaSeguimiento: o.cr168_followupdate ? o.cr168_followupdate.split('T')[0] : '',
    responsableSiguiente: o.cr168_nextstepowner || '',
    probabilidadCierre: o.cr168_closeprobability || 0,
    observaciones: o.cr168_observations || '',
    proyectos: o.cr168_projects ? o.cr168_projects.split(',').filter(Boolean) : [],
    productos: o.cr168_products ? o.cr168_products.split(',').filter(Boolean) : [],
    oportunidadId: o.cr168_opportunityref || null,
    fechaRegistro: new Date().toISOString().split('T')[0]
  };
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function fetchVisits(localData = []) {
  const settings = getSettings();
  const endpoint = `${settings.envUrl}/api/data/v9.2/${ENTITY_NAME}`;

  if (settings.mode !== 'live') {
    pushLog('GET', endpoint, '200 OK (Demo Mode)');
    return localData;
  }

  const token = await authenticateOAuth();
  pushLog('GET', endpoint, '102 Processing...');

  try {
    const response = await fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0'
      }
    });
    if (!response.ok) {
      const errText = await response.text();
      pushLog('GET', endpoint, `${response.status} ${response.statusText}`, null, JSON.parse(errText || '{}'));
      throw new Error(`Fetch visits failed: ${response.statusText}`);
    }
    const data = await response.json();
    pushLog('GET', endpoint, '200 OK', null, data);
    return data.value?.length > 0 ? data.value.map(mapFromOData) : localData;
  } catch (e) {
    pushLog('GET', endpoint, `500 Error: ${e.message}`);
    throw e;
  }
}

export async function sendVisit(visit, isNew = false) {
  const settings = getSettings();
  const baseUrl = `${settings.envUrl}/api/data/v9.2/${ENTITY_NAME}`;
  const endpoint = isNew ? baseUrl : `${baseUrl}(${visit.id})`;
  const method = isNew ? 'POST' : 'PATCH';

  if (settings.mode !== 'live') {
    pushLog(method, endpoint, isNew ? '201 Created (Demo)' : '204 Updated (Demo)');
    return visit;
  }

  const token = await authenticateOAuth();
  const payload = mapToOData(visit);
  if (isNew) delete payload.cr168_visitid;
  pushLog(method, endpoint, '102 Syncing...', payload);

  try {
    const response = await fetch(endpoint, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const errText = await response.text();
      pushLog(method, endpoint, `${response.status} ${response.statusText}`, null, JSON.parse(errText || '{}'));
      throw new Error(`Visit sync failed: ${response.statusText}`);
    }
    const status = isNew ? '201 Created' : '204 No Content';
    let responseData = null;
    if (response.status !== 204) responseData = await response.json();
    pushLog(method, endpoint, status, null, responseData);
    return responseData ? mapFromOData(responseData) : visit;
  } catch (e) {
    pushLog(method, endpoint, `500 Sync Error: ${e.message}`);
    throw e;
  }
}

export async function removeVisit(id) {
  const settings = getSettings();
  const endpoint = `${settings.envUrl}/api/data/v9.2/${ENTITY_NAME}(${id})`;

  if (settings.mode !== 'live') {
    pushLog('DELETE', endpoint, '204 Deleted (Demo)');
    return true;
  }

  const token = await authenticateOAuth();
  pushLog('DELETE', endpoint, '102 Processing...');

  try {
    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' }
    });
    if (!response.ok) throw new Error(`Delete visit failed: ${response.statusText}`);
    pushLog('DELETE', endpoint, '204 No Content');
    return true;
  } catch (e) {
    pushLog('DELETE', endpoint, `500 Error: ${e.message}`);
    throw e;
  }
}
