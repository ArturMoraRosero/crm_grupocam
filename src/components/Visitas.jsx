import React, { useState, useEffect, useRef } from 'react';
import { fetchVisits, sendVisit, removeVisit } from '../services/dataverseVisits';
import { listVisitPhotos, deleteVisitPhoto, uploadVisitPhotos } from '../services/sharepointPhotos';
import { getSettings } from '../services/dataverse';
import { LINEAS_NEGOCIO, USUARIOS } from '../mockData';

// Mismo indicador que en App.jsx: sin esto, una visita guardada en Modo Demo
// se ve idéntica a una que sí llegó a Dataverse, y otros usuarios no la ven.
function SyncBadge({ status }) {
  if (status === 'demo') {
    return (
      <span
        title="Modo Demo: esta visita nunca se envió a Dataverse ni es visible para otros usuarios."
        style={{
          fontSize: '0.65rem', padding: '1px 6px', borderRadius: 4, marginLeft: 6,
          background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.4)',
          whiteSpace: 'nowrap', cursor: 'help'
        }}
      >
        🧪 Solo local (Demo)
      </span>
    );
  }
  return null;
}

// ── Catálogos locales ────────────────────────────────────────────────────────

const TIPOS_VISITA = ['Primera visita', 'Seguimiento', 'Cierre', 'Postventa', 'Diagnóstico técnico'];
const TIPOS_CLIENTE_VISITA = ['Constructor', 'Promotor', 'Arquitecto', 'Contratista', 'Institución', 'Industria', 'Inmobiliaria'];
const ETAPAS_OBRA = ['Diseño / Planos', 'Cimentación', 'Estructura', 'Mampostería', 'Acabados', 'Entregado'];
const DECISORES = ['Decisor directo', 'Influenciador técnico', 'Comprador', 'Por identificar'];
const ESTADOS_OPP = ['En seguimiento', 'Cotizar / presupuestar', 'Cerrado / ganado', 'Descartado'];
const PROXIMAS_ACCIONES_VISITA = ['Llamada', 'Envío cotización', 'Reunión presencial', 'Visita de seguimiento', 'Envío propuesta técnica'];
const PRIORIDADES = ['P1 — Alta', 'P2 — Media', 'P3 — Baja'];
const PROBABILIDADES_VISITA = [0.1, 0.25, 0.5, 0.75, 0.9];

const PROYECTOS_OPTS = ['Pared liviana', 'Fachada ventilada', 'Cubierta metálica', 'Mezzanine', 'Tabiquería', 'Cielo falso', 'Otro'];
const PRODUCTOS_OPTS = ['Perfilería', 'Placa yeso', 'Lana mineral', 'Estructura metálica', 'ACM', 'Cubierta metálica', 'Fibrocemento', 'Aislamiento térmico'];

const EMPTY_VISIT = {
  id: '',
  fecha: new Date().toISOString().split('T')[0],
  hora: '09:00',
  ejecutivo: USUARIOS[0].name,
  sector: '',
  tipoVisita: TIPOS_VISITA[0],
  nombreProyecto: '',
  direccion: '',
  linkMaps: '',
  coordenadas: '',
  secuenciaRecorrido: '',
  tipoCliente: TIPOS_CLIENTE_VISITA[0],
  etapaObra: ETAPAS_OBRA[0],
  lineaNegocio: LINEAS_NEGOCIO[0],
  contacto: '',
  telefonoContacto: '',
  decisor: DECISORES[0],
  necesidadDetectada: '',
  montoEstimado: '',
  prioridad: PRIORIDADES[1],
  estadoOportunidad: ESTADOS_OPP[0],
  proximaAccion: PROXIMAS_ACCIONES_VISITA[0],
  fechaSeguimiento: '',
  responsableSiguiente: USUARIOS[0].name,
  probabilidadCierre: 0.5,
  observaciones: '',
  proyectos: [],
  productos: [],
  oportunidadId: null,
  fechaRegistro: ''
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_COLOR = {
  'P1 — Alta': '#c0392b',
  'P2 — Media': '#e67e22',
  'P3 — Baja': '#27ae60'
};

const STATUS_BADGE = {
  'En seguimiento':        { bg: 'rgba(230,167,50,0.15)', color: '#b7860a' },
  'Cotizar / presupuestar':{ bg: 'rgba(39,174,96,0.15)',  color: '#1a7a43' },
  'Cerrado / ganado':      { bg: 'rgba(39,174,96,0.2)',   color: '#155d34' },
  'Descartado':            { bg: 'rgba(192,57,43,0.15)',  color: '#8b2217' }
};

function Badge({ status }) {
  const s = STATUS_BADGE[status] || { bg: 'rgba(150,150,150,0.15)', color: '#666' };
  return (
    <span style={{
      background: s.bg, color: s.color,
      padding: '2px 10px', borderRadius: '20px',
      fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap'
    }}>{status}</span>
  );
}

function CheckGroup({ label, options, selected, onChange }) {
  const toggle = (opt) => {
    const next = selected.includes(opt)
      ? selected.filter(x => x !== opt)
      : [...selected, opt];
    onChange(next);
  };
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: 6 }}>
        {options.map(opt => (
          <label key={opt} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: '0.83rem', cursor: 'pointer',
            padding: '4px 10px', borderRadius: 6,
            border: `1px solid ${selected.includes(opt) ? 'var(--cam-red)' : 'var(--border-primary)'}`,
            background: selected.includes(opt) ? 'rgba(192,57,43,0.1)' : 'var(--bg-secondary)',
            color: selected.includes(opt) ? 'var(--cam-red)' : 'var(--text-secondary)'
          }}>
            <input
              type="checkbox"
              style={{ accentColor: 'var(--cam-red)', width: 13, height: 13 }}
              checked={selected.includes(opt)}
              onChange={() => toggle(opt)}
            />
            {opt}
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Estilos inline reutilizables ─────────────────────────────────────────────

const labelStyle = {
  fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.04em', color: 'var(--text-secondary)', display: 'block', marginBottom: 4
};

const inputStyle = {
  width: '100%', padding: '0.55rem 0.8rem',
  borderRadius: 8, border: '1px solid var(--border-primary)',
  background: 'var(--bg-secondary)', color: 'var(--text-primary)',
  fontSize: '0.88rem'
};

const sectionCard = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-primary)',
  borderRadius: 14, padding: '1.4rem 1.6rem',
  marginBottom: '1.2rem'
};

