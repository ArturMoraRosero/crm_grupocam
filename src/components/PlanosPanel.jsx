import React, { useEffect, useState, useRef } from 'react';
import { listPlanos, uploadPlano, PLANO_ACCEPT } from '../services/sharepointPlanos';
import { Upload, FileText } from 'lucide-react';

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Planos por cotizar de una oportunidad (SharePoint). Solo para oportunidades
 * ya guardadas en Dataverse (id GUID): la carpeta se liga por el GUID.
 */
export default function PlanosPanel({ op, onUploaded }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(null); // { name, pct }
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const inputRef = useRef(null);
  const saved = GUID_RE.test(op?.id || '');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setFiles(await listPlanos(op));
      setConnected(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Carga automática solo si ya hay token de Graph en la sesión (evita
  // abrir la ventana de autorización sin que el usuario lo pida).
  useEffect(() => {
    if (!saved) return;
    try {
      const raw = sessionStorage.getItem('graph_oauth_token');
      if (raw && JSON.parse(raw).expiryTime > Date.now()) load();
    } catch { /* sin token cacheado */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [op?.id]);

  const handleFiles = async (fileList) => {
    const list = Array.from(fileList || []);
    if (list.length === 0) return;
    setError('');
    const hadPlanos = files.length > 0;
    const ok = [];
    const errs = [];
    for (const f of list) {
      setUploading({ name: f.name, pct: 0 });
      try {
        await uploadPlano(op, f, pct => setUploading({ name: f.name, pct }));
        ok.push(f.name);
      } catch (e) {
        errs.push(e.message);
      }
    }
    setUploading(null);
    if (inputRef.current) inputRef.current.value = '';
    if (errs.length) setError(errs.join(' | '));
    if (ok.length && onUploaded) onUploaded(ok, !hadPlanos);
    await load();
  };

  const box = {
    border: '1px dashed var(--border-primary)',
    borderRadius: '10px',
    padding: '1rem',
    background: 'rgba(255,255,255,0.02)'
  };

  return (
    <div>
      <label>Planos para cotizar (SharePoint)</label>
      {!saved ? (
        <div style={{ ...box, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Guarda la oportunidad primero; luego podrás subir planos.
        </div>
      ) : (
        <div
          style={box}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); if (!uploading) handleFiles(e.dataTransfer.files); }}
        >
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-secondary"
              disabled={!!uploading}
              onClick={() => inputRef.current?.click()}
            >
              <Upload size={15} strokeWidth={1.75} /> Subir plano
            </button>
            {!connected && !loading && (
              <button type="button" className="btn-secondary" onClick={load}>
                Ver planos subidos
              </button>
            )}
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              PDF, DWG, DXF, RVT, IFC, SKP, ZIP o imagen. Hasta 250 MB. También puedes arrastrar el archivo aquí.
            </span>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={PLANO_ACCEPT}
              style={{ display: 'none' }}
              onChange={e => handleFiles(e.target.files)}
            />
          </div>

          {uploading && (
            <div style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: 'var(--accent-orange)' }}>
              Subiendo {uploading.name}: {Math.round((uploading.pct || 0) * 100)}%
            </div>
          )}
          {loading && <div style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Cargando planos...</div>}
          {error && <div style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: '#f87171' }}>{error}</div>}

          {connected && !loading && (
            files.length === 0 ? (
              <div style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Esta oportunidad aún no tiene planos.
              </div>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: '0.75rem 0 0', display: 'grid', gap: '0.4rem' }}>
                {files.map(f => (
                  <li key={f.id} style={{ fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                    <a href={f.webUrl} target="_blank" rel="noreferrer" style={{ color: '#fff', wordBreak: 'break-all', display: 'inline-flex', gap: 6, alignItems: 'center' }}><FileText size={14} strokeWidth={1.75} />{f.name}</a>
                    <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {fmtSize(f.size)} · {fmtDate(f.createdDateTime)}{f.createdBy ? ` · ${f.createdBy}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      )}
    </div>
  );
}
