/**
 * Microsoft Graph OAuth 2.0 (implicit flow) — token para SharePoint
 * Grupo Empresarial CAM
 *
 * El token SSO que ya maneja dataverse.js está scopeado SOLO a Dataverse
 * ({envUrl}/user_impersonation) y Graph lo rechaza. Para subir fotos a
 * SharePoint necesitamos un segundo access token con scope de Graph.
 *
 * Estrategia (sin login adicional para el usuario):
 *  1. Token cacheado en sessionStorage y vigente → se usa directo.
 *  2. Iframe oculto con prompt=none → si hay sesión M365 activa, Microsoft
 *     devuelve el token sin UI (mismo mecanismo del SSO silencioso).
 *  3. Fallback: popup interactivo (primera vez, para dar consentimiento a
 *     Sites.ReadWrite.All, o si el navegador bloquea cookies de terceros).
 *
 * El callback aterriza en la misma redirect URI registrada ('/'), pero
 * main.jsx intercepta el hash cuando state === GRAPH_STATE ANTES de montar
 * React, y hace postMessage del token a la ventana padre. Así no se pisa el
 * token de Dataverse ni se carga la app completa dentro del iframe/popup.
 */

import { getSettings } from './dataverse';

export const GRAPH_STATE = 'grupocam_crm_graph_auth';
const STORAGE_KEY = 'graph_oauth_token';
const GRAPH_SCOPE = 'https://graph.microsoft.com/Sites.ReadWrite.All';

function buildAuthUrl({ silent }) {
  const settings = getSettings();
  const params = {
    client_id: settings.clientId,
    response_type: 'token',
    redirect_uri: window.location.origin + '/',
    scope: GRAPH_SCOPE,
    state: GRAPH_STATE
  };
  if (silent) params.prompt = 'none';
  return `https://login.microsoftonline.com/${settings.tenantId}/oauth2/v2.0/authorize?` +
    new URLSearchParams(params).toString();
}

function getCachedGraphToken() {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    // 60s de margen para no usar un token que expira a mitad de un upload.
    if (Date.now() > parsed.expiryTime - 60000) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed.token;
  } catch {
    return null;
  }
}

export function storeGraphToken(token, expiresInSeconds) {
  const expiryTime = Date.now() + (parseInt(expiresInSeconds || '3600', 10) * 1000);
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ token, expiryTime }));
}

// Espera el postMessage {type:'GRAPH_AUTH', ...} que emite main.jsx desde el
// iframe/popup de callback. Un solo listener por intento, con timeout.
function waitForAuthMessage(timeoutMs) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      reject(new Error('auth_timeout'));
    }, timeoutMs);

    function onMessage(e) {
      if (e.origin !== window.location.origin) return;
      if (!e.data || e.data.type !== 'GRAPH_AUTH') return;
      if (done) return;
      done = true;
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      if (e.data.token) {
        storeGraphToken(e.data.token, e.data.expiresIn);
        resolve(e.data.token);
      } else {
        reject(new Error(e.data.error || 'auth_failed'));
      }
    }
    window.addEventListener('message', onMessage);
  });
}

function silentIframeAuth() {
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = buildAuthUrl({ silent: true });
  document.body.appendChild(iframe);
  return waitForAuthMessage(10000).finally(() => {
    try { document.body.removeChild(iframe); } catch { /* ya removido */ }
  });
}

function popupAuth() {
  const popup = window.open(
    buildAuthUrl({ silent: false }),
    'grupocam_graph_auth',
    'width=480,height=640,menubar=no,toolbar=no'
  );
  if (!popup) {
    return Promise.reject(new Error(
      'El navegador bloqueó la ventana de autorización. Permite popups para este sitio e intenta de nuevo.'
    ));
  }
  return waitForAuthMessage(120000).finally(() => {
    try { popup.close(); } catch { /* ya cerrado */ }
  });
}

let inFlight = null;

/**
 * Devuelve un access token válido para Microsoft Graph.
 * Lanza Error con mensaje legible si no se pudo obtener.
 */
export async function getGraphToken() {
  const cached = getCachedGraphToken();
  if (cached) return cached;

  // Evita disparar dos flujos de auth en paralelo (ej. subida de 5 fotos).
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      return await silentIframeAuth();
    } catch {
      // Sin sesión silenciosa disponible (consentimiento pendiente o cookies
      // de terceros bloqueadas): pedimos autorización interactiva una vez.
      return await popupAuth();
    }
  })().finally(() => { inFlight = null; });

  return inFlight;
}
