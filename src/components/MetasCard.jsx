import React, { useEffect, useState, useCallback } from 'react';
import { listPlanoFolders } from '../services/sharepointPlanos';
import { fetchVisits } from '../services/dataverseVisits';
import { META_SEMANAL, META_MENSUAL, eventosPlanos, eventosReuniones, resumen } from '../kpiMetas';

function Barra({ valor, meta }) {
  const pct = Math.min(100, Math.round((valor / meta) * 100));
  const color = valor >= meta ? 'var(--accent-green)' : valor > 0 ? 'var(--accent-orange)' : 'var(--cam-red)';
  return (
    <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color }} />
    </div>
  );
}

function Meta({ titulo, detalle, data, estado, onConectar }) {
  const { total, porResponsable } = data;
  return (
    <div style={{ flex: 1, minWidth: 260 }}>
      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>{titulo}</div>
      <div style={{ fontSize: '0.72rem', color: 'var(--cam-gray-mid)', margin: '0.2rem 0 0.8rem' }}>{detalle}</div>
      {estado === 'needsAuth' ? (
        <button type="button" className="btn-secondary" onClick={onConectar}>Conectar SharePoint para ver planos</button>
      ) : estado === 'loading' ? (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Cargando...</div>
      ) : estado?.startsWith?.('error') ? (
        <div style={{ fontSize: '0.8rem', color: '#f87171' }}>{estado.slice(6)}</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <div className="kpi-val" style={{ fontSize: '1.6rem' }}>{total.semana} / {META_SEMANAL}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 6 }}>Esta semana</div>
              <Barra valor={total.semana} meta={META_SEMANAL} />
            </div>
            <div>
              <div className="kpi-val" style={{ fontSize: '1.6rem' }}>{total.mes} / {META_MENSUAL}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 6 }}>Este mes</div>
              <Barra valor={total.mes} meta={META_MENSUAL} />
            </div>
          </div>
          {porResponsable.length > 0 && (
            <div style={{ marginTop: '0.9rem', fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'grid', gap: 4 }}>
              {porResponsable.map(r => (
                <div key={r.name} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{r.name}</span>
                  <span>semana {r.semana}/{META_SEMANAL} · mes {r.mes}/{META_MENSUAL}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Metas de actividad: planos por cotizar y reuniones con tomador de decisión.
 * opportunities: ya filtradas por rol. soloEjecutivo: nombre si el rol es Vendedor.
 */
export default function MetasCard({ opportunities, soloEjecutivo, refreshKey }) {
  const [folders, setFolders] = useState([]);
  const [planosEstado, setPlanosEstado] = useState('loading');
  const [visits, setVisits] = useState([]);
  const [visitasEstado, setVisitasEstado] = useState('loading');

  const cargarPlanos = useCallback(async (interactive = false) => {
    setPlanosEstado('loading');
    try {
      const r = await listPlanoFolders({ interactive });
      if (r.needsAuth) { setPlanosEstado('needsAuth'); return; }
      setFolders(r.folders);
      setPlanosEstado('ok');
    } catch (e) {
      setPlanosEstado('error:' + e.message);
    }
  }, []);

  useEffect(() => {
    cargarPlanos(false);
    setVisitasEstado('loading');
    fetchVisits([])
      .then(v => { setVisits(v || []); setVisitasEstado('ok'); })
      .catch(e => setVisitasEstado('error:' + e.message));
  }, [cargarPlanos, refreshKey]);

  const planos = resumen(
    eventosPlanos(folders, opportunities).filter(e => !soloEjecutivo || e.responsable === soloEjecutivo)
  );
  const reuniones = resumen(
    eventosReuniones(visits).filter(e => !soloEjecutivo || e.responsable === soloEjecutivo)
  );
  const p = planos.periodos;

  return (
    <div className="glass" style={{ padding: '1.5rem 2rem', borderRadius: '16px' }}>
      <h3 style={{ color: '#fff', fontSize: '1.2rem', marginBottom: '0.3rem' }}>Metas de actividad comercial</h3>
      <div style={{ fontSize: '0.75rem', color: 'var(--cam-gray-mid)', marginBottom: '1.2rem' }}>
        Semana {p.semana.desde} al {p.semana.hasta} · {p.mesNombre}. Meta por ejecutivo: {META_SEMANAL} por semana, {META_MENSUAL} por mes.
      </div>
      <div style={{ display: 'flex', gap: '2.5rem', flexWrap: 'wrap' }}>
        <Meta
          titulo="Planos por cotizar"
          detalle="Oportunidades que recibieron su primer plano (subido a SharePoint)"
          data={planos}
          estado={planosEstado}
          onConectar={() => cargarPlanos(true)}
        />
        <Meta
          titulo="Reuniones con tomador de decisión"
          detalle="Visitas a cuenta A (P1) con Decisor directo: Constructor, Arquitecto o Promotor"
          data={reuniones}
          estado={visitasEstado}
        />
      </div>
    </div>
  );
}
