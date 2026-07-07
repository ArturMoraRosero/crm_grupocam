import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// ── Interceptor del callback OAuth de Microsoft Graph ────────────────────────
// El flujo de graphAuth.js redirige (en iframe oculto o popup) a esta misma
// redirect URI ('/'). Si el hash trae state=grupocam_crm_graph_auth, este
// aterrizaje NO es la app: es solo el callback del token de Graph. Se envía
// el token a la ventana padre vía postMessage y NO se monta React — así el
// token de Graph nunca se confunde con el de Dataverse (checkForRedirectToken
// guardaría cualquier access_token del hash como token de Dataverse).
function interceptGraphCallback() {
  const hash = window.location.hash;
  if (!hash || !hash.includes('grupocam_crm_graph_auth')) return false;
  const params = new URLSearchParams(hash.substring(1));
  if (params.get('state') !== 'grupocam_crm_graph_auth') return false;

  const target = window.opener || (window.parent !== window ? window.parent : null);
  const payload = {
    type: 'GRAPH_AUTH',
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

if (!interceptGraphCallback()) {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
}
