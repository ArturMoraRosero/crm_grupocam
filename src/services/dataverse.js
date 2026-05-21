/**
 * Dataverse REST API Connector & Microsoft OAuth 2.0 Client
 * Grupo Empresarial CAM Commercial System
 */

// Subscriber for live API logging telemetry
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
    method,
    url,
    status,
    requestBody: requestBody ? JSON.stringify(requestBody, null, 2) : null,
    responseBody: responseBody ? JSON.stringify(responseBody, null, 2) : null
  };

  logSubscribers.forEach(cb => cb(logEntry));
  
  // Persist logs in session storage for continuity
  try {
    const existingLogs = JSON.parse(sessionStorage.getItem('dataverse_logs') || '[]');
    existingLogs.unshift(logEntry);
    sessionStorage.setItem('dataverse_logs', JSON.stringify(existingLogs.slice(0, 100)));
  } catch (e) {
    console.error(e);
  }
}

// Config variables stored in localStorage
const DEFAULT_CONFIG = {
  mode: 'live', // 'demo' or 'live'
  authMethod: 'sso', // 'sso' (Microsoft Interactive) or 'secret' (Client Credentials)
  envUrl: 'https://org41017f3e.api.crm2.dynamics.com',
  tenantId: '1ca0c30f-47ee-40c7-a615-d950a4b2f9ca',
  clientId: '53ad5b18-7e6c-4cd1-aa08-48c0c851a67c',
  clientSecret: '••••••••••••••••••••••••••••••••',
  entityName: 'cr168_salesopportunities',
  corsProxy: '', // Optional CORS Proxy URL (e.g. https://cors-anywhere.herokuapp.com/)
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

// Sales Stage Choice field mapping (text label → Dataverse integer code)
const STAGE_TO_INT = {
  'Prospección': 0,
  'Prospeccion': 0,
  'Calificación': 553050001,
  'Calificacion': 553050001,
  'Propuesta': 553050002,
  'Negociación': 553050003,
  'Negociacion': 553050003,
  'Cierre Ganado': 553050004,
  'Cierre Perdido': 553050005
};

const INT_TO_STAGE = {
  0: 'Prospección',
  553050001: 'Calificación',
  553050002: 'Propuesta',
  553050003: 'Negociación',
  553050004: 'Cierre Ganado',
  553050005: 'Cierre Perdido'
};

// Simulated/Real OData formatting helper (to Dataverse schema)
function mapToOData(op) {
  return {
    cr168_salesopportunityid: op.id,
    cr168_opportunitycode: op.codigo,
    cr168_clientorcompany: op.cliente,
    cr168_contactandphone: `${op.contactoName} - ${op.contactoPhone}`, // Combining to match "Contact an..."
    cr168_businessline: op.lineaNegocio,
    cr168_estimatedamount: Number(op.monto || 0),
    cr168_closeprobability: parseFloat(op.probabilidad) || 0.5, // "Close Pro..." is decimal
    cr168_salesstage: STAGE_TO_INT[op.etapa] ?? 0, // Convert text label to Dataverse Choice integer
    cr168_nextaction: op.proximaAccion,
    cr168_nextactiondate: op.fechaAccion ? `${op.fechaAccion}T00:00:00Z` : null,
    cr168_responsibleperson: op.responsable
  };
}

// Reverse mapping helper (from Dataverse OData schema to React app schema)
function mapFromOData(odata) {
  return {
    id: odata.cr168_salesopportunityid || odata.opportunityid || 'op_' + Math.random().toString(36).substr(2, 9),
    codigo: odata.cr168_opportunitycode || 'OP-MIG-' + Math.floor(100 + Math.random() * 900),
    cliente: odata.cr168_clientorcompany || 'Cliente Sin Nombre',
    contactoName: odata.cr168_contactandphone ? odata.cr168_contactandphone.split(' - ')[0] : '',
    contactoEmail: '', // Not in current Power Apps view
    contactoPhone: odata.cr168_contactandphone && odata.cr168_contactandphone.includes(' - ') ? odata.cr168_contactandphone.split(' - ')[1] : '',
    tipoCliente: 'Privado', // Not in current Power Apps view
    lineaNegocio: odata.cr168_businessline || 'CAM SCI',
    proyecto: '', // Not in current Power Apps view
    monto: Number(odata.cr168_estimatedamount || 0),
    margen: 0, // Not in current Power Apps view
    probabilidad: odata.cr168_closeprobability ? `${odata.cr168_closeprobability * 100}%` : '50%',
    etapa: INT_TO_STAGE[odata.cr168_salesstage] || odata.cr168_salesstage || 'Prospección',
    proximaAccion: odata.cr168_nextaction || 'Llamada',
    fechaAccion: odata.cr168_nextactiondate ? odata.cr168_nextactiondate.split('T')[0] : '',
    responsable: odata.cr168_responsibleperson || 'Arturo Mora',
    estado: 'Abierta', // Needs handling if added to Power Apps
    motivoPerdida: '',
    fechaIngreso: new Date().toISOString().split('T')[0],
    notas: ''
  };
}

// Redirect client to Microsoft Entra ID portal for SSO login
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
  
  pushLog('SYSTEM', 'Redirigiendo a Microsoft Entra ID para SSO...', '302 Found', null, { authUrl });
  
  // Brief delay to ensure logging persistence triggers
  setTimeout(() => {
    window.location.href = authUrl;
  }, 200);
}

