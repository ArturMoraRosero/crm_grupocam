import React, { useState, useEffect } from 'react';
import { fetchVisits, sendVisit, removeVisit } from '../services/dataverseVisits';
import { LINEAS_NEGOCIO, USUARIOS } from '../mockData';

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

// ── Formulario modal ─────────────────────────────────────────────────────────

function VisitaForm({ visit, opportunities, onSave, onCancel, isSaving }) {
  const [form, setForm] = useState(visit || EMPTY_VISIT);

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
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

          {/* 3. Información comercial */}
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
            <div style={rowGrid(2)}>
              <div>
                <label style={labelStyle}>Contacto identificado</label>
                <input type="text" style={inputStyle} placeholder="Nombre del contacto" value={form.contacto} onChange={e => set('contacto', e.target.value)} />
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
              {isSaving ? '⏳ Guardando...' : '💾 Guardar visita'}
            </button>
          </div>
        </form>
      </div>
    </div>
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
  const [filterStatus, setFilterStatus] = useState('');
  const [filterEjecutivo, setFilterEjecutivo] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem('crm_visits', JSON.stringify(visits));
  }, [visits]);

  // ── Métricas ──

  const visitsThisMonth = visits.filter(v => {
    if (!v.fecha) return false;
    const now = new Date();
    const d = new Date(v.fecha);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const totalMonto = visits.reduce((s, v) => s + Number(v.montoEstimado || 0), 0);
  const enSeguimiento = visits.filter(v => v.estadoOportunidad === 'En seguimiento').length;
  const paraCotizar = visits.filter(v => v.estadoOportunidad === 'Cotizar / presupuestar').length;

  // ── Filtrado ──

  const filtered = visits.filter(v => {
    const matchSearch = !searchTerm ||
      v.nombreProyecto?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.contacto?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.sector?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = !filterStatus || v.estadoOportunidad === filterStatus;
    const matchEjecutivo = !filterEjecutivo || v.ejecutivo === filterEjecutivo;
    return matchSearch && matchStatus && matchEjecutivo;
  }).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  // ── Acciones ──

  const handleSave = async (form) => {
    setIsSaving(true);
    try {
      const isNew = !form.id;
      const toSave = isNew
        ? { ...form, id: 'visit_' + Date.now(), fechaRegistro: new Date().toISOString().split('T')[0] }
        : form;

      await sendVisit(toSave, isNew);

      setVisits(prev =>
        isNew
          ? [toSave, ...prev]
          : prev.map(v => v.id === toSave.id ? toSave : v)
      );
      setShowForm(false);
      setEditingVisit(null);
      triggerToast(isNew ? '📍 Visita registrada correctamente.' : '✅ Visita actualizada.');
    } catch (e) {
      triggerToast(`❌ Error al guardar: ${e.message}`, 'rgba(192,57,43,0.5)');
    } finally {
      setIsSaving(false);
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

  return (
    <div className="animate-fade-in">

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.2rem', marginBottom: '2rem' }}>
        {[
          { label: 'Visitas este mes', val: visitsThisMonth.length, color: '#fff' },
          { label: 'En seguimiento',   val: enSeguimiento,           color: '#e67e22' },
          { label: 'Para cotizar',     val: paraCotizar,             color: '#27ae60' },
          { label: 'Monto estimado',   val: `$${totalMonto.toLocaleString()}`, color: '#fff' }
        ].map(k => (
          <div key={k.label} className="kpi-card">
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>{k.label}</span>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: k.color, margin: '0.3rem 0' }}>{k.val}</div>
          </div>
        ))}
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
        />
      )}
    </div>
  );
}