const sectionTitle = {
  fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: 'var(--text-secondary)',
  marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 6
};

const rowGrid = (cols = 2) => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${cols}, 1fr)`,
  gap: '1rem', marginBottom: '1rem'
});

// ── Fotos del proyecto (SharePoint) ──────────────────────────────────────────

const MAX_FOTOS = 5;
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const photoThumbStyle = {
  width: 92, height: 92, objectFit: 'cover', borderRadius: 8,
  border: '1px solid var(--border-primary)', display: 'block'
};

const photoRemoveBtn = {
  position: 'absolute', top: -6, right: -6, width: 20, height: 20,
  borderRadius: '50%', background: 'var(--cam-red)', color: '#fff',
  border: 'none', cursor: 'pointer', fontSize: '0.7rem', lineHeight: 1,
  display: 'flex', alignItems: 'center', justifyContent: 'center'
};

function PhotoSection({ visitId, pendingFiles, setPendingFiles }) {
  const [existing, setExisting] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const isSynced = GUID_RE.test(visitId || '');

  // Galería existente: solo si la visita ya vive en Dataverse (carpeta = GUID).
  useEffect(() => {
    if (!isSynced) return;
    setLoading(true);
    listVisitPhotos(visitId)
      .then(setExisting)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [visitId, isSynced]);

  const total = existing.length + pendingFiles.length;

  const handlePick = (e) => {
    setError('');
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
    const room = MAX_FOTOS - total;
    if (files.length > room) {
      setError(`Máximo ${MAX_FOTOS} fotos por visita. Solo se agregaron ${Math.max(room, 0)}.`);
    }
    const accepted = files.slice(0, Math.max(room, 0)).map(f => ({
      file: f,
      preview: URL.createObjectURL(f)
    }));
    if (accepted.length) setPendingFiles(prev => [...prev, ...accepted]);
    e.target.value = ''; // permite volver a elegir el mismo archivo
  };

  const removePending = (idx) => {
    setPendingFiles(prev => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const removeExisting = async (photo) => {
    if (!window.confirm(`¿Eliminar "${photo.name}" de SharePoint?`)) return;
    try {
      await deleteVisitPhoto(photo.id);
      setExisting(prev => prev.filter(p => p.id !== photo.id));
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div style={sectionCard}>
      <div style={{ ...sectionTitle, justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>📸</span> Fotos del proyecto
          <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, opacity: 0.7 }}>
            · SharePoint / Visitas CRM · {total}/{MAX_FOTOS}
          </span>
        </span>
        {loading && <span style={{ fontWeight: 400, textTransform: 'none' }}>⏳ Cargando…</span>}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
        {/* Fotos ya en SharePoint */}
        {existing.map(p => (
          <div key={p.id} style={{ position: 'relative' }}>
            <a href={p.webUrl} target="_blank" rel="noreferrer" title={`${p.name} — abrir en SharePoint`}>
              {p.thumbnailUrl
                ? <img src={p.thumbnailUrl} alt={p.name} style={photoThumbStyle} />
                : <div style={{ ...photoThumbStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)', fontSize: '1.6rem' }}>🖼️</div>
              }
            </a>
            <button type="button" style={photoRemoveBtn} title="Eliminar de SharePoint" onClick={() => removeExisting(p)}>✕</button>
          </div>
        ))}

        {/* Fotos pendientes de subir */}
        {pendingFiles.map((p, idx) => (
          <div key={p.preview} style={{ position: 'relative' }}>
            <img src={p.preview} alt={p.file.name} style={{ ...photoThumbStyle, border: '1px dashed #e67e22' }} />
            <span style={{
              position: 'absolute', bottom: 4, left: 4, fontSize: '0.6rem', fontWeight: 700,
              background: 'rgba(230,126,34,0.9)', color: '#fff', padding: '1px 6px', borderRadius: 4
            }}>Pendiente</span>
            <button type="button" style={photoRemoveBtn} title="Quitar" onClick={() => removePending(idx)}>✕</button>
          </div>
        ))}

        {/* Botón agregar */}
        {total < MAX_FOTOS && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              width: 92, height: 92, borderRadius: 8, cursor: 'pointer',
              border: '1px dashed var(--border-primary)', background: 'var(--bg-secondary)',
              color: 'var(--text-secondary)', fontSize: '0.72rem', display: 'flex',
              flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4
            }}
          >
            <span style={{ fontSize: '1.4rem' }}>＋</span>
            Agregar foto
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handlePick}
        />
      </div>

      {pendingFiles.length > 0 && (
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 10 }}>
          Las fotos pendientes se suben a SharePoint al guardar la visita.
        </p>
      )}
      {error && (
        <p style={{ fontSize: '0.78rem', color: '#e67e22', marginTop: 8 }}>⚠️ {error}</p>
      )}
    </div>
  );
}

// ── Formulario modal ─────────────────────────────────────────────────────────

function VisitaForm({ visit, opportunities, onSave, onCancel, isSaving, savingLabel }) {
  const [form, setForm] = useState(visit || EMPTY_VISIT);
  const [pendingPhotos, setPendingPhotos] = useState([]);

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form, pendingPhotos.map(p => p.file));
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      zIndex: 1000, display: 'flex', alignItems: 'flex-start',
      justifyContent: 'center', overflowY: 'auto', padding: '2rem 1rem'
    }}>
      <div style={{
        background: 'var(--bg-primary)', borderRadius: 18,
        width: '100%', maxWidth: 780, padding: '2rem',
        border: '1px solid var(--border-primary)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.8rem' }}>
          <div>
            <h2 style={{ color: '#fff', fontSize: '1.3rem', marginBottom: 2 }}>
              {form.id ? '✏️ Editar visita' : '📍 Nueva visita comercial'}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              Tabla: cr168_visits · Dataverse
            </p>
          </div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '1.4rem', cursor: 'pointer' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>

          {/* Vincular a oportunidad */}
          <div style={{
            background: 'rgba(39,130,210,0.08)', border: '1px solid rgba(39,130,210,0.25)',
            borderRadius: 10, padding: '0.8rem 1rem', marginBottom: '1.4rem',
            display: 'flex', alignItems: 'center', gap: 10
          }}>
            <span style={{ fontSize: '1rem' }}>🔗</span>
            <label style={{ ...labelStyle, margin: 0, textTransform: 'none', fontSize: '0.82rem', color: '#5ba4e5', flex: 1 }}>
              Vincular a oportunidad existente <span style={{ opacity: 0.6 }}>(opcional)</span>
            </label>
            <select
              value={form.oportunidadId || ''}
              onChange={e => set('oportunidadId', e.target.value || null)}
              style={{ ...inputStyle, width: 240, background: 'transparent', border: '1px solid rgba(39,130,210,0.3)', color: '#5ba4e5' }}
            >
              <option value="">— Sin vincular —</option>
              {(opportunities || []).map(op => (
                <option key={op.id} value={op.id}>{op.codigo} · {op.cliente}</option>
              ))}
            </select>
          </div>

          {/* 1. Datos generales */}
          <div style={sectionCard}>
            <div style={sectionTitle}><span>📋</span> Datos generales</div>
            <div style={rowGrid(3)}>
              <div>
                <label style={labelStyle}>Fecha</label>
                <input type="date" style={inputStyle} value={form.fecha} onChange={e => set('fecha', e.target.value)} required />
              </div>
              <div>
                <label style={labelStyle}>Hora</label>
                <input type="time" style={inputStyle} value={form.hora} onChange={e => set('hora', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Ejecutivo / Responsable</label>
                <select style={inputStyle} value={form.ejecutivo} onChange={e => set('ejecutivo', e.target.value)}>
                  {USUARIOS.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                </select>
              </div>
            </div>
            <div style={rowGrid(2)}>
              <div>
                <label style={labelStyle}>Sector / Zona</label>
                <input type="text" style={inputStyle} placeholder="Ej: Norte, Centro-Sur..." value={form.sector} onChange={e => set('sector', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Tipo de visita</label>
                <select style={inputStyle} value={form.tipoVisita} onChange={e => set('tipoVisita', e.target.value)}>
                  {TIPOS_VISITA.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* 2. Ubicación */}
          <div style={sectionCard}>
            <div style={sectionTitle}><span>📍</span> Ubicación del proyecto</div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>Nombre del proyecto / obra</label>
              <input type="text" style={inputStyle} placeholder="Ej: Edificio Torres del Norte" value={form.nombreProyecto} onChange={e => set('nombreProyecto', e.target.value)} required />
            </div>
            <div style={rowGrid(2)}>
              <div>
                <label style={labelStyle}>Dirección</label>
                <input type="text" style={inputStyle} placeholder="Calle, número, ciudad" value={form.direccion} onChange={e => set('direccion', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Link Google Maps</label>
                <input type="url" style={inputStyle} placeholder="https://maps.google.com/..." value={form.linkMaps} onChange={e => set('linkMaps', e.target.value)} />
              </div>
            </div>
            <div style={rowGrid(2)}>
              <div>
                <label style={labelStyle}>Coordenadas GPS</label>
                <input type="text" style={inputStyle} placeholder="-0.1234, -78.5678" value={form.coordenadas} onChange={e => set('coordenadas', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Secuencia del recorrido</label>
                <input type="text" style={inputStyle} placeholder="Ej: Acceso norte → Piso 3 → Fachada" value={form.secuenciaRecorrido} onChange={e => set('secuenciaRecorrido', e.target.value)} />
              </div>
            </div>
            {form.linkMaps && (
              <a href={form.linkMaps} target="_blank" rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#5ba4e5', marginTop: 4 }}>
                🗺️ Ver en Google Maps ↗
              </a>
            )}
          </div>

          {/* 3. Fotos del proyecto */}
          <PhotoSection
            visitId={form.id}
            pendingFiles={pendingPhotos}
            setPendingFiles={setPendingPhotos}
          />

          {/* 4. Información comercial */}
          <div style={sectionCard}>
            <div style={sectionTitle}><span>💼</span> Información comercial</div>
            <div style={rowGrid(3)}>
              <div>
                <label style={labelStyle}>Tipo de cliente</label>
                <select style={inputStyle} value={form.tipoCliente} onChange={e => set('tipoCliente', e.target.value)}>
                  {TIPOS_CLIENTE_VISITA.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Etapa de obra</label>
                <select style={inputStyle} value={form.etapaObra} onChange={e => set('etapaObra', e.target.value)}>
                  {ETAPAS_OBRA.map(e => <option key={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Línea de negocio</label>
                <select style={inputStyle} value={form.lineaNegocio} onChange={e => set('lineaNegocio', e.target.value)}>
                  {LINEAS_NEGOCIO.map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
            </div>
            <div style={rowGrid(3)}>
              <div>
                <label style={labelStyle}>Contacto identificado</label>
                <input type="text" style={inputStyle} placeholder="Nombre del contacto" value={form.contacto} onChange={e => set('contacto', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Teléfono del contacto</label>
                <input type="tel" style={inputStyle} placeholder="Ej: 099 123 4567" value={form.telefonoContacto} onChange={e => set('telefonoContacto', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Rol del contacto</label>
                <select style={inputStyle} value={form.decisor} onChange={e => set('decisor', e.target.value)}>
                  {DECISORES.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* 4. Diagnóstico */}
          <div style={sectionCard}>
            <div style={sectionTitle}><span>🔍</span> Diagnóstico</div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>Necesidad detectada / Dolor técnico</label>
              <textarea
                style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
                placeholder="Describe el problema o necesidad que encontraste en la visita..."
                value={form.necesidadDetectada}
                onChange={e => set('necesidadDetectada', e.target.value)}
              />
            </div>
            <div style={rowGrid(2)}>
              <div>
                <label style={labelStyle}>Monto estimado (USD)</label>
                <input type="number" style={inputStyle} placeholder="0" min="0" value={form.montoEstimado} onChange={e => set('montoEstimado', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Prioridad comercial</label>
                <select style={inputStyle} value={form.prioridad} onChange={e => set('prioridad', e.target.value)}>
                  {PRIORIDADES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <hr style={{ border: 'none', borderTop: '1px solid var(--border-primary)', margin: '1rem 0' }} />
            <CheckGroup
              label="Proyectos detectados"
              options={PROYECTOS_OPTS}
              selected={form.proyectos}
              onChange={v => set('proyectos', v)}
            />
            <div style={{ marginTop: '0.8rem' }}>
              <CheckGroup
                label="Productos de interés"
                options={PRODUCTOS_OPTS}
                selected={form.productos}
                onChange={v => set('productos', v)}
              />
            </div>
          </div>

          {/* 5. Estado y próxima acción */}
          <div style={sectionCard}>
            <div style={sectionTitle}><span>🎯</span> Estado y próxima acción</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '1rem' }}>
              {ESTADOS_OPP.map(estado => (
                <button
                  key={estado}
                  type="button"
                  onClick={() => set('estadoOportunidad', estado)}
                  style={{
                    padding: '0.7rem 1rem', borderRadius: 10, textAlign: 'left',
                    border: `1px solid ${form.estadoOportunidad === estado ? 'var(--cam-red)' : 'var(--border-primary)'}`,
                    background: form.estadoOportunidad === estado ? 'rgba(192,57,43,0.12)' : 'var(--bg-secondary)',
                    color: form.estadoOportunidad === estado ? 'var(--cam-red)' : 'var(--text-secondary)',
                    fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer'
                  }}
                >
                  {estado === 'En seguimiento' && '🕐 '}
                  {estado === 'Cotizar / presupuestar' && '📄 '}
                  {estado === 'Cerrado / ganado' && '✅ '}
                  {estado === 'Descartado' && '❌ '}
                  {estado}
                </button>
              ))}
            </div>
            <div style={rowGrid(3)}>
              <div>
                <label style={labelStyle}>Próxima acción</label>
                <select style={inputStyle} value={form.proximaAccion} onChange={e => set('proximaAccion', e.target.value)}>
                  {PROXIMAS_ACCIONES_VISITA.map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Fecha de seguimiento</label>
                <input type="date" style={inputStyle} value={form.fechaSeguimiento} onChange={e => set('fechaSeguimiento', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Probabilidad de cierre</label>
                <select style={inputStyle} value={form.probabilidadCierre} onChange={e => set('probabilidadCierre', parseFloat(e.target.value))}>
                  {PROBABILIDADES_VISITA.map(p => <option key={p} value={p}>{Math.round(p * 100)}%</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>Responsable siguiente paso</label>
              <select style={inputStyle} value={form.responsableSiguiente} onChange={e => set('responsableSiguiente', e.target.value)}>
                {USUARIOS.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Observaciones / Acuerdos</label>
              <textarea
                style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
                placeholder="Notas de la visita, compromisos adquiridos, acuerdos con el cliente..."
                value={form.observaciones}
                onChange={e => set('observaciones', e.target.value)}
              />
            </div>
          </div>

          {/* Botones */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem', marginTop: '0.5rem' }}>
            <button type="button" onClick={onCancel}
              style={{ padding: '0.6rem 1.4rem', borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.88rem' }}>
              Cancelar
            </button>
            <button type="submit" disabled={isSaving}
              style={{ padding: '0.6rem 1.6rem', borderRadius: 8, background: 'var(--cam-red)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, opacity: isSaving ? 0.7 : 1 }}>
              {isSaving ? `⏳ ${savingLabel || 'Guardando...'}` : '💾 Guardar visita'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Helpers de período ────────────────────────────────────────────────────────

function getPeriodRange(period) {
  const now = new Date();
  let start, end;
  if (period === 'semana') {
    const day = now.getDay() || 7;
    start = new Date(now); start.setDate(now.getDate() - day + 1); start.setHours(0,0,0,0);
    end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
  } else if (period === 'mes') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  } else if (period === 'mes_anterior') {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  } else {
    return null;
  }
  return { start, end };
}

function filterByPeriod(visits, period) {
  const range = getPeriodRange(period);
  if (!range) return visits;
  return visits.filter(v => {
    if (!v.fecha) return false;
    const d = new Date(v.fecha);
    return d >= range.start && d <= range.end;
  });
}

// ── Gráfico de actividad SVG ──────────────────────────────────────────────────

function VisitChart({ visits, period }) {
  const W = 560, H = 110, PAD = { l: 36, r: 12, t: 10, b: 28 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  // Generar buckets
  const now = new Date();
  let buckets = [];

  if (period === 'semana') {
    const day = now.getDay() || 7;
    const monday = new Date(now); monday.setDate(now.getDate() - day + 1); monday.setHours(0,0,0,0);
    const labels = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    buckets = labels.map((label, i) => {
      const d = new Date(monday); d.setDate(monday.getDate() + i);
      const key = d.toISOString().split('T')[0];
      return { label, key, count: 0 };
    });
  } else {
    // mes actual o anterior — agrupar por semana del mes
    const range = getPeriodRange(period);
    if (!range) return null;
    const { start, end } = range;
    const weeks = [];
    let cur = new Date(start);
    let wNum = 1;
    while (cur <= end) {
      const wStart = new Date(cur);
      const wEnd = new Date(cur); wEnd.setDate(wEnd.getDate() + 6);
      if (wEnd > end) wEnd.setTime(end.getTime());
      weeks.push({ label: `Sem ${wNum}`, start: wStart, end: wEnd, count: 0 });
      cur.setDate(cur.getDate() + 7);
      wNum++;
    }
    buckets = weeks.map(w => ({
      label: w.label,
      key: null,
      start: w.start,
      end: w.end,
      count: 0
    }));
  }

  // Contar visitas por bucket
  visits.forEach(v => {
    if (!v.fecha) return;
    const d = new Date(v.fecha);
    buckets.forEach(b => {
      if (b.key) {
        if (v.fecha === b.key) b.count++;
      } else {
        if (d >= b.start && d <= b.end) b.count++;
      }
    });
  });

  const maxVal = Math.max(...buckets.map(b => b.count), 1);
  const barW = Math.min(40, (innerW / buckets.length) - 8);
  const barSpacing = innerW / buckets.length;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}>
      {/* Grid lines */}
      {[0, 0.5, 1].map(frac => {
        const y = PAD.t + innerH * (1 - frac);
        return (
          <g key={frac}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke="var(--border-primary)" strokeWidth="1" />
            <text x={PAD.l - 6} y={y + 4} fontSize="9" fill="var(--text-secondary)" textAnchor="end">
              {frac === 0 ? 0 : Math.round(maxVal * frac)}
            </text>
          </g>
        );
      })}

      {/* Bars */}
      {buckets.map((b, i) => {
        const x = PAD.l + barSpacing * i + barSpacing / 2 - barW / 2;
        const barH = maxVal > 0 ? (b.count / maxVal) * innerH : 0;
        const y = PAD.t + innerH - barH;
        const isToday = b.key === new Date().toISOString().split('T')[0];
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={Math.max(barH, 1)}
              rx={4} fill={isToday ? 'var(--cam-red)' : 'rgba(192,57,43,0.35)'} />
            {b.count > 0 && (
              <text x={x + barW / 2} y={y - 3} fontSize="10" fill="#fff" textAnchor="middle">{b.count}</text>
            )}
            <text x={x + barW / 2} y={H - 4} fontSize="9" fill="var(--text-secondary)" textAnchor="middle">{b.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function Visitas({ opportunities = [], triggerToast }) {
  const [visits, setVisits] = useState(() => {
    try { return JSON.parse(localStorage.getItem('crm_visits') || '[]'); } catch { return []; }
  });
  const [showForm, setShowForm] = useState(false);
  const [editingVisit, setEditingVisit] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savingLabel, setSavingLabel] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterEjecutivo, setFilterEjecutivo] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [period, setPeriod] = useState('mes');

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem('crm_visits', JSON.stringify(visits));
  }, [visits]);

  // Fetch desde Dataverse al montar
  useEffect(() => {
    const localData = (() => {
      try { return JSON.parse(localStorage.getItem('crm_visits') || '[]'); } catch { return []; }
    })();
    setIsSyncing(true);
    const isLive = getSettings().mode === 'live';
    fetchVisits(localData)
      .then(data => {
        // Si vino de Dataverse (modo live), es la fuente compartida: se marca
        // 'synced'. Si estamos en Demo, fetchVisits devuelve el mismo
        // localData de entrada — no le pisamos su _syncStatus previo.
        const tagged = isLive ? data.map(v => ({ ...v, _syncStatus: 'synced' })) : data;
        setVisits(tagged);
        localStorage.setItem('crm_visits', JSON.stringify(tagged));
      })
      .catch(() => {})
      .finally(() => setIsSyncing(false));
  }, []);

  // ── Métricas por período ──

  const periodVisits = filterByPeriod(visits, period);
  const totalMonto = periodVisits.reduce((s, v) => s + Number(v.montoEstimado || 0), 0);
  const enSeguimiento = periodVisits.filter(v => v.estadoOportunidad === 'En seguimiento').length;
  const paraCotizar = periodVisits.filter(v => v.estadoOportunidad === 'Cotizar / presupuestar').length;
  const cerrados = periodVisits.filter(v => v.estadoOportunidad === 'Cerrado / ganado').length;

  // Por ejecutivo
  const byEjecutivo = USUARIOS.map(u => ({
    name: u.name.split(' ')[0],
    count: periodVisits.filter(v => v.ejecutivo === u.name).length
  })).filter(e => e.count > 0);

  // ── Filtrado ──

  const filtered = periodVisits.filter(v => {
    const matchSearch = !searchTerm ||
      v.nombreProyecto?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.contacto?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.sector?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = !filterStatus || v.estadoOportunidad === filterStatus;
    const matchEjecutivo = !filterEjecutivo || v.ejecutivo === filterEjecutivo;
    return matchSearch && matchStatus && matchEjecutivo;
  }).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  // ── Acciones ──

  const handleSave = async (form, pendingPhotoFiles = []) => {
    setIsSaving(true);
    try {
      const localId = form.id; // puede ser un id local tipo 'visit_...' o un GUID real
      const isNew = !form.id;
      const toSave = isNew
        ? { ...form, id: 'visit_' + Date.now(), fechaRegistro: new Date().toISOString().split('T')[0] }
        : form;

      // sendVisit devuelve el registro con el id real (GUID) que asigna
      // Dataverse. Si no se usa esta respuesta, un registro que aún no
      // tenía GUID (creado offline o cuya sync anterior falló) se queda
      // para siempre con su id local, y cada "edición" posterior vuelve a
      // crear un duplicado en Dataverse en vez de actualizar el existente.
      const isDemo = getSettings().mode !== 'live';
      const saved = await sendVisit(toSave, isNew);
      const finalVisit = { ...(saved && saved.id ? saved : toSave), _syncStatus: isDemo ? 'demo' : 'synced' };

      setVisits(prev =>
        isNew
          ? [finalVisit, ...prev]
          : prev.map(v => v.id === localId ? finalVisit : v)
      );

      // ── Fotos a SharePoint ──
      // Se suben DESPUÉS de guardar en Dataverse porque la carpeta de la
      // visita se nombra con su GUID real. Un fallo aquí no revierte la
      // visita: los datos de campo ya están a salvo.
      let photoSummary = '';
      if (pendingPhotoFiles.length > 0) {
        const visitGuid = finalVisit.id;
        if (isDemo || !/^[0-9a-f-]{36}$/i.test(visitGuid)) {
          photoSummary = ` Las ${pendingPhotoFiles.length} foto(s) no se subieron: se requiere modo Live y sincronización con Dataverse.`;
        } else {
          setSavingLabel(`Subiendo fotos (0/${pendingPhotoFiles.length})...`);
          const { uploaded, errors } = await uploadVisitPhotos(
            visitGuid,
            pendingPhotoFiles,
            (i, n) => setSavingLabel(`Subiendo fotos (${i}/${n})...`)
          );
          if (uploaded.length) photoSummary += ` 📸 ${uploaded.length} foto(s) subida(s) a SharePoint.`;
          if (errors.length) photoSummary += ` ⚠️ ${errors.length} foto(s) fallaron: ${errors[0]}`;
        }
      }

      setShowForm(false);
      setEditingVisit(null);
      if (isDemo) {
        triggerToast(`🧪 ${isNew ? 'Visita registrada' : 'Visita actualizada'} solo en este navegador (Modo Demo, no visible para otros usuarios).${photoSummary}`, '#fbbf24');
      } else if (saved?._opportunityLinkDropped) {
        triggerToast(`⚠️ Visita guardada, pero no se pudo vincular a la oportunidad (revisar el nombre del lookup en Dataverse). Los demás datos sí se guardaron.${photoSummary}`, '#fbbf24');
      } else if (saved?._droppedFields?.includes('cr168_contactphone')) {
        triggerToast(`⚠️ Visita guardada, pero el teléfono del contacto no se sincronizó: falta crear la columna cr168_contactphone en la tabla de visitas.${photoSummary}`, '#fbbf24');
      } else {
        triggerToast(`${isNew ? '📍 Visita registrada y sincronizada con Dataverse.' : '✅ Visita actualizada y sincronizada con Dataverse.'}${photoSummary}`);
      }
    } catch (e) {
      triggerToast(`❌ Error al guardar: ${e.message}`, 'rgba(192,57,43,0.5)');
    } finally {
      setIsSaving(false);
      setSavingLabel('');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta visita?')) return;
    try {
      await removeVisit(id);
      setVisits(prev => prev.filter(v => v.id !== id));
      triggerToast('🗑️ Visita eliminada.');
    } catch (e) {
      triggerToast(`❌ Error: ${e.message}`, 'rgba(192,57,43,0.5)');
    }
  };

  const handleEdit = (visit) => {
    setEditingVisit(visit);
    setShowForm(true);
  };

  const handleNew = () => {
    setEditingVisit(null);
    setShowForm(true);
  };

  // ── Render ──

  const PERIODS = [
    { key: 'semana', label: 'Esta semana' },
    { key: 'mes', label: 'Este mes' },
    { key: 'mes_anterior', label: 'Mes anterior' },
    { key: 'todo', label: 'Todo' }
  ];

  const periodLabel = PERIODS.find(p => p.key === period)?.label || '';

  return (
    <div className="animate-fade-in">

      {/* Selector de período */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.4rem' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 4 }}>Período:</span>
        {PERIODS.map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)}
            style={{
              padding: '0.38rem 1rem', borderRadius: 20, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${period === p.key ? 'var(--cam-red)' : 'var(--border-primary)'}`,
              background: period === p.key ? 'rgba(192,57,43,0.12)' : 'var(--bg-secondary)',
              color: period === p.key ? 'var(--cam-red)' : 'var(--text-secondary)'
            }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.2rem', marginBottom: '1.4rem' }}>
        {[
          { label: `Visitas · ${periodLabel}`, val: periodVisits.length, color: '#fff' },
          { label: 'En seguimiento',            val: enSeguimiento,       color: '#e67e22' },
          { label: 'Para cotizar',              val: paraCotizar,         color: '#5ba4e5' },
          { label: 'Cerrados / ganados',        val: cerrados,            color: '#27ae60' }
        ].map(k => (
          <div key={k.label} className="kpi-card">
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>{k.label}</span>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: k.color, margin: '0.3rem 0' }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Dashboard: gráfico + breakdown ejecutivo */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1.2rem', marginBottom: '1.6rem' }}>
        {/* Gráfico actividad */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 14, padding: '1.2rem 1.4rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
              📊 Actividad de visitas — {periodLabel}
            </span>
            {totalMonto > 0 && (
              <span style={{ fontSize: '0.82rem', color: '#27ae60', fontWeight: 600 }}>
                ${totalMonto.toLocaleString()} estimado
              </span>
            )}
          </div>
          {periodVisits.length === 0
            ? <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Sin visitas en este período</div>
            : <VisitChart visits={periodVisits} period={period} />
          }
        </div>

        {/* Breakdown por ejecutivo */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 14, padding: '1.2rem 1.4rem', minWidth: 180 }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', display: 'block', marginBottom: '1rem' }}>
            👤 Por ejecutivo
          </span>
          {byEjecutivo.length === 0
            ? <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>—</div>
            : byEjecutivo.map(e => (
              <div key={e.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 16 }}>
                <span style={{ fontSize: '0.83rem', color: 'var(--text-primary)' }}>{e.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 60, height: 6, borderRadius: 4, background: 'var(--border-primary)', overflow: 'hidden' }}>
                    <div style={{ width: `${(e.count / periodVisits.length) * 100}%`, height: '100%', background: 'var(--cam-red)', borderRadius: 4 }} />
                  </div>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff', minWidth: 16, textAlign: 'right' }}>{e.count}</span>
                </div>
              </div>
            ))
          }
        </div>
      </div>

      {/* Barra de herramientas */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="🔍 Buscar proyecto, contacto, zona..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ flex: 1, minWidth: 220, padding: '0.55rem 0.9rem', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.88rem' }}
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: '0.55rem 0.8rem', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          <option value="">Todos los estados</option>
          {ESTADOS_OPP.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={filterEjecutivo} onChange={e => setFilterEjecutivo(e.target.value)}
          style={{ padding: '0.55rem 0.8rem', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          <option value="">Todos los ejecutivos</option>
          {USUARIOS.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
        </select>
        {isSyncing && (
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            ⏳ Sincronizando...
          </span>
        )}
        <button onClick={handleNew}
          style={{ padding: '0.55rem 1.4rem', borderRadius: 8, background: 'var(--cam-red)', border: 'none', color: '#fff', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          + Nueva visita
        </button>
      </div>

      {/* Tabla de visitas */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📍</div>
          <p style={{ fontSize: '1rem' }}>No hay visitas registradas aún.</p>
          <p style={{ fontSize: '0.85rem', marginTop: 6 }}>Haz clic en "Nueva visita" para registrar la primera.</p>
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 14, overflow: 'hidden' }}>
          {/* Header tabla */}
          <div style={{
            display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto',
            padding: '0.7rem 1.2rem', background: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border-primary)'
          }}>
            {['Proyecto / Obra', 'Ejecutivo', 'Línea', 'Prioridad', 'Estado', ''].map(h => (
              <span key={h} style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>{h}</span>
            ))}
          </div>

          {filtered.map((v, idx) => (
            <div key={v.id} style={{
              display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto',
              padding: '0.9rem 1.2rem', alignItems: 'center',
              borderBottom: idx < filtered.length - 1 ? '1px solid var(--border-primary)' : 'none',
              transition: 'background 0.15s'
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {/* Nombre proyecto */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_COLOR[v.prioridad] || '#888', flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.88rem' }}>{v.nombreProyecto || '—'}</span>
                  <SyncBadge status={v._syncStatus} />
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2, paddingLeft: 16 }}>
                  {v.fecha} {v.sector ? `· ${v.sector}` : ''} {v.monto ? `· $${Number(v.montoEstimado).toLocaleString()}` : ''}
                </div>
              </div>

              {/* Ejecutivo */}
              <span style={{ fontSize: '0.83rem', color: 'var(--text-secondary)' }}>{v.ejecutivo || '—'}</span>

              {/* Línea negocio */}
              <span style={{ fontSize: '0.83rem', color: 'var(--text-secondary)' }}>{v.lineaNegocio || '—'}</span>

              {/* Prioridad */}
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: PRIORITY_COLOR[v.prioridad] || '#888' }}>
                {v.prioridad?.split(' ')[0] || '—'}
              </span>

              {/* Estado */}
              <Badge status={v.estadoOportunidad} />

              {/* Acciones */}
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => handleEdit(v)}
                  style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', color: 'var(--text-secondary)', fontSize: '0.78rem', cursor: 'pointer' }}>
                  ✏️
                </button>
                <button onClick={() => handleDelete(v.id)}
                  style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(192,57,43,0.1)', border: '1px solid rgba(192,57,43,0.2)', color: 'var(--cam-red)', fontSize: '0.78rem', cursor: 'pointer' }}>
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal formulario */}
      {showForm && (
        <VisitaForm
          visit={editingVisit}
          opportunities={opportunities}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditingVisit(null); }}
          isSaving={isSaving}
          savingLabel={savingLabel}
        />
      )}
    </div>
  );
}