// Check session storage for an active, unexpired OAuth user token
export function getActiveToken() {
  try {
    const saved = sessionStorage.getItem('dataverse_oauth_token');
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (Date.now() > parsed.expiryTime) {
      sessionStorage.removeItem('dataverse_oauth_token');
      pushLog('SYSTEM', 'El Token de Microsoft ha Expirado', '401 Unauthorized');
      return null;
    }
    return parsed.token;
  } catch (e) {
    return null;
  }
}

// Extract OAuth response from the redirect URL hash
export function checkForRedirectToken() {
  const hash = window.location.hash;
  if (!hash) return null;
  
  const params = new URLSearchParams(hash.substring(1)); // strip '#'
  const accessToken = params.get('access_token');
  const expiresIn = params.get('expires_in');
  
  if (accessToken) {
    const expiryTime = Date.now() + parseInt(expiresIn || '3600', 10) * 1000;
    const sessionData = {
      token: accessToken,
      expiryTime
    };
    sessionStorage.setItem('dataverse_oauth_token', JSON.stringify(sessionData));
    
    // Clean hash from URL for cleaner UX
    window.history.replaceState(null, null, window.location.pathname + window.location.search);
    
    pushLog('SYSTEM', 'Inicio de Sesión SSO Microsoft Completado', '200 OK', null, {
      message: 'Token OAuth 2.0 guardado en almacenamiento de sesión.',
      expiresInSeconds: expiresIn
    });
    
    return accessToken;
  }
  return null;
}

export async function authenticateOAuth() {
  const settings = getSettings();
  
  if (settings.mode !== 'live') {
    // Mode Demo: Simulated Token
    const simulatedToken = 'simulated_bearer_token_grupocam_crm_' + Math.random().toString(36).substring(7);
    pushLog('POST', 'https://login.microsoftonline.com/simulated/token', '200 OK (Simulated Auth)', null, {
      token_type: 'Bearer',
      expires_in: 3600,
      access_token: simulatedToken
    });
    return simulatedToken;
  }

  // Live Connection Mode:
  if (settings.authMethod === 'sso') {
    const token = getActiveToken();
    if (!token) {
      pushLog('SYSTEM', 'Error: No se encontró sesión activa de Microsoft', '401 Unauthorized');
      throw new Error('Requiere iniciar sesión interactiva con Microsoft.');
    }
    return token;
  } else {
    // Client Credentials mode (using Client Secret with CORS proxy support)
    const tokenUrl = `https://login.microsoftonline.com/${settings.tenantId}/oauth2/v2.0/token`;
    const finalUrl = settings.corsProxy ? `${settings.corsProxy}${tokenUrl}` : tokenUrl;
    
    pushLog('POST', tokenUrl, '102 Processing (Authenticating Client Credentials)', {
      grant_type: 'client_credentials',
      client_id: settings.clientId,
      scope: `${settings.envUrl}/.default`
    });

    try {
      const bodyParams = new URLSearchParams();
      bodyParams.append('grant_type', 'client_credentials');
      bodyParams.append('client_id', settings.clientId);
      bodyParams.append('client_secret', settings.clientSecret);
      bodyParams.append('scope', `${settings.envUrl}/.default`);

      const response = await fetch(finalUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: bodyParams.toString()
      });

      if (!response.ok) {
        const errText = await response.text();
        pushLog('POST', tokenUrl, `${response.status} ${response.statusText}`, null, JSON.parse(errText || '{}'));
        throw new Error(`Auth failed: ${response.statusText}`);
      }

      const data = await response.json();
      pushLog('POST', tokenUrl, '200 OK (Authenticated Client Credentials)', null, {
        token_type: 'Bearer',
        expires_in: data.expires_in
      });
      return data.access_token;
    } catch (e) {
      pushLog('POST', tokenUrl, '500 Server Error / CORS Blocked', null, {
        error: e.message,
        tip: 'Si ves un error de CORS, se debe a que Azure AD no permite Client Credentials directo desde el browser. Por favor utiliza el método de autenticación interactivo (SSO Microsoft) o configura un CORS proxy.'
      });
      throw e;
    }
  }
}

