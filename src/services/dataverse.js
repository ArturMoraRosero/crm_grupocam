/**
 * Dataverse REST API Connector & Microsoft OAuth 2.0 Client
 * Grupo Empresarial CAM Commercial System
 */

let logSubscribers = [];

export function subscribeToLogs(callback) {
  logSubscribers.push(callback);
  return () => { logSubscribers = logSubscribers.filter(cb => cb !== callback); };
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
  } catch (e) { console.error(e); }
}

const DEFAULT_CONFIG = {
  mode: 'live',
  authMethod: 'sso',
  envUrl: 'https://org41017f3e.api.crm2.dynamics.com',
  tenantId: '1ca0c30f-47ee-40c7-a615-d950a4b2f9ca',
  clientId: '53ad5b18-7e6c-4cd1-aa08-48c0c851a67c',
  clientSecret: '',
  entityName: 'cr168_salesopportunities',
  corsProxy: '',
  isConfigured: true
};

export function getSettings() {
  const saved = localStorage.getItem('dataverse_settings');
  return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CONFIG;
}

export function saveSettings(settings) {
  localStorage.setItem('dataverse_settings', JSON.stringify(settings));
  pushLog('SYSTEM', 'Configuración de Dataverse Guardada', '200 OK', null, settings);
}

const STAGE_TO_INT = {
  'Prospección': 0, 'Prospeccion': 0,
  'Calificación': 553050001, 'Calificacion': 553050001,
  'Diagnóstico técnico': 553050001, 'Diagnostico tecnico': 553050001,
  'Propuesta': 553050002,
  'Negociación': 553050003, 'Negociacion': 553050003,
  'Seguimiento': 553050003,
  'Cierre': 553050004,
  'Cierre Ganado': 553050004,
  'Cierre Perdido': 553050005,
  'Postventa': 553050004
};

const INT_TO_STAGE = {
  0: 'Prospección',
  553050001: 'Calificación',
  553050002: 'Propuesta',
  553050003: 'Negociación',
  553050004: 'Cierre',
  553050005: 'Cierre Perdido'
};

function mapToOData(op) {
  return {
    cr168_salesopportunityid: op.id,
    cr168_opportunitycode: op.codigo,
    cr168_clientorcompany: op.cliente,
    cr168_contactandphone: `${op.contactoName || ''} - ${op.contactoPhone || ''}`,
    cr168_businessline: op.lineaNegocio,
    cr168_estimatedamount: Number(op.monto || 0),
    cr168_closeprobability: (parseFloat(op.probabilidad) || 50) / 100,
    cr168_salesstage: STAGE_TO_INT[op.etapa] ?? 0,
    cr168_nextaction: op.proximaAccion,
    cr168_nextactiondate: op.fechaAccion ? `${op.fechaAccion}T00:00:00Z` : null,
    cr168_responsibleperson: op.responsable,
    cr168_followupnotes: op.notas || '',
    cr168_contactemail: op.contactoEmail || '',
    cr168_clienttype: op.tipoCliente || '',
    cr168_entrydate: op.fechaIngreso || null,
    cr168_dealstatus: op.estado || '',
    cr168_lossreason: op.motivoPerdida || ''
  };
}

function mapFromOData(odata) {
  return {
    id: odata.cr168_salesopportunityid || 'op_' + Math.random().toString(36).substr(2, 9),
    codigo: odata.cr168_opportunitycode || 'OP-MIG-' + Math.floor(100 + Math.random() * 900),
    cliente: odata.cr168_clientorcompany || 'Cliente Sin Nombre',
    contactoName: odata.cr168_contactandphone ? odata.cr168_contactandphone.split(' - ')[0] : '',
    contactoEmail: odata.cr168_contactemail || '',
    contactoPhone: odata.cr168_contactandphone?.includes(' - ') ? odata.cr168_contactandphone.split(' - ')[1] : '',
    tipoCliente: odata.cr168_clienttype || 'Privado',
    lineaNegocio: odata.cr168_businessline || 'CAM SCI',
    proyecto: '',
    monto: Number(odata.cr168_estimatedamount || 0),
    margen: 0,
    probabilidad: odata.cr168_closeprobability ? `${Math.round(odata.cr168_closeprobability * 100)}%` : '50%',
    etapa: INT_TO_STAGE[odata.cr168_salesstage] || 'Prospección',
    proximaAccion: odata.cr168_nextaction || 'Llamada',
    fechaAccion: odata.cr168_nextactiondate ? odata.cr168_nextactiondate.split('T')[0] : '',
    responsable: odata.cr168_responsibleperson || 'Arturo Mora',
    estado: odata.cr168_dealstatus || 'Abierta',
    motivoPerdida: odata.cr168_lossreason || '',
    fechaIngreso: odata.cr168_entrydate ? odata.cr168_entrydate.split('T')[0] : new Date().toISOString().split('T')[0],
    notas: odata.cr168_followupnotes || ''
  };
}

