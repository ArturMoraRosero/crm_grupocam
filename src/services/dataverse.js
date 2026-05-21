/**
 * SharePoint REST API Connector via Microsoft Graph
 * Grupo Empresarial CAM Commercial System
 */

const SHAREPOINT_SITE = 'https://cambricondes.sharepoint.com/sites/CRMGrupoCAM';
const LIST_NAME = 'Oportunidades';
const GRAPH_ENDPOINT = 'https://graph.microsoft.com/v1.0';

let logSubscribers = [];

export function subscribeToLogs(callback) {
  logSubscribers.push(callback);
  return () => {
    logSubscribers = logSubscribers.filter(cb => cb !== callback);
  };
}

function pushLog(method, url, status, requestBody = null, responseBody = null) {
  const logEntry = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    timestamp: new Date().toLocaleTimeString('es-ES', { hour12: false }),
    method, url, status,
    requestBody: requestBody ? JSON.stringify(requestBody, null, 2) : null,
    responseBody: responseBody ? JSON.stringify(responseBody, null, 2) : null
  };
  logSubscribers.forEach(cb => cb(logEntry));
  try {
    const existingLogs = JSON.parse(sessionStorage.getItem('dataverse_logs') || '[]');
    existingLogs.unshift(logEntry);
    sessionStorage.setItem('dataverse_logs', JSON.stringify(existingLogs.slice(0, 100)));
  } catch (e) {}
}

const DEFAULT_CONFIG = {
  mode: 'live',
  authMethod: 'sso',
  envUrl: SHAREPOINT_SITE,
  tenantId: '1ca0c30f-47ee-40c7-a615-d950a4b2f9ca',
  clientId: '53ad5b18-7e6c-4cd1-aa08-48c0c851a67c',
  clientSecret: '',
  entityName: LIST_NAME,
  corsProxy: '',
  isConfigured: true
};

export function getSettings() {
  const saved = localStorage.getItem('dataverse_settings');
  return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CONFIG;
}

export function saveSettings(settings) {
  localStorage.setItem('dataverse_settings', JSON.stringify(settings));
  pushLog('SYSTEM', 'Configuración Guardada', '200 OK');
}

// Microsoft SSO Login via Graph API
export function loginMicrosoft() {
  const settings = getSettings();
  const redirectUri = window.location.origin + '/';
  const authUrl = `https://login.microsoftonline.com/${settings.tenantId}/oauth2/v2.0/authorize?` + new URLSearchParams({
    client_id: settings.clientId,
    response_type: 'token',
    redirect_uri: redirectUri,
    scope: 'https://graph.microsoft.com/Sites.ReadWrite.All',
    state: 'grupocam_crm_auth_state'
  }).toString();
  pushLog('SYSTEM', 'Redirigiendo a Microsoft SSO...', '302 Found');
  setTimeout(() => { window.location.href = authUrl; }, 200);
}

export function getActiveToken() {
  try {
    const saved = sessionStorage.getItem('dataverse_oauth_token');
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (Date.now() > parsed.expiryTime) {
      sessionStorage.removeItem('dataverse_oauth_token');
      return null;
    }
    return parsed.token;
  } catch (e) { return null; }
}

export function checkForRedirectToken() {
  const hash = window.location.hash;
  if (!hash) return null;
  const params = new URLSearchParams(hash.substring(1));
  const accessToken = params.get('access_token');
  const expiresIn = params.get('expires_in');
  if (accessToken) {
    const expiryTime = Date.now() + parseInt(expiresIn || '3600', 10) * 1000;
    sessionStorage.setItem('dataverse_oauth_token', JSON.stringify({ token: accessToken, expiryTime }));
    window.history.replaceState(null, null, window.location.pathname);
    pushLog('SYSTEM', 'Token Microsoft Graph obtenido', '200 OK');
    return accessToken;
  }
  return null;
}

