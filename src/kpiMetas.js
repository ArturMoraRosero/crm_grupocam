/**
 * Metas de actividad comercial CAM SC (por ejecutivo):
 *  - Planos por cotizar: 1 por semana, 4 por mes. Cuenta 1 por oportunidad,
 *    en la fecha de su primer plano subido a SharePoint.
 *  - Reuniones con tomador de decisión: 1 por semana, 4 por mes. Cuenta una
 *    visita cuando el contacto es "Decisor directo", el cliente es
 *    Constructor, Arquitecto o Promotor, y la visita está marcada como
 *    cuenta A (Prioridad comercial P1).
 * Semanas de lunes a domingo y meses calendario, en hora local (no UTC).
 */
import { opGuid8 } from './services/sharepointPlanos';

export const META_SEMANAL = 1;
export const META_MENSUAL = 4;
export const TIPOS_CLIENTE_DECISOR = ['Constructor', 'Arquitecto', 'Promotor'];

export function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Rango [desde, hasta] en 'YYYY-MM-DD' local para la semana (lun-dom) y el mes actuales. */
export function periodos(now = new Date()) {
  const dow = (now.getDay() + 6) % 7; // 0 = lunes
  const lunes = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
  const domingo = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 6);
  const ini = new Date(now.getFullYear(), now.getMonth(), 1);
  const fin = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    semana: { desde: localDateStr(lunes), hasta: localDateStr(domingo) },
    mes: { desde: localDateStr(ini), hasta: localDateStr(fin) },
    mesNombre: now.toLocaleDateString('es-EC', { month: 'long', year: 'numeric' })
  };
}

const enRango = (fecha, r) => !!fecha && fecha >= r.desde && fecha <= r.hasta;

// Visitas antiguas (importadas de Excel) traen valores sin normalizar:
// "constructora", "estudio_arquitectura", "ALTA". Se aceptan como equivalentes.
const TIPO_ALIAS = { constructora: 'Constructor', estudio_arquitectura: 'Arquitecto', arquitecto: 'Arquitecto', promotora: 'Promotor' };

export function tipoClienteNormalizado(t) {
  return TIPO_ALIAS[(t || '').trim().toLowerCase()] || (t || '').trim();
}

export function esCuentaA(prioridad) {
  const p = (prioridad || '').trim();
  return /^P1\b/i.test(p) || /^alta$/i.test(p);
}

export function esReunionDecisor(v) {
  return (v.decisor || '').trim() === 'Decisor directo'
    && TIPOS_CLIENTE_DECISOR.includes(tipoClienteNormalizado(v.tipoCliente))
    && esCuentaA(v.prioridad);
}

/** Planos: carpetas de SharePoint (con archivos) ligadas a una oportunidad. */
export function eventosPlanos(folders, opportunities) {
  const byG8 = new Map(opportunities.map(o => [opGuid8(o), o]));
  return folders
    .filter(f => f.childCount > 0 && f.guid8)
    .map(f => {
      const op = byG8.get(f.guid8);
      return {
        fecha: localDateStr(new Date(f.createdDateTime)),
        responsable: op?.responsable || 'Sin oportunidad',
        ref: op ? `${op.codigo} ${op.cliente}` : f.name
      };
    });
}

export function eventosReuniones(visits) {
  return visits.filter(esReunionDecisor).map(v => ({
    fecha: v.fecha,
    responsable: v.ejecutivo || 'Sin ejecutivo',
    ref: v.nombreProyecto || v.contacto || ''
  }));
}

/** { total: {semana, mes}, porResponsable: [{name, semana, mes}] } */
export function resumen(eventos, now = new Date()) {
  const p = periodos(now);
  const acc = {};
  let semana = 0, mes = 0;
  for (const e of eventos) {
    const s = enRango(e.fecha, p.semana) ? 1 : 0;
    const m = enRango(e.fecha, p.mes) ? 1 : 0;
    if (!s && !m) continue;
    semana += s; mes += m;
    acc[e.responsable] = acc[e.responsable] || { name: e.responsable, semana: 0, mes: 0 };
    acc[e.responsable].semana += s;
    acc[e.responsable].mes += m;
  }
  return { total: { semana, mes }, porResponsable: Object.values(acc), periodos: p };
}