export async function fetchOpportunities(localData) {
  const settings = getSettings();
  
  if (settings.mode !== 'live') {
    // Simulated OData fetching
    pushLog('GET', `${settings.envUrl}/api/data/v9.2/${settings.entityName}`, '102 Processing (Local Cache Fetch)');
    await new Promise(resolve => setTimeout(resolve, 400));
    pushLog('GET', `${settings.envUrl}/api/data/v9.2/${settings.entityName}`, '200 OK (Loaded from Cache)', null, {
      '@odata.context': `${settings.envUrl}/api/data/v9.2/$metadata#${settings.entityName}`,
      value: localData.map(mapToOData)
    });
    return localData;
  }

  // Real Microsoft Dataverse API GET request:
  const token = await authenticateOAuth();
  const entity = settings.entityName || 'cr57a_sales_opportunities';
  const endpoint = `${settings.envUrl}/api/data/v9.2/${entity}`;

  pushLog('GET', endpoint, '102 Processing (Fetching from Dataverse API)');

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
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
      throw new Error(`Dataverse fetch failed: ${response.statusText}`);
    }

    const data = await response.json();
    pushLog('GET', endpoint, '200 OK', null, data);
    
    // Map OData array back to internal React models
    if (data.value && Array.isArray(data.value)) {
      return data.value.map(mapFromOData);
    }
    return [];
  } catch (e) {
    pushLog('GET', endpoint, '500 Fetch Error', null, { error: e.message });
    throw e;
  }
}

export async function sendOpportunity(op, isNew = false) {
  const settings = getSettings();
  
  if (settings.mode !== 'live') {
    // Simulated OData Sync
    const method = isNew ? 'POST' : 'PATCH';
    const simulatedEndpoint = `${settings.envUrl}/api/data/v9.2/${settings.entityName}${isNew ? '' : `(${op.id})`}`;
    pushLog(method, simulatedEndpoint, '102 Processing (Local Sync)');
    await new Promise(resolve => setTimeout(resolve, 400));
    
    const payload = mapToOData(op);
    const responseStatus = isNew ? '201 Created' : '204 No Content';
    const responseData = isNew ? { ...payload, cr168_salesopportunityid: op.id } : null;

    pushLog(method, simulatedEndpoint, responseStatus, null, responseData);
    return op;
  }

  // Real Microsoft Dataverse API POST/PATCH request:
  const token = await authenticateOAuth();
  const entity = settings.entityName || 'cr57a_sales_opportunities';
  const baseUrl = `${settings.envUrl}/api/data/v9.2/${entity}`;
  const endpoint = isNew ? baseUrl : `${baseUrl}(${op.id})`;
  const method = isNew ? 'POST' : 'PATCH';

  const payload = mapToOData(op);
  if (isNew) {
    // Delete opportunity ID so Dataverse generates a new unique GUID
    delete payload.cr168_salesopportunityid;
  }

  pushLog(method, endpoint, '102 Syncing Opportunity with Dataverse', payload);

  try {
    const response = await fetch(endpoint, {
      method: method,
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
    
    if (response.status !== 204) {
      responseData = await response.json();
    }

    pushLog(method, endpoint, responseStatus, null, responseData);
    
    if (responseData) {
      return mapFromOData(responseData);
    }
    return op;
  } catch (e) {
    pushLog(method, endpoint, '500 Sync Error', null, { error: e.message });
    throw e;
  }
}

export async function removeOpportunity(id) {
  const settings = getSettings();
  
  if (settings.mode !== 'live') {
    // Simulated OData Delete
    const simulatedEndpoint = `${settings.envUrl}/api/data/v9.2/${settings.entityName}(${id})`;
    pushLog('DELETE', simulatedEndpoint, '102 Processing (Local Delete)');
    await new Promise(resolve => setTimeout(resolve, 300));
    pushLog('DELETE', simulatedEndpoint, '204 No Content');
    return true;
  }

  // Real Microsoft Dataverse API DELETE request:
  const token = await authenticateOAuth();
  const entity = settings.entityName || 'cr57a_sales_opportunities';
  const endpoint = `${settings.envUrl}/api/data/v9.2/${entity}(${id})`;

  pushLog('DELETE', endpoint, '102 Processing (Deleting from Dataverse)');

  try {
    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0'
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      pushLog('DELETE', endpoint, `${response.status} ${response.statusText}`, null, JSON.parse(errText || '{}'));
      throw new Error(`Dataverse delete failed: ${response.statusText}`);
    }

    pushLog('DELETE', endpoint, '204 No Content', null, { message: `Opportunity ${id} successfully deleted from Dataverse.` });
    return true;
  } catch (e) {
    pushLog('DELETE', endpoint, '500 Delete Error', null, { error: e.message });
    throw e;
  }
}