// Get SharePoint site ID via Graph API
async function getSiteId(token) {
  const siteHost = 'cambricondes.sharepoint.com';
  const sitePath = '/sites/CRMGrupoCAM';
  const url = `${GRAPH_ENDPOINT}/sites/${siteHost}:${sitePath}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
  });
  const data = await res.json();
  return data.id;
}

// Get SharePoint list ID by name
async function getListId(token, siteId) {
  const url = `${GRAPH_ENDPOINT}/sites/${siteId}/lists?$filter=displayName eq '${LIST_NAME}'`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
  });
  const data = await res.json();
  return data.value?.[0]?.id;
}

// Map SharePoint item → React app model
function mapFromSharePoint(item) {
  const f = item.fields || item;
  return {
    id: String(item.id || f.id || ''),
    codigo: f.Title || 'OP-' + item.id,
    cliente: f.Cliente || '',
    contactoName: '',
    contactoEmail: '',
    contactoPhone: '',
    tipoCliente: 'Privado',
    lineaNegocio: 'CAM SCI',
    proyecto: '',
    monto: Number(f.Valor || 0),
    margen: 0,
    probabilidad: '50%',
    etapa: f.Etapa || 'Prospección',
    proximaAccion: 'Llamada',
    fechaAccion: f.Fechadecierre ? f.Fechadecierre.split('T')[0] : '',
    responsable: f.Responsable || 'Arturo Mora',
    estado: 'Abierta',
    motivoPerdida: '',
    fechaIngreso: new Date().toISOString().split('T')[0],
    notas: ''
  };
}

// Map React app model → SharePoint fields
function mapToSharePoint(op) {
  return {
    Title: op.codigo || op.cliente,
    Cliente: op.cliente,
    Valor: Number(op.monto || 0),
    Etapa: op.etapa,
    Fechadecierre: op.fechaAccion ? `${op.fechaAccion}T00:00:00Z` : null,
    Responsable: op.responsable
  };
}

export async function fetchOpportunities(localData) {
  const settings = getSettings();

  if (settings.mode !== 'live') {
    pushLog('GET', `${SHAREPOINT_SITE}/Oportunidades`, '200 OK (Demo Mode)');
    return localData;
  }

  const token = getActiveToken();
  if (!token) {
    pushLog('GET', 'SharePoint', '401 Sin Token - Usando datos locales');
    return localData;
  }

  try {
    pushLog('GET', `${GRAPH_ENDPOINT}/sites/.../lists/${LIST_NAME}/items`, '102 Consultando SharePoint...');
    const siteId = await getSiteId(token);
    const listId = await getListId(token, siteId);
    const url = `${GRAPH_ENDPOINT}/sites/${siteId}/lists/${listId}/items?expand=fields`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });
    const data = await res.json();
    pushLog('GET', url, '200 OK', null, data);
    if (data.value?.length > 0) {
      return data.value.map(mapFromSharePoint);
    }
    return localData;
  } catch (e) {
    pushLog('GET', 'SharePoint', `500 Error: ${e.message}`);
    return localData;
  }
}

export async function sendOpportunity(op, isNew = false) {
  const settings = getSettings();

  if (settings.mode !== 'live') {
    pushLog(isNew ? 'POST' : 'PATCH', `${SHAREPOINT_SITE}/Oportunidades`, isNew ? '201 Created (Demo)' : '204 Updated (Demo)');
    return op;
  }

  const token = getActiveToken();
  if (!token) {
    pushLog('SYSTEM', 'Sin token - guardado solo local', '401');
    return op;
  }

  try {
    const siteId = await getSiteId(token);
    const listId = await getListId(token, siteId);
    const fields = mapToSharePoint(op);

    if (isNew) {
      const url = `${GRAPH_ENDPOINT}/sites/${siteId}/lists/${listId}/items`;
      pushLog('POST', url, '102 Creando en SharePoint...', fields);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields })
      });
      const data = await res.json();
      pushLog('POST', url, '201 Created', null, data);
      return { ...op, id: String(data.id) };
    } else {
      const url = `${GRAPH_ENDPOINT}/sites/${siteId}/lists/${listId}/items/${op.id}/fields`;
      pushLog('PATCH', url, '102 Actualizando en SharePoint...', fields);
      await fetch(url, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(fields)
      });
      pushLog('PATCH', url, '200 OK');
      return op;
    }
  } catch (e) {
    pushLog('ERROR', 'SharePoint', `500 ${e.message}`);
    return op;
  }
}

export async function removeOpportunity(id) {
  const settings = getSettings();

  if (settings.mode !== 'live') {
    pushLog('DELETE', `${SHAREPOINT_SITE}/Oportunidades/${id}`, '204 Deleted (Demo)');
    return true;
  }

  const token = getActiveToken();
  if (!token) return true;

  try {
    const siteId = await getSiteId(token);
    const listId = await getListId(token, siteId);
    const url = `${GRAPH_ENDPOINT}/sites/${siteId}/lists/${listId}/items/${id}`;
    pushLog('DELETE', url, '102 Eliminando...');
    await fetch(url, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    pushLog('DELETE', url, '204 No Content');
    return true;
  } catch (e) {
    pushLog('DELETE', 'SharePoint', `500 ${e.message}`);
    return true;
  }
}

export async function authenticateOAuth() {
  return getActiveToken();
}
