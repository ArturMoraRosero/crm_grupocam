import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// ── Interceptor de callbacks OAuth silenciosos (iframe/popup) ────────────────
// graphAuth.js (token de Graph/SharePoint) y dataverse.js (renovación
// silenciosa del token de Dataverse) redirigen a esta misma redirect URI ('/')
// dentro de un iframe oculto o popup. Si el hash trae uno de estos states,
// este aterrizaje NO es la app: es solo el callback del token. Se envía el
// token a la ventana padre vía postMessage y NO se monta React — así ningún
// token se confunde con el del login principal (checkForRedirectToken
// guardaría cualquier access_token del hash como token de Dataverse).
const SILENT_AUTH_STATES = {
  grupocam_crm_graph_auth: 'GRAPH_AUTH',
  grupocam_crm_dataverse_renew: 'DATAVERSE_AUTH'
};

function interceptSilentAuthCallback() {
  const hash = window.location.hash;
  if (!hash) return false;
  const params = new URLSearchParams(hash.substring(1));
  const messageType = SILENT_AUTH_STATES[params.get('state')];
  if (!messageType) return false;

  const target = window.opener || (window.parent !== window ? window.parent : null);
  const payload = {
    type: messageType,
    token: params.get('access_token') || null,
    expiresIn: params.get('expires_in') || null,
    error: params.get('error') || null
  };
  if (target) {
    target.postMessage(payload, window.location.origin);
  }
  window.history.replaceState(null, null, window.location.pathname);
  return true;
}

if (!interceptSilentAuthCallback()) {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
}