export function loginMicrosoft() {
  const settings = getSettings();
  const redirectUri = window.location.origin + '/';
  const authUrl = `https://login.microsoftonline.com/${settings.tenantId}/oauth2/v2.0/authorize?` + new URLSearchParams({
    client_id: settings.clientId,
    response_type: 'token',
    redirect_uri: redirectUri,
    scope: `${settings.envUrl}/user_impersonation`,
    state: 'grupocam_crm_auth_state'
  }).toString();
  pushLog('SYSTEM', 'Redirigiendo a Microsoft Entra ID para SSO...', '302 Found');
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
    window.history.replaceState(null, null, window.location.pathname + window.location.search);
    pushLog('SYSTEM', 'Token SSO Microsoft obtenido', '200 OK');
    return accessToken;
  }
  return null;
}

export async function authenticateOAuth() {
  const settings = getSettings();
  if (settings.mode !== 'live') {
    return 'simulated_token_' + Math.random().toString(36).substring(7);
  }
  if (settings.authMethod === 'sso') {
    const token = getActiveToken();
    if (!token) throw new Error('Requiere iniciar sesión con Microsoft.');
    return token;
  }
  const tokenUrl = `https://login.microsoftonline.com/${settings.tenantId}/oauth2/v2.0/token`;
  const finalUrl = settings.corsProxy ? `${settings.corsProxy}${tokenUrl}` : tokenUrl;
  const bodyParams = new URLSearchParams();
  bodyParams.append('grant_type', 'client_credentials');
  bodyParams.append('client_id', settings.clientId);
  bodyParams.append('client_secret', settings.clientSecret);
  bodyParams.append('scope', `${settings.envUrl}/.default`);
  const response = await fetch(finalUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: bodyParams.toString()
  });
  if (!response.ok) throw new Error(`Auth failed: ${response.statusText}`);
  const data = await response.json();
  return data.access_token;
}

export async function fetchOpportunities(localData) {
  const settings = getSettings();
  if (settings.mode !== 'live') {
    pushLog('GET', `${settings.envUrl}/api/data/v9.2/${settings.entityName}`, '200 OK (Demo Mode)');
    return localData;
  }
  const token = await authenticateOAuth();
  const endpoint = `${settings.envUrl}/api/data/v9.2/${settings.entityName}`;
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
      throw new Error(`Fetch failed: ${response.statusText}`);
    }
    const data = await response.json();
    pushLog('GET', endpoint, '200 OK', null, data);
    // Dataverse es la fuente de verdad: devolvemos lo que haya (incluso vacío),
    // sin caer de vuelta a los datos locales que ocultarían el estado real.
    return Array.isArray(data.value) ? data.value.map(mapFromOData) : [];
  } catch (e) {
    pushLog('GET', endpoint, `500 Error: ${e.message}`);
    throw e;
  }
}

export async function sendOpportunity(op, isNew = false) {
  const settings = getSettings();
  if (settings.mode !== 'live') {
    pushLog(isNew ? 'POST' : 'PATCH', `${settings.envUrl}/api/data/v9.2/${settings.entityName}`, isNew ? '201 Created (Demo)' : '204 Updated (Demo)');
    return op;
  }
  const token = await authenticateOAuth();
  const baseUrl = `${settings.envUrl}/api/data/v9.2/${settings.entityName}`;
  const endpoint = isNew ? baseUrl : `${baseUrl}(${op.id})`;
  const method = isNew ? 'POST' : 'PATCH';
  const payload = mapToOData(op);
  if (isNew) delete payload.cr168_salesopportunityid;
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
      throw new Error(`Dataverse sync failed: ${response.statusText}`);
    }
    const responseStatus = isNew ? '201 Created' : '204 No Content';
    let responseData = null;
    if (response.status !== 204) responseData = await response.json();
    pushLog(method, endpoint, responseStatus, null, responseData);
    return responseData ? mapFromOData(responseData) : op;
  } catch (e) {
    pushLog(method, endpoint, `500 Sync Error: ${e.message}`);
    throw e;
  }
}

export async function removeOpportunity(id) {
  const settings = getSettings();
  if (settings.mode !== 'live') {
    pushLog('DELETE', `${settings.envUrl}/api/data/v9.2/${settings.entityName}(${id})`, '204 Deleted (Demo)');
    return true;
  }
  const token = await authenticateOAuth();
  const endpoint = `${settings.envUrl}/api/data/v9.2/${settings.entityName}(${id})`;
  pushLog('DELETE', endpoint, '102 Processing...');
  try {
    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' }
    });
    if (!response.ok) throw new Error(`Delete failed: ${response.statusText}`);
    pushLog('DELETE', endpoint, '204 No Content');
    return true;
  } catch (e) {
    pushLog('DELETE', endpoint, `500 Error: ${e.message}`);
    throw e;
  }
}
