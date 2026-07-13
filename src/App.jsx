import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';
import { 
  ETAPAS, TIPOS_CLIENTE, LINEAS_NEGOCIO, PROXIMAS_ACCIONES, PROBABILIDADES, ESTADOS, MOTIVOS_PERDIDA, USUARIOS, INITIAL_OPPORTUNITIES 
} from './mockData';
import {
  subscribeToLogs, getSettings, saveSettings, fetchOpportunities, sendOpportunity, removeOpportunity,
  loginMicrosoft, getActiveToken, checkForRedirectToken, startTokenKeepAlive
} from './services/dataverse';
import Visitas from './components/Visitas';
import './index.css';

// System Roles mapping for active permissions
const ROLES = [
  { name: 'Comercial (Silvana Nichols)', id: 'Vendedor', user: 'Silvana Nichols' },
  { name: 'Gerente General', id: 'Gerente', user: 'Jose Vallejo' },
  { name: 'Consultor Estratégico', id: 'Admin', user: 'Arturo Mora' }
];

// Indicador visual de estado real de sincronización con Dataverse.
// Sin esto, un guardado que solo quedó en el navegador (Modo Demo, sesión
// SSO vencida, sin permisos, etc.) se ve idéntico a uno que sí llegó al
// backend compartido — y otros usuarios simplemente no ven el registro.
function SyncBadge({ status }) {
  if (status === 'error') {
    return (
      <span
        title="No se pudo sincronizar con Dataverse. Este registro solo existe en este navegador — otros usuarios no lo verán hasta reintentar la sincronización."
        style={{
          fontSize: '0.65rem', padding: '1px 6px', borderRadius: 4, marginLeft: 6,
          background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid rgba(248,113,113,0.4)',
          whiteSpace: 'nowrap', cursor: 'help'
        }}
      >
        ⚠ No sincronizado
      </span>
    );
  }
  if (status === 'demo') {
    return (
      <span
        title="La app está en Modo Demo / Simulación Local. Este registro nunca se envía a Dataverse ni es visible para otros usuarios."
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

export default function App() {
  // Views navigation: 'Dashboard' | 'Opportunities' | 'Kanban' | 'Visits' | 'Audit' | 'Dataverse'
  const [view, setView] = useState(() => {
    return sessionStorage.getItem('crm_active_view') || 'Dashboard';
  });

  useEffect(() => {
    sessionStorage.setItem('crm_active_view', view);
  }, [view]);

  const [searchTerm, setSearchTerm] = useState('');
  const [activeRole, setActiveRole] = useState('Admin'); // Default to Admin for complete visual control

  // Responsive / mobile drawer
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  
  // Opportunities State
  const [opportunities, setOpportunities] = useState(() => {
    const saved = localStorage.getItem('crm_opportunities');
    return saved ? JSON.parse(saved) : INITIAL_OPPORTUNITIES;
  });

  // Dataverse settings & logs
  const [dvSettings, setDvSettings] = useState(getSettings);
  const [activeMsalToken, setActiveMsalToken] = useState(() => getActiveToken());
  const [apiLogs, setApiLogs] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('dataverse_logs') || '[]');
    } catch {
      return [];
    }
  });

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState(() => {
    const saved = localStorage.getItem('crm_audit_logs');
    return saved ? JSON.parse(saved) : [
      {
        id: 'audit_init',
        timestamp: '19/5/2026, 10:00:00',
        user: 'Sistema',
        action: 'Inicialización',
        targetId: 'Global',
        details: 'Carga de datos iniciales en CRM'
      }
    ];
  });

  // Filters State
  const [filterStage, setFilterStage] = useState('');
  const [filterOwner, setFilterOwner] = useState('');
  const [filterBusinessLine, setFilterBusinessLine] = useState('');
  
  // Grid Multi-Selection & Bulk Actions
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkStage, setBulkStage] = useState('');
  const [bulkOwner, setBulkOwner] = useState('');
  const [bulkBusinessLine, setBulkBusinessLine] = useState('');
  const [showBulkActions, setShowBulkActions] = useState(false);

  // Sorting State
  const [sortField, setSortField] = useState('fechaIngreso');
  const [sortAsc, setSortAsc] = useState(false);

  // App UI feedback & Modals
  const [notification, setNotification] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showNotificationsList, setShowNotificationsList] = useState(false);
  const [logsUpdated, setLogsUpdated] = useState(0);

  // Modal Form State (Current Opportunity being created/edited)
  const [currentOp, setCurrentOp] = useState({
    id: '',
    codigo: '',
    cliente: '',
    contactoName: '',
    contactoEmail: '',
    contactoPhone: '',
    tipoCliente: TIPOS_CLIENTE[0],
    lineaNegocio: LINEAS_NEGOCIO[0],
    proyecto: '',
    monto: '',
    margen: '',
    probabilidad: PROBABILIDADES[0],
    etapa: ETAPAS[0],
    proximaAccion: PROXIMAS_ACCIONES[0],
    fechaAccion: '',
    responsable: USUARIOS[0].name, // Default to Silvana
    estado: ESTADOS[0],
    motivoPerdida: '',
    fechaIngreso: '',
    notas: ''
  });

  // Subscribe to Dataverse logs on mount
  useEffect(() => {
    const unsubscribe = subscribeToLogs(newLog => {
      setApiLogs(prev => {
        const updated = [newLog, ...prev];
        sessionStorage.setItem('dataverse_logs', JSON.stringify(updated.slice(0, 100)));
        return updated;
      });
      setLogsUpdated(prev => prev + 1);
    });
    return () => unsubscribe();
  }, []);

  // Check for Microsoft OAuth SSO redirection token on mount
  useEffect(() => {
    const token = checkForRedirectToken();
    if (token) {
      setActiveMsalToken(token);
      triggerToast('🟢 Conectado exitosamente con tu cuenta de Microsoft.', 'rgba(16, 185, 129, 0.5)');
    }
    // Renovación proactiva del token: mientras la sesión M365 siga viva, la
    // sesión del CRM no se corta aunque pasen horas cargando información.
    startTokenKeepAlive();
  }, []);

  // Auto-login SSO silencioso: si el usuario ya tiene sesión M365 activa, obtiene el
  // token automáticamente al cargar (sin clic ni pantalla de login). Si no hay sesión,
  // Microsoft regresa con error, marcamos 'sso_silent_failed' y se muestra el botón manual.
  // Las banderas en sessionStorage evitan cualquier bucle de redirección.
  useEffect(() => {
    const settings = getSettings();
    if (settings.mode !== 'live' || settings.authMethod !== 'sso') return;
    if (getActiveToken()) return;                               // ya autenticado
    if (sessionStorage.getItem('sso_silent_failed')) return;    // requiere inicio manual
    if (sessionStorage.getItem('sso_silent_attempted')) return; // evita reintento en bucle
    loginMicrosoft({ silent: true });
  }, []);

  // Auto-fetch opportunities in live mode if authenticated
  useEffect(() => {
    const settings = getSettings();
    if (settings.mode === 'live') {
      if (settings.authMethod === 'sso') {
        const token = getActiveToken();
        if (token) {
          handleDataverseSyncAll();
        }
      } else {
        handleDataverseSyncAll();
      }
    }
  }, [activeMsalToken]);

  // Save opportunities when state changes
  useEffect(() => {
    localStorage.setItem('crm_opportunities', JSON.stringify(opportunities));
  }, [opportunities]);

  // Save audit logs when state changes
  useEffect(() => {
    localStorage.setItem('crm_audit_logs', JSON.stringify(auditLogs));
  }, [auditLogs]);

  // Current active user name based on role picker
  const activeUser = ROLES.find(r => r.id === activeRole) || ROLES[0];

  // Helper: Log audits
  const logAudit = (action, targetId, details) => {
    const newAudit = {
      id: 'audit_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      timestamp: new Date().toLocaleString('es-ES'),
      user: activeUser.user,
      action,
      targetId,
      details
    };
    setAuditLogs(prev => [newAudit, ...prev]);
  };

  // Helper: Toast Notifications
  const triggerToast = (msg, borderCol = 'var(--cam-red)') => {
    setNotification({ text: msg, color: borderCol });
    setTimeout(() => setNotification(null), 4000);
  };

  // Helper: intenta sincronizar una oportunidad con Dataverse y devuelve el
  // registro con un _syncStatus real ('synced' | 'demo' | 'error'), en vez de
  // asumir éxito solo porque se guardó en el estado local del navegador.
  const syncOpportunityRecord = async (op, isNew) => {
    const settings = getSettings();
    if (settings.mode !== 'live') {
      return { record: { ...op, _syncStatus: 'demo' }, ok: true, demo: true };
    }
    try {
      const resultOp = await sendOpportunity(op, isNew);
      const merged = resultOp && resultOp.id ? resultOp : op;
      return { record: { ...merged, _syncStatus: 'synced' }, ok: true };
    } catch (e) {
      return { record: { ...op, _syncStatus: 'error' }, ok: false, error: e };
    }
  };

  // Role Filtering Rules
  const visibleOpportunities = opportunities.filter(op => {
    if (activeRole === 'Vendedor') {
      // Vendedor only sees their own assigned opportunities
      return op.responsable === activeUser.user;
    }
    return true; // Gerente and Admin see all
  });

  // Text-Search & Filter Pipeline
  const filteredOpportunities = visibleOpportunities.filter(op => {
    const matchSearch = 
      op.cliente?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      op.contactoName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      op.codigo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      op.proyecto?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchStage = filterStage ? op.etapa === filterStage : true;
    const matchOwner = filterOwner ? op.responsable === filterOwner : true;
    const matchBusinessLine = filterBusinessLine ? op.lineaNegocio === filterBusinessLine : true;

    return matchSearch && matchStage && matchOwner && matchBusinessLine;
  });

  // Sorted opportunities list
  const sortedOpportunities = [...filteredOpportunities].sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];

    // Handle numeric or date comparison
    if (sortField === 'monto' || sortField === 'margen') {
      valA = Number(valA) || 0;
      valB = Number(valB) || 0;
    } else {
      valA = String(valA || '').toLowerCase();
      valB = String(valB || '').toLowerCase();
    }

    if (valA < valB) return sortAsc ? -1 : 1;
    if (valA > valB) return sortAsc ? 1 : -1;
    return 0;
  });

  // Change Sort direction
  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Automated Alertas & Reminders Generation
  const todayStr = new Date().toISOString().split('T')[0];
  const alertsList = [];

  opportunities.forEach(op => {
    if (op.estado === 'Abierta') {
      // Check for overdue follow-up action
      if (op.fechaAccion && op.fechaAccion < todayStr) {
        alertsList.push({
          type: 'overdue',
          title: `Acción Vencida: ${op.proximaAccion}`,
          desc: `Oportunidad ${op.codigo} (${op.cliente}) requiere atención inmediata. Venció el ${op.fechaAccion}.`,
          date: op.fechaAccion,
          refId: op.id,
          severity: 'high'
        });
      }
      // Check for large deals in final stages
      if (op.monto >= 80000 && (op.etapa === 'Cierre' || op.etapa === 'Seguimiento')) {
        alertsList.push({
          type: 'high_value',
          title: `Trato Crítico: $${op.monto.toLocaleString()}`,
          desc: `${op.cliente} está en fase de ${op.etapa}. Coordinar con gerencia comercial.`,
          date: op.fechaAccion,
          refId: op.id,
          severity: 'medium'
        });
      }
    }
  });

  // CRUD Operations
  const handleOpenNewModal = () => {
    const nextCode = 'OP-' + new Date().getFullYear() + '-' + String(opportunities.length + 1).padStart(3, '0');
    setCurrentOp({
      id: '',
      codigo: nextCode,
      cliente: '',
      contactoName: '',
      contactoEmail: '',
      contactoPhone: '',
      tipoCliente: TIPOS_CLIENTE[0],
      lineaNegocio: LINEAS_NEGOCIO[0],
      proyecto: '',
      monto: '',
      margen: '',
      probabilidad: PROBABILIDADES[0],
      etapa: ETAPAS[0],
      proximaAccion: PROXIMAS_ACCIONES[0],
      fechaAccion: '',
      responsable: activeRole === 'Vendedor' ? USUARIOS[0].name : USUARIOS[0].name,
      estado: ESTADOS[0],
      motivoPerdida: '',
      fechaIngreso: todayStr,
      notas: ''
    });
    setIsModalOpen(true);
  };

  const handleEditClick = (op) => {
    setCurrentOp({ ...op });
    setIsModalOpen(true);
  };

  const handleSaveOpportunity = async (e) => {
    e.preventDefault();
    
    // Validations
    if (!currentOp.cliente || !currentOp.monto || !currentOp.fechaAccion) {
      triggerToast('⚠️ Por favor completa todos los campos requeridos.', 'var(--accent-orange)');
      return;
    }

    if (currentOp.estado === 'Perdida' && !currentOp.motivoPerdida) {
      triggerToast('⚠️ Debes especificar el motivo de pérdida.', 'var(--accent-orange)');
      return;
    }

    const numericMonto = parseFloat(currentOp.monto) || 0;
    const numericMargen = parseFloat(currentOp.margen) || 0;

    let updatedList;
    if (currentOp.id) {
      // EDITING
      const originalOp = opportunities.find(o => o.id === currentOp.id);
      const changes = [];
      if (originalOp.etapa !== currentOp.etapa) changes.push(`Etapa de ${originalOp.etapa} a ${currentOp.etapa}`);
      if (originalOp.monto !== numericMonto) changes.push(`Monto de $${originalOp.monto} a $${numericMonto}`);
      if (originalOp.estado !== currentOp.estado) changes.push(`Estado de ${originalOp.estado} a ${currentOp.estado}`);
      if (originalOp.responsable !== currentOp.responsable) changes.push(`Propietario de ${originalOp.responsable} a ${currentOp.responsable}`);

      const savedOp = {
        ...currentOp,
        monto: numericMonto,
        margen: numericMargen,
        motivoPerdida: currentOp.estado === 'Perdida' ? currentOp.motivoPerdida : ''
      };

      updatedList = opportunities.map(o => o.id === currentOp.id ? savedOp : o);
      setOpportunities(updatedList);

      logAudit('Edición', currentOp.codigo, changes.length > 0 ? changes.join(', ') : 'Modificación general de datos');

      const { record, ok, demo, error } = await syncOpportunityRecord(savedOp, false);
      setOpportunities(prev => prev.map(o => o.id === currentOp.id ? record : o));

      if (ok && !demo) {
        triggerToast(`✅ Oportunidad ${currentOp.codigo} actualizada y sincronizada con Dataverse.`);
      } else if (demo) {
        triggerToast(`🧪 ${currentOp.codigo} actualizada solo en este navegador (Modo Demo, no visible para otros usuarios).`, '#fbbf24');
      } else {
        triggerToast(`⚠️ No se pudo sincronizar con Dataverse — quedó solo en este navegador: ${error?.message || ''}`, '#f87171');
      }
    } else {
      // CREATION
      const newId = 'op_' + Date.now();
      const savedOp = {
        ...currentOp,
        id: newId,
        monto: numericMonto,
        margen: numericMargen
      };

      updatedList = [...opportunities, savedOp];
      setOpportunities(updatedList);

      logAudit('Creación', savedOp.codigo, `Registrada para ${savedOp.cliente} por un monto de $${numericMonto}`);

      const { record, ok, demo, error } = await syncOpportunityRecord(savedOp, true);
      setOpportunities(prev => prev.map(o => o.id === newId ? record : o));

      if (ok && !demo) {
        triggerToast(`🎉 Oportunidad ${savedOp.codigo} creada y sincronizada con Dataverse.`);
      } else if (demo) {
        triggerToast(`🧪 ${savedOp.codigo} creada solo en este navegador (Modo Demo, no visible para otros usuarios).`, '#fbbf24');
      } else {
        triggerToast(`⚠️ No se pudo sincronizar con Dataverse — quedó solo en este navegador: ${error?.message || ''}`, '#f87171');
      }
    }

    setIsModalOpen(false);
  };

  const handleDeleteOpportunity = async (id, code) => {
    if (window.confirm(`¿Estás seguro de que deseas eliminar permanentemente la oportunidad ${code}? Esta acción se registrará en la auditoría.`)) {
      setOpportunities(prev => prev.filter(o => o.id !== id));
      setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
      
      logAudit('Eliminación', code, `Registro eliminado de la base de datos comercial`);
      
      await removeOpportunity(id);
      
      triggerToast(`🗑️ Oportunidad ${code} eliminada del sistema.`, '#f87171');
      setIsModalOpen(false);
    }
  };

  // Kanban Stage Shift Actions
  const handleMoveKanban = async (id, stageDirection) => {
    const op = opportunities.find(o => o.id === id);
    const currentIndex = ETAPAS.indexOf(op.etapa);
    const nextIndex = currentIndex + stageDirection;

    if (nextIndex >= 0 && nextIndex < ETAPAS.length) {
      const nextStage = ETAPAS[nextIndex];
      const updatedOp = { ...op, etapa: nextStage };
      
      setOpportunities(prev => prev.map(o => o.id === id ? updatedOp : o));
      logAudit('Transición Kanban', op.codigo, `Etapa comercial movida de ${op.etapa} a ${nextStage}`);

      // Dataverse Sync — reconciliamos con el estado real de sincronización
      const { record, ok, demo, error } = await syncOpportunityRecord(updatedOp, false);
      setOpportunities(prev => prev.map(o => o.id === id ? record : o));

      if (ok && !demo) {
        triggerToast(`🚀 ${op.codigo} movido a ${nextStage}`);
      } else if (demo) {
        triggerToast(`🧪 ${op.codigo} movido a ${nextStage} (solo local, Modo Demo).`, '#fbbf24');
      } else {
        triggerToast(`⚠️ ${op.codigo} movido a ${nextStage} localmente, pero no se sincronizó: ${error?.message || ''}`, '#f87171');
      }
    }
  };

  // Bulk Actions Handlers
  const toggleSelectRow = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredOpportunities.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredOpportunities.map(o => o.id));
    }
  };

  const handleApplyBulkEdit = async () => {
    if (selectedIds.length === 0) return;

    const targets = opportunities.filter(op => selectedIds.includes(op.id));
    const editCount = targets.length;

    // Optimista: reflejamos el cambio de inmediato en pantalla.
    const optimistic = opportunities.map(op => {
      if (!selectedIds.includes(op.id)) return op;
      const newOp = { ...op };
      if (bulkStage) newOp.etapa = bulkStage;
      if (bulkOwner) newOp.responsable = bulkOwner;
      if (bulkBusinessLine) newOp.lineaNegocio = bulkBusinessLine;
      return newOp;
    });
    setOpportunities(optimistic);

    // Sincronizamos cada uno con Dataverse y reconciliamos el estado real.
    const results = await Promise.all(
      optimistic
        .filter(op => selectedIds.includes(op.id))
        .map(op => syncOpportunityRecord(op, false))
    );

    setOpportunities(prev => prev.map(o => {
      if (!selectedIds.includes(o.id)) return o;
      return results.find(r => r.record.id === o.id)?.record || o;
    }));

    const failed = results.filter(r => !r.ok).length;
    const demoCount = results.filter(r => r.demo).length;

    const auditMsg = `Edición masiva de ${editCount} registros: ` +
      [bulkStage && `Etapa → ${bulkStage}`, bulkOwner && `Propietario → ${bulkOwner}`, bulkBusinessLine && `Línea → ${bulkBusinessLine}`]
      .filter(Boolean).join(', ');

    logAudit('Acción Masiva', 'Varios', auditMsg);

    if (demoCount === editCount) {
      triggerToast(`🧪 Se actualizaron ${editCount} oportunidades solo en este navegador (Modo Demo).`, '#fbbf24');
    } else if (failed > 0) {
      triggerToast(`⚠️ ${editCount - failed}/${editCount} sincronizadas con Dataverse. ${failed} quedaron solo locales — revisa conexión/sesión.`, '#f87171');
    } else {
      triggerToast(`⚡ Se actualizaron ${editCount} oportunidades en lote y se sincronizaron con Dataverse.`);
    }
    setSelectedIds([]);
    setBulkStage('');
    setBulkOwner('');
    setBulkBusinessLine('');
    setShowBulkActions(false);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (window.confirm(`¿Estás seguro de que deseas eliminar permanentemente estas ${selectedIds.length} oportunidades?`)) {
      const selectedCodes = opportunities.filter(o => selectedIds.includes(o.id)).map(o => o.codigo).join(', ');
      
      setOpportunities(prev => prev.filter(o => !selectedIds.includes(o.id)));
      
      logAudit('Eliminación Masiva', 'Varios', `Se eliminaron las oportunidades: ${selectedCodes}`);
      
      for (const id of selectedIds) {
        await removeOpportunity(id);
      }
      
      triggerToast(`🗑️ ${selectedIds.length} oportunidades eliminadas masivamente.`, '#f87171');
      setSelectedIds([]);
      setShowBulkActions(false);
    }
  };

  // Dataverse Sync All Trigger (GET)
  const handleDataverseSyncAll = async () => {
    triggerToast('🔄 Sincronizando con Microsoft Dataverse...');
    try {
      const results = await fetchOpportunities(opportunities);
      // Dataverse manda: reemplazamos el estado con lo que devuelva (aunque sea vacío).
      // Todo lo que viene de aquí es, por definición, la fuente compartida.
      if (Array.isArray(results)) {
        setOpportunities(results.map(r => ({ ...r, _syncStatus: 'synced' })));
      }
      triggerToast('⚡ Dataverse sincronizado con éxito. Revisa la consola.', 'var(--accent-green)');
    } catch (e) {
      triggerToast(`❌ Error de conexión al sincronizar: ${e.message || 'CORS o Red'}`, '#f87171');
    }
  };

  // Migrar tratos locales → Dataverse (POST bulk)
  const handleMigrateLocalToDataverse = async () => {
    if (!window.confirm(`¿Migrar tratos locales a Dataverse? Solo se enviarán los que aún NO existan (validado por código), para no duplicar.`)) return;
    triggerToast('📤 Verificando duplicados y migrando...');
    let ok = 0, fail = 0, skipped = 0;

    // Traer los códigos ya existentes en Dataverse para no duplicar
    let existingCodes = new Set();
    try {
      const existing = await fetchOpportunities([]);
      existingCodes = new Set(existing.map(o => o.codigo));
    } catch (e) {
      triggerToast(`❌ No se pudo verificar Dataverse antes de migrar: ${e.message}`, '#f87171');
      return;
    }

    const migrated = [];
    for (const op of opportunities) {
      if (op.codigo && existingCodes.has(op.codigo)) {
        migrated.push(op);
        skipped++;
        continue;
      }
      try {
        const result = await sendOpportunity({ ...op, id: '' }, true);
        migrated.push(result ? { ...result, _syncStatus: 'synced' } : { ...op, _syncStatus: 'synced' });
        if (op.codigo) existingCodes.add(op.codigo); // evita duplicar dentro del mismo lote
        ok++;
        logAudit('Migración Dataverse', op.id, `Trato "${op.cliente}" migrado exitosamente.`);
      } catch (e) {
        migrated.push({ ...op, _syncStatus: 'error' });
        fail++;
      }
    }
    setOpportunities(migrated);
    triggerToast(
      fail === 0
        ? `✅ ${ok} migrados, ${skipped} ya existían (omitidos).`
        : `⚠️ ${ok} migrados, ${skipped} omitidos, ${fail} fallaron. Revisa la consola.`,
      fail === 0 ? 'rgba(16,185,129,0.5)' : 'rgba(234,179,8,0.5)'
    );
  };

  // Logout interactive user from Microsoft
  const handleLogoutMicrosoft = () => {
    sessionStorage.removeItem('dataverse_oauth_token');
    // Marcamos que el reintento silencioso queda deshabilitado hasta un inicio manual,
    // para que cerrar sesión no dispare un auto-login inmediato.
    sessionStorage.setItem('sso_silent_failed', '1');
    sessionStorage.removeItem('sso_silent_attempted');
    setActiveMsalToken(null);
    triggerToast('🔴 Sesión de Microsoft cerrada.');
  };

  const handleResetStorage = () => {
    if (window.confirm('¿Deseas restablecer los datos locales a su estado inicial? Se borrará todo tu historial.')) {
      localStorage.removeItem('crm_opportunities');
      localStorage.removeItem('crm_audit_logs');
      sessionStorage.removeItem('dataverse_logs');
      setOpportunities(INITIAL_OPPORTUNITIES);
      setAuditLogs([
        {
          id: 'audit_reset',
          timestamp: new Date().toLocaleString('es-ES'),
          user: activeUser.user,
          action: 'Restablecimiento',
          targetId: 'Global',
          details: 'Base de datos restablecida a los valores de fábrica.'
        }
      ]);
      setApiLogs([]);
      triggerToast('🔄 Sistema de almacenamiento local restablecido.', 'var(--accent-orange)');
    }
  };

  // Excel Report Exporter
  const handleExportExcel = () => {
    const data = sortedOpportunities.map(op => ({
      'Código': op.codigo,
      'Cliente': op.cliente,
      'Contacto Principal': op.contactoName,
      'Email': op.contactoEmail,
      'Teléfono': op.contactoPhone,
      'Tipo Cliente': op.tipoCliente,
      'Línea de Negocio': op.lineaNegocio,
      'Monto Estimado (USD)': op.monto,

      'Probabilidad (%)': op.probabilidad,
      'Etapa Comercial': op.etapa,
      'Estado': op.estado,
      'Fecha Ingreso': op.fechaIngreso,
      'Próxima Acción': op.proximaAccion,
      'Fecha Próxima Acción': op.fechaAccion,
      'Responsable': op.responsable,
      'Notas de Seguimiento': op.notas,
      'Motivo Pérdida': op.motivoPerdida
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Oportunidades CAM');

    // Auto-fit column widths
    const maxLens = {};
    data.forEach(row => {
      Object.keys(row).forEach(key => {
        const val = String(row[key] || '');
        maxLens[key] = Math.max(maxLens[key] || 10, val.length);
      });
    });
    ws['!cols'] = Object.keys(maxLens).map(key => ({ wch: maxLens[key] + 3 }));

    XLSX.writeFile(wb, `Reporte_CRM_CAM_${todayStr}.xlsx`);
    
    logAudit('Reporte', 'Global', 'Generación y exportación de reporte completo en formato MS Excel');
    triggerToast('📊 Reporte Excel exportado correctamente.', 'var(--accent-green)');
  };

  // KPI Calculations
  const activeDeals = visibleOpportunities.filter(o => o.estado === 'Abierta' || o.estado === 'Congelada');
  const wonDeals = visibleOpportunities.filter(o => o.estado === 'Ganada');
  const lostDeals = visibleOpportunities.filter(o => o.estado === 'Perdida');

  const kpiPipelineTotal = activeDeals.reduce((sum, o) => sum + (o.monto || 0), 0);
  
  // Calculate won sales this month (May 2026)
  const currentMonthPrefix = '2026-05';
  const salesThisMonth = wonDeals
    .filter(o => o.fechaIngreso && o.fechaIngreso.startsWith(currentMonthPrefix))
    .reduce((sum, o) => sum + (o.monto || 0), 0);

  const totalClosed = wonDeals.length + lostDeals.length;
  const kpiTasaCierre = totalClosed > 0 ? Math.round((wonDeals.length / totalClosed) * 100) : 0;
  
  const avgMargin = wonDeals.length > 0 
    ? Math.round(wonDeals.reduce((sum, o) => sum + (o.margen || 0), 0) / wonDeals.length) 
    : 0;

  const keyAccountsCount = visibleOpportunities.filter(o => o.monto >= 75000).length;

  // Chart Data: Pipeline by Line of Business
  const businessLineData = LINEAS_NEGOCIO.map(line => {
    const totalAmount = visibleOpportunities
      .filter(o => o.lineaNegocio === line)
      .reduce((sum, o) => sum + (o.monto || 0), 0);
    return { name: line, monto: totalAmount };
  }).filter(item => item.monto > 0);

  // Chart Data: Seller Performance
  const sellerPerformanceData = USUARIOS.map(user => {
    const userDeals = visibleOpportunities.filter(o => o.responsable === user.name);
    const totalPipeline = userDeals.reduce((sum, o) => sum + (o.monto || 0), 0);
    const totalWon = userDeals.filter(o => o.estado === 'Ganada').reduce((sum, o) => sum + (o.monto || 0), 0);
    return { name: user.name, 'Pipeline Total': totalPipeline, 'Ventas Ganadas': totalWon };
  }).filter(item => item['Pipeline Total'] > 0);

  // Custom Interactive Funnel Calculations (Accumulated per stage)
  const funnelStagesStats = ETAPAS.map((stage, idx) => {
    const dealsInStage = visibleOpportunities.filter(o => o.etapa === stage && o.estado !== 'Perdida');
    const amountInStage = dealsInStage.reduce((sum, o) => sum + (o.monto || 0), 0);
    const countInStage = dealsInStage.length;
    return { stage, amount: amountInStage, count: countInStage };
  });

  const maxStageAmount = Math.max(...funnelStagesStats.map(s => s.amount), 1);

  // Loss Reason Breakdown (for Reports)
  const lossReasonStats = MOTIVOS_PERDIDA.map(reason => {
    const count = lostDeals.filter(o => o.motivoPerdida === reason).length;
    const amount = lostDeals.filter(o => o.motivoPerdida === reason).reduce((sum, o) => sum + (o.monto || 0), 0);
    return { name: reason, value: count, amount };
  }).filter(r => r.value > 0);

  const COLORS = ['#c9242a', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];

  return (
    <div style={{ display: 'flex', background: 'var(--bg-primary)', minHeight: '100vh', position: 'relative' }}>
      
      {/* FLOATING DATAVERSE CONNECTION BANNER */}
      {dvSettings.mode === 'live' && (
        <div 
          className="glass animate-fade-in"
          style={{
            position: 'fixed',
            bottom: '1.5rem',
            right: '1.5rem',
            border: `1px solid ${activeMsalToken ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
            borderRadius: '12px',
            padding: '0.8rem 1.2rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.8rem',
            boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
            zIndex: 5000,
            cursor: 'pointer',
            transition: 'var(--transition-smooth)'
          }}
          onClick={() => setView('Dataverse')}
          title="Ver Ajustes de Dataverse"
        >
          <div style={{ 
            width: '10px', 
            height: '10px', 
            borderRadius: '50%', 
            background: activeMsalToken ? '#10b981' : '#ef4444',
            boxShadow: `0 0 10px ${activeMsalToken ? '#10b981' : '#ef4444'}`
          }}></div>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#fff' }}>
              Dataverse {activeMsalToken ? 'Conectado' : 'Desconectado'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              {activeMsalToken ? 'Sesión SSO Activa' : 'Requiere Inicio de Sesión'}
            </div>
          </div>
        </div>
      )}

      {/* Antes, en Modo Demo no había NINGÚN indicador visual — un usuario podía
          pasar semanas guardando datos "solo locales" sin darse cuenta de que
          nunca llegaban a Dataverse ni eran visibles para el resto del equipo. */}
      {dvSettings.mode !== 'live' && (
        <div
          className="glass animate-fade-in"
          style={{
            position: 'fixed', bottom: '1.5rem', right: '1.5rem',
            border: '1px solid rgba(251,191,36,0.5)', borderRadius: '12px',
            padding: '0.8rem 1.2rem', display: 'flex', alignItems: 'center', gap: '0.8rem',
            boxShadow: '0 8px 30px rgba(0,0,0,0.5)', zIndex: 5000, cursor: 'pointer'
          }}
          onClick={() => setView('Dataverse')}
          title="Ver Ajustes de Dataverse"
        >
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#fbbf24', boxShadow: '0 0 10px #fbbf24' }}></div>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#fff' }}>🧪 Modo Demo activo</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              Tus datos NO se comparten con otros usuarios
            </div>
          </div>
        </div>
      )}

      {/* SIDEBAR SIDEBAR */}
      <aside className="glass" style={{
        width: '280px',
        height: '100vh',
        padding: '2rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '2.5rem',
        ...(isMobile ? {
          position: 'fixed',
          top: 0,
          left: sidebarOpen ? 0 : '-320px',
          zIndex: 1000,
          transition: 'left 0.3s ease',
          boxShadow: sidebarOpen ? '0 0 50px rgba(0,0,0,0.7)' : 'none',
          overflowY: 'auto'
        } : {
          position: 'sticky',
          top: 0
        })
      }}>
        {/* LOGO AREA */}
        <div style={{ borderBottom: '1px solid var(--border-primary)', paddingBottom: '1.5rem', display: 'flex', justifyContent: 'center' }}>
          <div style={{ background: '#ffffff', borderRadius: '16px', padding: '20px 18px', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <img src="/logo-cam.png" alt="CAM" style={{ width: '100%', height: 'auto', display: 'block' }} />
          </div>
        </div>

        {/* NAVIGATION MENUS */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', flex: 1 }}>
          {[
            { id: 'Dashboard', label: 'Dashboard' },
            { id: 'Opportunities', label: 'Oportunidades' },
            { id: 'Kanban', label: 'Pipeline Comercial' },
            { id: 'Visits', label: 'Visitas' },
            { id: 'Audit', label: 'Auditoría' },
            { id: 'Dataverse', label: 'Dataverse API' }
          ].map(item => (
            <button
              key={item.id}
              onClick={() => { setView(item.id); setSidebarOpen(false); }}
              style={{
                background: view === item.id ? 'var(--cam-red)' : 'transparent',
                color: '#ffffff',
                border: 'none',
                opacity: view === item.id ? 1 : 0.7,
                padding: '0.85rem 1rem',
                borderRadius: '8px',
                textAlign: 'left',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.8rem',
                transition: 'var(--transition-smooth)'
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* USER PROFILE INFO */}
        <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <div style={{ 
              width: '40px', 
              height: '40px', 
              borderRadius: '50%', 
              background: 'var(--bg-tertiary)', 
              border: '2px solid var(--cam-gray-mid)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              fontSize: '1.1rem'
            }}>
              👤
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#fff' }}>{activeUser.user}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--cam-gray-mid)' }}>Rol: {activeRole}</div>
            </div>
          </div>
          <button 
            onClick={handleExportExcel}
            className="btn-secondary" 
            style={{ width: '100%', justifyContent: 'center', padding: '0.5rem', fontSize: '0.8rem' }}
          >
            📥 Exportar Excel
          </button>
        </div>
      </aside>

      {/* MOBILE: backdrop + hamburger */}
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 999 }} />
      )}
      {isMobile && (
        <button
          onClick={() => setSidebarOpen(o => !o)}
          aria-label="Menú"
          style={{ position: 'fixed', top: '0.85rem', left: '0.85rem', zIndex: 1001, background: 'var(--cam-red)', color: '#fff', border: 'none', borderRadius: '10px', width: '46px', height: '46px', fontSize: '1.4rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(0,0,0,0.4)' }}
        >
          {sidebarOpen ? '✕' : '☰'}
        </button>
      )}

      {/* MAIN CONTAINER CONTENT */}
      {/* Padding inferior extra: el badge flotante de Dataverse (fixed, bottom-right)
          se superponía a los botones de acción (editar/borrar) de la última fila
          en tablas y listas, bloqueando el clic. Reservamos espacio para que
          ninguna fila quede detrás del badge. */}
      <main style={{ flex: 1, padding: isMobile ? '4.5rem 1rem 6.5rem' : '2.5rem 2.5rem 7rem 2.5rem', overflowY: 'auto', width: isMobile ? '100%' : 'auto', minWidth: 0 }}>
        
        {/* HEADER BAR AND TOOLS */}
        <header style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '2.5rem',
          borderBottom: '1px solid var(--border-primary)',
          paddingBottom: '1.5rem'
        }}>
          <div>
            <h1 style={{ fontSize: '2.2rem', color: '#fff', marginBottom: '0.3rem' }}>
              {view === 'Dashboard' && 'Dashboard Ejecutivo'}
              {view === 'Opportunities' && 'Cartera de Oportunidades'}
              {view === 'Kanban' && 'Pipeline Comercial'}
              {view === 'Visits' && 'Visitas Comerciales'}
              {view === 'Audit' && 'Bitácora de Auditoría'}
              {view === 'Dataverse' && 'Configuración de Dataverse'}
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
              {view === 'Dashboard' && 'Métricas comerciales clave y rendimiento del funnel de ventas de Grupo CAM.'}
              {view === 'Opportunities' && 'Gestión avanzada, filtros y acciones masivas para oportunidades.'}
              {view === 'Kanban' && 'Gestión ágil de las 8 fases comerciales del proceso.'}
              {view === 'Visits' && 'Registro de visitas a obra y campo · Tabla cr168_visits en Dataverse.'}
              {view === 'Audit' && 'Logs históricos inmutables de transacciones y cambios del CRM.'}
              {view === 'Dataverse' && 'Soporte y conexión API REST / OData OAuth 2.0 de Microsoft Dynamics.'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', position: 'relative' }}>
            
            {/* ROLE SIMULATOR PICKER */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label style={{ fontSize: '0.75rem', marginBottom: '0px' }}>Simular Rol</label>
              <select 
                value={activeRole} 
                onChange={(e) => {
                  setActiveRole(e.target.value);
                  setSelectedIds([]);
                  triggerToast(`🔄 Rol cambiado a ${e.target.value}. Datos recalculados.`);
                }}
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', width: '210px', height: '36px' }}
              >
                {ROLES.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>

            {/* NOTIFICATION CENTER SYSTEM */}
            <div style={{ position: 'relative' }}>
              <button 
                onClick={() => setShowNotificationsList(!showNotificationsList)}
                style={{ 
                  background: 'var(--bg-tertiary)', 
                  border: '1px solid var(--border-primary)', 
                  width: '40px', 
                  height: '40px', 
                  borderRadius: '8px', 
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.2rem',
                  position: 'relative'
                }}
              >
                🔔
                {alertsList.length > 0 && (
                  <span style={{ 
                    position: 'absolute', 
                    top: '-4px', 
                    right: '-4px', 
                    background: 'var(--cam-red)', 
                    color: '#fff', 
                    fontSize: '0.7rem', 
                    fontWeight: 'bold',
                    padding: '2px 6px',
                    borderRadius: '50%',
                    boxShadow: '0 0 8px var(--cam-red)'
                  }}>
                    {alertsList.length}
                  </span>
                )}
              </button>

              {/* OVERLAY NOTIFICATION LIST */}
              {showNotificationsList && (
                <div className="glass" style={{ 
                  position: 'absolute', 
                  top: '50px', 
                  right: 0, 
                  width: '360px', 
                  maxHeight: '400px', 
                  overflowY: 'auto',
                  borderRadius: '12px', 
                  padding: '1.2rem', 
                  zIndex: 2200,
                  boxShadow: 'var(--shadow-premium)',
                  border: '1px solid var(--border-primary)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid var(--border-primary)', paddingBottom: '0.5rem' }}>
                    <h4 style={{ color: '#fff', fontSize: '0.95rem' }}>Recordatorios y Alertas</h4>
                    <button onClick={() => setShowNotificationsList(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>×</button>
                  </div>
                  {alertsList.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>No hay alertas de seguimiento pendientes.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                      {alertsList.map((alert, idx) => (
                        <div key={idx} style={{ 
                          background: alert.type === 'overdue' ? 'rgba(201, 36, 42, 0.08)' : 'rgba(37, 99, 235, 0.08)',
                          borderLeft: alert.type === 'overdue' ? '3px solid var(--cam-red)' : '3px solid var(--accent-blue)',
                          padding: '0.8rem',
                          borderRadius: '6px'
                        }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#fff', marginBottom: '0.2rem' }}>{alert.title}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>{alert.desc}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* BUTTON ADD REAL RECORD — visible para todos los roles, incluido Vendedor (Silvana) */}
            <button className="btn-primary" onClick={handleOpenNewModal} style={{ height: '40px' }}>
              ➕ Nueva Oportunidad
            </button>
          </div>
        </header>

        {/* TOAST SYSTEM FEEDBACK */}
        {notification && (
          <div className="glass animate-fade-in" style={{ 
            position: 'fixed', 
            top: '2.5rem', 
            right: '2.5rem', 
            padding: '1.2rem 2.2rem', 
            borderLeft: `4px solid ${notification.color || 'var(--cam-red)'}`, 
            zIndex: 3500,
            color: '#fff',
            fontWeight: '600',
            fontSize: '0.92rem',
            boxShadow: 'var(--shadow-premium)'
          }}>
            {notification.text}
          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW 1: DASHBOARD EXECUTIVE */}
        {/* ============================================================== */}
        {view === 'Dashboard' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
            
            {/* KPI PANEL */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1.5rem' }}>
              <div className="kpi-card primary">
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Pipeline Comercial</span>
                <div className="kpi-val">${kpiPipelineTotal.toLocaleString()}</div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{activeDeals.length} tratos activos en curso</span>
              </div>
              <div className="kpi-card success">
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Ventas Mayo 2026</span>
                <div className="kpi-val">${salesThisMonth.toLocaleString()}</div>
                <span style={{ fontSize: '0.75rem', color: 'var(--accent-green)' }}>Ganadas en el mes actual</span>
              </div>
              <div className="kpi-card info">
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Tasa de Cierre</span>
                <div className="kpi-val">{kpiTasaCierre}%</div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Sobre {totalClosed} tratos cerrados</span>
              </div>
              <div className="kpi-card warning">
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Margen Promedio</span>
                <div className="kpi-val">{avgMargin}%</div>
                <span style={{ fontSize: '0.75rem', color: 'var(--accent-orange)' }}>Margen bruto de tratos ganados</span>
              </div>
              <div className="kpi-card">
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Clientes Clave (A)</span>
                <div className="kpi-val" style={{ color: '#fff' }}>{keyAccountsCount}</div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Tratos de más de $75,000 USD</span>
              </div>
            </div>

            {/* DASHBOARD PLOTS - GRAPHICS */}
            <div className="resp-2col" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2rem' }}>
              
              {/* Funnel de Ventas Interactivo Custom */}
              <div className="glass" style={{ padding: '2rem', borderRadius: '16px' }}>
                <h3 style={{ color: '#fff', fontSize: '1.2rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Funnel de Ventas Comercial CAM</span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--cam-gray-mid)' }}>Suma de Montos Acumulados</span>
                </h3>
                <div className="funnel-container">
                  {funnelStagesStats.map((item, idx) => {
                    const widthPercent = maxStageAmount > 0 ? (item.amount / maxStageAmount) * 100 : 0;
                    return (
                      <div key={idx} className="funnel-row">
                        <div className="funnel-label">
                          <span style={{ marginRight: '6px', color: 'var(--cam-red)', fontWeight: 'bold' }}>{idx + 1}.</span>
                          {item.stage}
                        </div>
                        <div className="funnel-bar-wrapper">
                          <div className="funnel-bar" style={{ width: `${Math.max(widthPercent, 5)}%`, opacity: 1 - idx * 0.08 }}>
                            {item.amount > 0 && `$${Math.round(item.amount/1000)}k`}
                          </div>
                          <span className="funnel-val">
                            {item.count > 0 ? `${item.count} tratos` : '-'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Distribuición por Línea de Negocio */}
              <div className="glass" style={{ padding: '2rem', borderRadius: '16px', display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ color: '#fff', fontSize: '1.2rem', marginBottom: '1.5rem' }}>Pipeline por Línea de Negocio</h3>
                <div style={{ flex: 1, minHeight: '300px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <Pie
                        data={businessLineData.filter(item => item.monto > 0)}
                        cx="40%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={100}
                        paddingAngle={4}
                        dataKey="monto"
                        nameKey="name"
                      >
                        {businessLineData.filter(item => item.monto > 0).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="transparent" />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#131518', border: '1px solid var(--border-primary)', borderRadius: '8px', color: '#fff' }}
                        formatter={(value) => [`$${value.toLocaleString()}`, 'Pipeline']}
                        itemStyle={{ color: '#fff' }}
                      />
                      <Legend 
                        layout="vertical" 
                        verticalAlign="middle" 
                        align="right"
                        iconType="circle"
                        wrapperStyle={{ fontSize: '12px', paddingLeft: '10px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* SECOND ROW PLOT: SALES PERFORMANCE */}
            <div className="resp-2col" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '2rem' }}>
              
              {/* Desempeño por Vendedor */}
              <div className="glass" style={{ padding: '2rem', borderRadius: '16px' }}>
                <h3 style={{ color: '#fff', fontSize: '1.2rem', marginBottom: '1.5rem' }}>Desempeño y Cartera por Responsable</h3>
                <div style={{ minHeight: '320px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sellerPerformanceData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#252b35" vertical={false} />
                      <XAxis dataKey="name" stroke="var(--cam-gray-mid)" fontSize={11} tickLine={false} />
                      <YAxis stroke="var(--cam-gray-mid)" fontSize={11} tickLine={false} tickFormatter={(val) => `$${val/1000}k`} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#131518', border: '1px solid var(--border-primary)', borderRadius: '8px', color: '#fff' }}
                        formatter={(value) => `$${value.toLocaleString()}`}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar dataKey="Pipeline Total" fill="var(--cam-gray-mid)" radius={[4, 4, 0, 0]} barSize={25} />
                      <Bar dataKey="Ventas Ganadas" fill="var(--accent-green)" radius={[4, 4, 0, 0]} barSize={25} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Reporte de Pérdidas y Motivos */}
              <div className="glass" style={{ padding: '2rem', borderRadius: '16px', display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ color: '#fff', fontSize: '1.2rem', marginBottom: '1rem' }}>Análisis de Pérdidas</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginBottom: '1.5rem' }}>Distribución de motivos en oportunidades perdidas</p>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '1rem' }}>
                  {lossReasonStats.length === 0 ? (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem' }}>No hay oportunidades perdidas para analizar.</div>
                  ) : (
                    lossReasonStats.map((item, idx) => (
                      <div key={idx} style={{ background: 'rgba(255,255,255,0.02)', padding: '0.8rem 1rem', borderRadius: '8px', border: '1px solid var(--border-primary)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                          <span style={{ fontSize: '0.88rem', fontWeight: '600', color: '#fff' }}>Motivo: {item.name}</span>
                          <span style={{ fontSize: '0.85rem', color: 'var(--cam-red)', fontWeight: 'bold' }}>{item.value} tratos</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          <span>Impacto Financiero:</span>
                          <span>${item.amount.toLocaleString()} USD</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW 2: ADVANCED TABLE VIEW (GRID) */}
        {/* ============================================================== */}
        {view === 'Opportunities' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* BARRA DE FILTROS Y BÚSQUEDAS */}
            <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
              
              <div style={{ flex: 1.2, minWidth: '240px' }}>
                <label>Buscar Oportunidad</label>
                <input 
                  type="text" 
                  placeholder="Buscar por cliente, contacto, código..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div style={{ flex: 0.8, minWidth: '160px' }}>
                <label>Filtrar Etapa</label>
                <select value={filterStage} onChange={(e) => setFilterStage(e.target.value)}>
                  <option value="">Todas las etapas</option>
                  {ETAPAS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>

              {activeRole !== 'Vendedor' && (
                <div style={{ flex: 0.8, minWidth: '160px' }}>
                  <label>Filtrar Responsable</label>
                  <select value={filterOwner} onChange={(e) => setFilterOwner(e.target.value)}>
                    <option value="">Todos los vendedores</option>
                    {USUARIOS.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                  </select>
                </div>
              )}

              <div style={{ flex: 0.8, minWidth: '160px' }}>
                <label>Línea de Negocio</label>
                <select value={filterBusinessLine} onChange={(e) => setFilterBusinessLine(e.target.value)}>
                  <option value="">Todas las líneas</option>
                  {LINEAS_NEGOCIO.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.6rem' }}>
                <button 
                  className="btn-secondary" 
                  onClick={() => {
                    setSearchTerm('');
                    setFilterStage('');
                    setFilterOwner('');
                    setFilterBusinessLine('');
                  }}
                  style={{ height: '40px' }}
                >
                  Limpiar Filtros
                </button>
              </div>
            </div>

            {/* SELECCIÓN Y CONTROLES MASIVOS (BULK ACTIONS) */}
            {selectedIds.length > 0 && (
              <div className="glass animate-fade-in" style={{ 
                padding: '1.2rem', 
                borderRadius: '10px', 
                borderLeft: '4px solid var(--cam-red)',
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '0.92rem', fontWeight: 'bold', color: '#fff' }}>
                    ⚡ {selectedIds.length} oportunidades seleccionadas
                  </span>
                  <button 
                    className="btn-secondary" 
                    onClick={() => setShowBulkActions(!showBulkActions)}
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  >
                    {showBulkActions ? 'Ocultar Edición Masiva' : 'Aplicar Edición en Lote'}
                  </button>
                </div>

                {showBulkActions && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
                    <select 
                      value={bulkStage} 
                      onChange={(e) => setBulkStage(e.target.value)}
                      style={{ width: '150px', padding: '0.4rem', fontSize: '0.8rem' }}
                    >
                      <option value="">Cambiar Etapa...</option>
                      {ETAPAS.map(x => <option key={x} value={x}>{x}</option>)}
                    </select>

                    {activeRole !== 'Vendedor' && (
                      <select 
                        value={bulkOwner} 
                        onChange={(e) => setBulkOwner(e.target.value)}
                        style={{ width: '150px', padding: '0.4rem', fontSize: '0.8rem' }}
                      >
                        <option value="">Asignar Vendedor...</option>
                        {USUARIOS.map(x => <option key={x.id} value={x.name}>{x.name}</option>)}
                      </select>
                    )}

                    <select 
                      value={bulkBusinessLine} 
                      onChange={(e) => setBulkBusinessLine(e.target.value)}
                      style={{ width: '150px', padding: '0.4rem', fontSize: '0.8rem' }}
                    >
                      <option value="">Cambiar Línea...</option>
                      {LINEAS_NEGOCIO.map(x => <option key={x} value={x}>{x}</option>)}
                    </select>

                    <button 
                      onClick={handleApplyBulkEdit} 
                      className="btn-primary" 
                      style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', boxShadow: 'none' }}
                      disabled={!bulkStage && !bulkOwner && !bulkBusinessLine}
                    >
                      Aplicar
                    </button>
                  </div>
                )}

                <div>
                  <button 
                    onClick={handleBulkDelete} 
                    className="btn-danger" 
                    style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}
                  >
                    Eliminar Selección
                  </button>
                </div>
              </div>
            )}

            {/* TABLA PRINCIPAL DE DATOS */}
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '50px', textAlign: 'center' }}>
                      <input 
                        type="checkbox" 
                        checked={selectedIds.length === filteredOpportunities.length && filteredOpportunities.length > 0} 
                        onChange={toggleSelectAll}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                    </th>
                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('codigo')}>Código {sortField === 'codigo' ? (sortAsc ? '▲' : '▼') : ''}</th>
                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('cliente')}>Cliente {sortField === 'cliente' ? (sortAsc ? '▲' : '▼') : ''}</th>
                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('monto')}>Monto {sortField === 'monto' ? (sortAsc ? '▲' : '▼') : ''}</th>

                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('etapa')}>Etapa {sortField === 'etapa' ? (sortAsc ? '▲' : '▼') : ''}</th>
                    <th>Línea</th>
                    <th>Estado</th>
                    <th>Próxima Acción</th>
                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('fechaAccion')}>Fecha Acción {sortField === 'fechaAccion' ? (sortAsc ? '▲' : '▼') : ''}</th>
                    {activeRole !== 'Vendedor' && <th>Responsable</th>}
                    <th style={{ width: '100px' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedOpportunities.length === 0 ? (
                    <tr>
                      <td colSpan={activeRole === 'Vendedor' ? 11 : 12} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                        No se encontraron oportunidades registradas en la búsqueda actual.
                      </td>
                    </tr>
                  ) : (
                    sortedOpportunities.map(op => {
                      const isOverdue = op.estado === 'Abierta' && op.fechaAccion && op.fechaAccion < todayStr;
                      return (
                        <tr 
                          key={op.id} 
                          className={`hover-row ${isOverdue ? 'overdue' : ''}`}
                        >
                          <td style={{ textAlign: 'center' }}>
                            <input 
                              type="checkbox" 
                              checked={selectedIds.includes(op.id)}
                              onChange={() => toggleSelectRow(op.id)}
                              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                            />
                          </td>
                          <td style={{ fontWeight: 'bold', color: '#fff' }}>{op.codigo}<SyncBadge status={op._syncStatus} /></td>
                          <td>
                            <div style={{ fontWeight: '600' }}>{op.cliente}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{op.contactoName}</div>
                          </td>
                          <td style={{ fontWeight: 'bold' }}>${op.monto?.toLocaleString()}</td>

                          <td>
                            <span style={{ 
                              background: 'var(--bg-tertiary)', 
                              border: '1px solid var(--border-primary)',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.78rem'
                            }}>
                              {op.etapa}
                            </span>
                          </td>
                          <td>{op.lineaNegocio}</td>
                          <td>
                            <span className={`badge ${
                              op.estado === 'Ganada' ? 'badge-won' :
                              op.estado === 'Perdida' ? 'badge-lost' :
                              op.estado === 'Congelada' ? 'badge-frozen' : 'badge-open'
                            }`}>
                              {op.estado}
                            </span>
                          </td>
                          <td>{op.proximaAccion}</td>
                          <td style={{ color: isOverdue ? 'var(--cam-red)' : 'inherit', fontWeight: isOverdue ? 'bold' : 'normal' }}>
                            {op.fechaAccion} {isOverdue && '⚠️ Vencida'}
                          </td>
                          {activeRole !== 'Vendedor' && <td>{op.responsable}</td>}
                          <td>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button 
                                onClick={() => handleEditClick(op)}
                                className="btn-secondary"
                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', borderRadius: '4px' }}
                              >
                                ✏️ Ver / Editar
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW 3: PIPELINE (KANBAN BOARD) */}
        {/* ============================================================== */}
        {view === 'Kanban' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '1.2rem', overflowX: 'auto', padding: '0.5rem 0', height: 'calc(100vh - 240px)' }}>
              {ETAPAS.map((stage) => {
                const stageDeals = visibleOpportunities.filter(o => o.etapa === stage && o.estado !== 'Perdida');
                const stageAmount = stageDeals.reduce((sum, o) => sum + (o.monto || 0), 0);
                
                return (
                  <div key={stage} style={{ minWidth: '320px', width: '320px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    
                    {/* Header Columna Kanban */}
                    <div className="glass" style={{ padding: '1rem', borderRadius: '8px', borderLeft: '4px solid var(--cam-red)' }}>
                      <h4 style={{ fontSize: '0.9rem', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stage}</h4>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        <span>{stageDeals.length} tratos activos</span>
                        <span style={{ fontWeight: 'bold', color: '#fff' }}>${stageAmount.toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Contenedor de Tarjetas Kanban */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', paddingRight: '4px', flex: 1 }}>
                      {stageDeals.length === 0 ? (
                        <div style={{ border: '2px dashed var(--border-primary)', borderRadius: '8px', padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                          Sin oportunidades
                        </div>
                      ) : (
                        stageDeals.map(op => {
                          const isOverdue = op.estado === 'Abierta' && op.fechaAccion && op.fechaAccion < todayStr;
                          return (
                            <div 
                              key={op.id} 
                              className="glass" 
                              style={{ 
                                padding: '1.2rem', 
                                borderRadius: '10px', 
                                borderLeft: isOverdue ? '4px solid var(--cam-red)' : '1px solid var(--glass-border)',
                                cursor: 'pointer' 
                              }}
                              onClick={() => handleEditClick(op)}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                <span style={{ fontSize: '0.78rem', color: 'var(--cam-gray-mid)', fontWeight: 'bold' }}>{op.codigo}<SyncBadge status={op._syncStatus} /></span>
                                <span className={`badge ${op.estado === 'Ganada' ? 'badge-won' : 'badge-open'}`} style={{ padding: '2px 6px', fontSize: '0.68rem' }}>
                                  {op.estado}
                                </span>
                              </div>
                              <h4 style={{ fontSize: '0.95rem', color: '#fff', marginBottom: '0.2rem' }}>{op.cliente}</h4>
                              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.8rem' }}>{op.lineaNegocio} • Prob: {op.probabilidad}</p>
                              
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                                <span style={{ fontSize: '1.05rem', fontWeight: 'bold', color: '#fff' }}>${op.monto?.toLocaleString()}</span>
                                <span style={{ fontSize: '0.72rem', background: 'rgba(255,255,255,0.03)', padding: '2px 6px', borderRadius: '4px' }}>
                                  👤 {op.responsable}
                                </span>
                              </div>

                              <div style={{ 
                                borderTop: '1px solid var(--border-primary)', 
                                paddingTop: '0.6rem', 
                                fontSize: '0.74rem',
                                color: isOverdue ? 'var(--cam-red)' : 'var(--text-secondary)',
                                fontWeight: isOverdue ? 'bold' : 'normal',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}>
                                <span>📅 {op.proximaAccion}: {op.fechaAccion}</span>
                              </div>

                              {/* Pipeline quick shift buttons */}
                              <div 
                                style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', marginTop: '0.8rem', borderTop: '1px dashed var(--border-primary)', paddingTop: '0.6rem' }}
                                onClick={(e) => e.stopPropagation()} // Stop click propagation to edit modal
                              >
                                <button 
                                  onClick={() => handleMoveKanban(op.id, -1)}
                                  disabled={ETAPAS.indexOf(op.etapa) === 0}
                                  style={{ padding: '2px 8px', background: 'var(--bg-tertiary)', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer', opacity: ETAPAS.indexOf(op.etapa) === 0 ? 0.3 : 1 }}
                                >
                                  ←
                                </button>
                                <button 
                                  onClick={() => handleMoveKanban(op.id, 1)}
                                  disabled={ETAPAS.indexOf(op.etapa) === ETAPAS.length - 1}
                                  style={{ padding: '2px 8px', background: 'var(--bg-tertiary)', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer', opacity: ETAPAS.indexOf(op.etapa) === ETAPAS.length - 1 ? 0.3 : 1 }}
                                >
                                  →
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW 4: VISITAS COMERCIALES */}
        {/* ============================================================== */}
        {view === 'Visits' && (
          <Visitas
            opportunities={opportunities}
            triggerToast={triggerToast}
          />
        )}

        {/* ============================================================== */}
        {/* VIEW 5: AUDIT LOGS BITACORA */}
        {/* ============================================================== */}
        {view === 'Audit' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Fecha y Hora</th>
                    <th>Vendedor / Responsable</th>
                    <th>Acción</th>
                    <th>Registro Afectado</th>
                    <th>Detalles del Cambio</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover-row">
                      <td style={{ color: 'var(--cam-gray-mid)', whiteSpace: 'nowrap' }}>{log.timestamp}</td>
                      <td style={{ fontWeight: '600', color: '#fff' }}>{log.user}</td>
                      <td>
                        <span style={{ 
                          padding: '2px 8px', 
                          borderRadius: '4px', 
                          fontSize: '0.75rem', 
                          fontWeight: 'bold',
                          background: 
                            log.action === 'Creación' ? 'rgba(16, 185, 129, 0.12)' :
                            log.action === 'Eliminación' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                          color: 
                            log.action === 'Creación' ? '#34d399' :
                            log.action === 'Eliminación' ? '#f87171' : '#fbbf24'
                        }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'Courier New', fontWeight: 'bold' }}>{log.targetId}</td>
                      <td style={{ fontSize: '0.85rem' }}>{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={handleResetStorage} style={{ color: '#ef4444' }}>
                ⚠️ Restablecer Datos Locales
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW 5: DATAVERSE INTEGRATION VIEW */}
        {/* ============================================================== */}
        {view === 'Dataverse' && (
          <div className="animate-fade-in resp-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '2rem' }}>
            
            {/* Formulario de Configuración */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="glass" style={{ padding: '2rem', borderRadius: '16px' }}>
                <h3 style={{ color: '#fff', fontSize: '1.2rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  ⚙️ Ajustes de Microsoft Dataverse
                </h3>
                
                <form onSubmit={(e) => {
                  e.preventDefault();
                  saveSettings(dvSettings);
                  triggerToast('⚙️ Ajustes de Dataverse actualizados correctamente.');
                }} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                  
                  <div>
                    <label>Modo de Conexión</label>
                    <select 
                      value={dvSettings.mode} 
                      onChange={(e) => setDvSettings({ ...dvSettings, mode: e.target.value })}
                    >
                      <option value="live">Modo Conexión Real (API Dynamics 365) — Recomendado</option>
                      <option value="demo">Modo Demo / Simulación Local (los datos NO se comparten con otros usuarios)</option>
                    </select>
                  </div>

                  {dvSettings.mode === 'live' && (
                    <div className="animate-fade-in">
                      <label>Método de Autenticación</label>
                      <select 
                        value={dvSettings.authMethod || 'sso'} 
                        onChange={(e) => setDvSettings({ ...dvSettings, authMethod: e.target.value })}
                      >
                        <option value="sso">Autenticación Interactiva (SSO Microsoft - Recomendado)</option>
                        <option value="secret">Credenciales de Aplicación (Client Secret - Requiere CORS Proxy)</option>
                      </select>
                    </div>
                  )}

                  <div>
                    <label>URL de Entorno de Dataverse (Dynamics CRM)</label>
                    <input 
                      type="url" 
                      value={dvSettings.envUrl}
                      onChange={(e) => setDvSettings({ ...dvSettings, envUrl: e.target.value })}
                      placeholder="https://grupocam.crm4.dynamics.com"
                      required
                    />
                  </div>

                  <div>
                    <label>Tenant ID (Microsoft Entra Directory ID)</label>
                    <input 
                      type="text" 
                      value={dvSettings.tenantId}
                      onChange={(e) => setDvSettings({ ...dvSettings, tenantId: e.target.value })}
                      placeholder="Tenant GUID de Azure AD"
                      required
                    />
                  </div>

                  <div>
                    <label>Client ID (Application ID)</label>
                    <input 
                      type="text" 
                      value={dvSettings.clientId}
                      onChange={(e) => setDvSettings({ ...dvSettings, clientId: e.target.value })}
                      placeholder="Client GUID de Azure AD"
                      required
                    />
                  </div>

                  {dvSettings.mode === 'live' && dvSettings.authMethod === 'secret' && (
                    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                      <div>
                        <label>Client Secret (Secreto de la Aplicación)</label>
                        <input 
                          type="password" 
                          value={dvSettings.clientSecret}
                          onChange={(e) => setDvSettings({ ...dvSettings, clientSecret: e.target.value })}
                          placeholder="Client Secret String"
                          required
                        />
                      </div>
                      <div>
                        <label>CORS Proxy URL (Opcional - para bypass de CORS)</label>
                        <input 
                          type="url" 
                          value={dvSettings.corsProxy || ''}
                          onChange={(e) => setDvSettings({ ...dvSettings, corsProxy: e.target.value })}
                          placeholder="Ej: https://cors-anywhere.herokuapp.com/"
                        />
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                          Azure AD bloquea llamadas de client credentials directo desde el browser por seguridad.
                        </span>
                      </div>
                    </div>
                  )}

                  <div>
                    <label>Nombre de Tabla en Dataverse (OData Entity)</label>
                    <input 
                      type="text" 
                      value={dvSettings.entityName || 'cr57a_sales_opportunities'}
                      onChange={(e) => setDvSettings({ ...dvSettings, entityName: e.target.value })}
                      placeholder="Ej: cr57a_sales_opportunities"
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                    <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                      💾 Guardar Parámetros
                    </button>
                    <button type="button" className="btn-secondary" onClick={handleDataverseSyncAll}>
                      🔄 Sincronizar Ahora
                    </button>
                  </div>

                  {/* Migración local → Dataverse */}
                  {opportunities.length > 0 && (
                    <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: 10, border: '1px solid var(--cam-red)', background: 'rgba(192,57,43,0.08)' }}>
                      <p style={{ color: '#fff', fontSize: '0.88rem', fontWeight: 600, marginBottom: 4 }}>
                        📤 Migración de tratos locales
                      </p>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.8rem' }}>
                        {opportunities.length} tratos en localStorage. Envíalos a Dataverse para sincronización completa.
                      </p>
                      <button
                        type="button"
                        onClick={handleMigrateLocalToDataverse}
                        style={{ padding: '0.5rem 1.2rem', borderRadius: 8, background: 'var(--cam-red)', border: 'none', color: '#fff', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                      >
                        📤 Migrar {opportunities.length} tratos a Dataverse
                      </button>
                    </div>
                  )}
                </form>
              </div>

              {/* Conector Microsoft SSO Interactivo */}
              {dvSettings.mode === 'live' && dvSettings.authMethod === 'sso' && (
                <div className="glass animate-fade-in" style={{ padding: '2rem', borderRadius: '16px', borderLeft: '4px solid #00a4ef' }}>
                  <h4 style={{ color: '#fff', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    🔑 Estado de la Sesión Microsoft
                  </h4>
                  {activeMsalToken ? (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.2rem' }}>
                        <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }}></span>
                        <span style={{ fontSize: '0.9rem', color: '#10b981', fontWeight: 'bold' }}>
                          Conectado y Autorizado
                        </span>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.2rem' }}>
                        Tu cuenta tiene un token de seguridad activo para consultar Dataverse en tiempo real.
                      </p>
                      <button onClick={handleLogoutMicrosoft} className="btn-danger" style={{ width: '100%', justifyContent: 'center' }}>
                        Cerrar Sesión de Microsoft
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.2rem' }}>
                        <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }}></span>
                        <span style={{ fontSize: '0.9rem', color: '#ef4444', fontWeight: 'bold' }}>
                          Sesión Inactiva
                        </span>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.2rem' }}>
                        Debes iniciar sesión con tu cuenta corporativa para que el navegador pueda obtener el token de seguridad.
                      </p>
                      <button 
                        onClick={loginMicrosoft} 
                        className="btn-primary" 
                        style={{ 
                          width: '100%', 
                          justifyContent: 'center', 
                          background: '#00a4ef', 
                          borderColor: '#00a4ef',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.6rem'
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M0 0H11V11H0V0Z" fill="#F25022"/>
                          <path d="M12 0H23V11H12V0Z" fill="#7FBA00"/>
                          <path d="M0 12H11V23H0V12Z" fill="#00A4EF"/>
                          <path d="M12 12H23V23H12V12Z" fill="#FFB900"/>
                        </svg>
                        Iniciar Sesión con Microsoft
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Guía Desplegable de Azure AD */}
              <details className="glass" style={{ borderRadius: '12px', padding: '1rem', cursor: 'pointer' }}>
                <summary style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.88rem' }}>
                  ℹ️ ¿Cómo registrar la app en Azure AD (Entra ID)?
                </summary>
                <div style={{ marginTop: '0.8rem', fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.6rem', cursor: 'default' }} onClick={e => e.stopPropagation()}>
                  <p>Para conectar tu CRM comercial a Dataverse de Grupo CAM:</p>
                  <ol style={{ paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <li>Ve al portal de <strong>Microsoft Azure / Entra ID</strong> e ingresa a <strong>App registrations</strong>.</li>
                    <li>Registra una nueva aplicación con el nombre <code>CRM Grupo CAM</code>.</li>
                    <li>En <strong>Redirect URIs</strong>, selecciona la plataforma <strong>SPA (Single-page application)</strong> e ingresa <code>http://localhost:5173/</code>.</li>
                    <li>En <strong>API permissions</strong>, añade <strong>Dynamics CRM</strong> y marca <code>user_impersonation</code>.</li>
                    <li>Otorga el <strong>Grant admin consent</strong> de tu organización.</li>
                  </ol>
                </div>
              </details>
            </div>

            {/* Consola Técnica Telemetría en Vivo */}
            <div className="glass" style={{ padding: '2rem', borderRadius: '16px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
                <h3 style={{ color: '#fff', fontSize: '1.2rem' }}>Consola de Telemetría OData API</h3>
                <button 
                  onClick={() => {
                    setApiLogs([]);
                    sessionStorage.removeItem('dataverse_logs');
                    triggerToast('🧹 Consola de logs vaciada.');
                  }}
                  className="btn-secondary" 
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                >
                  Limpiar Consola
                </button>
              </div>

              <div className="terminal-console" style={{ flex: 1 }}>
                {apiLogs.length === 0 ? (
                  <div style={{ color: '#939598', fontStyle: 'italic', fontSize: '0.85rem' }}>
                    No se han registrado peticiones REST de Dataverse en esta sesión.<br/>
                    Prueba a editar una oportunidad o presiona "Sincronizar Ahora".
                  </div>
                ) : (
                  apiLogs.map((log) => (
                    <div key={log.id} className="terminal-line animate-fade-in">
                      <span className={`method ${log.method}`}>{log.method}</span>
                      <span style={{ color: '#ffffff' }}>{log.url}</span>
                      <span className={`status ${log.status.includes('200') || log.status.includes('201') || log.status.includes('204') ? 'success' : 'pending'}`}>
                        {log.status}
                      </span>
                      <div style={{ color: '#939598', fontSize: '0.75rem', marginTop: '0.3rem' }}>
                        Timestamp: {log.timestamp}
                      </div>
                      {log.requestBody && (
                        <details style={{ marginTop: '0.4rem', cursor: 'pointer' }}>
                          <summary style={{ color: '#60a5fa', fontSize: '0.74rem' }}>Ver JSON Payload Enviado</summary>
                          <pre style={{ background: '#131518', padding: '0.5rem', borderRadius: '4px', fontSize: '0.72rem', color: '#f87171', overflowX: 'auto', marginTop: '0.2rem' }}>
                            {log.requestBody}
                          </pre>
                        </details>
                      )}
                      {log.responseBody && (
                        <details style={{ marginTop: '0.2rem', cursor: 'pointer' }}>
                          <summary style={{ color: '#34d399', fontSize: '0.74rem' }}>Ver JSON Respuesta Recibida</summary>
                          <pre style={{ background: '#131518', padding: '0.5rem', borderRadius: '4px', fontSize: '0.72rem', color: '#10b981', overflowX: 'auto', marginTop: '0.2rem' }}>
                            {log.responseBody}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ============================================================== */}
      {/* OPPORTUNITY CAPTURE / EDIT MODAL FORM */}
      {/* ============================================================== */}
      {isModalOpen && (
        <div style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.85)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          zIndex: 3000,
          backdropFilter: 'blur(6px)'
        }}>
          <div className="glass animate-fade-in" style={{
            width: isMobile ? '94vw' : '750px',
            maxWidth: '94vw',
            maxHeight: '92vh',
            overflowY: 'auto',
            padding: isMobile ? '1.4rem' : '2.5rem',
            borderRadius: '16px',
            position: 'relative'
          }}>
            {/* CLOSE BUTTON */}
            <button 
              onClick={() => setIsModalOpen(false)} 
              style={{ position: 'absolute', top: '1.2rem', right: '1.5rem', background: 'none', border: 'none', color: '#fff', fontSize: '1.8rem', cursor: 'pointer' }}
            >
              ×
            </button>

            {/* TITLE */}
            <h2 style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-primary)', paddingBottom: '1rem', fontSize: '1.4rem', color: '#fff' }}>
              {currentOp.id ? `Editar Oportunidad: ${currentOp.codigo}` : 'Registrar Nueva Oportunidad Comercial'}
            </h2>

            {/* FORM */}
            <form onSubmit={handleSaveOpportunity} className="resp-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
              
              <div>
                <label>Código Oportunidad (Lectura)</label>
                <input 
                  type="text" 
                  value={currentOp.codigo} 
                  disabled 
                  style={{ opacity: 0.6 }}
                />
              </div>

              <div>
                <label>Cliente / Razón Social *</label>
                <input 
                  type="text" 
                  value={currentOp.cliente} 
                  onChange={(e) => setCurrentOp({ ...currentOp, cliente: e.target.value })}
                  placeholder="Ej. Inmobiliaria CAMPRO S.A."
                  required
                />
              </div>

              <div>
                <label>Contacto Principal (Nombre) *</label>
                <input 
                  type="text" 
                  value={currentOp.contactoName} 
                  onChange={(e) => setCurrentOp({ ...currentOp, contactoName: e.target.value })}
                  placeholder="Ej. Ing. Carlos Pérez"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                <div>
                  <label>Teléfono</label>
                  <input 
                    type="tel" 
                    value={currentOp.contactoPhone} 
                    onChange={(e) => setCurrentOp({ ...currentOp, contactoPhone: e.target.value })}
                    placeholder="Ej. +593 9..."
                  />
                </div>
                <div>
                  <label>Correo Electrónico</label>
                  <input 
                    type="email" 
                    value={currentOp.contactoEmail} 
                    onChange={(e) => setCurrentOp({ ...currentOp, contactoEmail: e.target.value })}
                    placeholder="mail@server.com"
                  />
                </div>
              </div>

              <div>
                <label>Tipo de Cliente</label>
                <select 
                  value={currentOp.tipoCliente} 
                  onChange={(e) => setCurrentOp({ ...currentOp, tipoCliente: e.target.value })}
                >
                  {TIPOS_CLIENTE.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label>Línea de Negocio</label>
                <select 
                  value={currentOp.lineaNegocio} 
                  onChange={(e) => setCurrentOp({ ...currentOp, lineaNegocio: e.target.value })}
                >
                  {LINEAS_NEGOCIO.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label>Proyecto / Requerimiento / Necesidad</label>
                <textarea 
                  value={currentOp.proyecto} 
                  onChange={(e) => setCurrentOp({ ...currentOp, proyecto: e.target.value })}
                  placeholder="Especificar alcance de obra o materiales solicitados..."
                  style={{ minHeight: '60px' }}
                />
              </div>

              <div>
                <label>Monto Estimado (USD) *</label>
                <input 
                  type="number" 
                  value={currentOp.monto} 
                  onChange={(e) => setCurrentOp({ ...currentOp, monto: e.target.value })}
                  placeholder="Ej. 12000"
                  required
                />
              </div>

              <div>
                  <label>Probabilidad de Cierre</label>
                  <select
                    value={currentOp.probabilidad}
                    onChange={(e) => setCurrentOp({ ...currentOp, probabilidad: e.target.value })}
                  >
                    {PROBABILIDADES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
              </div>

              <div>
                <label>Etapa Comercial</label>
                <select 
                  value={currentOp.etapa} 
                  onChange={(e) => setCurrentOp({ ...currentOp, etapa: e.target.value })}
                >
                  {ETAPAS.map(et => <option key={et} value={et}>{et}</option>)}
                </select>
              </div>

              <div>
                <label>Estado General</label>
                <select 
                  value={currentOp.estado} 
                  onChange={(e) => setCurrentOp({ ...currentOp, estado: e.target.value })}
                >
                  {ESTADOS.map(st => <option key={st} value={st}>{st}</option>)}
                </select>
              </div>

              {currentOp.estado === 'Perdida' && (
                <div style={{ gridColumn: 'span 2' }}>
                  <label>Motivo de Pérdida *</label>
                  <select 
                    value={currentOp.motivoPerdida} 
                    onChange={(e) => setCurrentOp({ ...currentOp, motivoPerdida: e.target.value })}
                    required
                  >
                    <option value="">Seleccionar motivo...</option>
                    {MOTIVOS_PERDIDA.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label>Próxima Acción</label>
                <select 
                  value={currentOp.proximaAccion} 
                  onChange={(e) => setCurrentOp({ ...currentOp, proximaAccion: e.target.value })}
                >
                  {PROXIMAS_ACCIONES.map(pa => <option key={pa} value={pa}>{pa}</option>)}
                </select>
              </div>

              <div>
                <label>Fecha de Próxima Acción *</label>
                <input 
                  type="date" 
                  value={currentOp.fechaAccion} 
                  onChange={(e) => setCurrentOp({ ...currentOp, fechaAccion: e.target.value })}
                  required
                />
              </div>

              {activeRole !== 'Vendedor' ? (
                <div>
                  <label>Responsable Comercial (Lookup)</label>
                  <select 
                    value={currentOp.responsable} 
                    onChange={(e) => setCurrentOp({ ...currentOp, responsable: e.target.value })}
                  >
                    {USUARIOS.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                  </select>
                </div>
              ) : (
                <div>
                  <label>Responsable Asignado</label>
                  <input type="text" value={currentOp.responsable} disabled style={{ opacity: 0.6 }} />
                </div>
              )}

              <div>
                <label>Fecha de Ingreso al Lead</label>
                <input 
                  type="date" 
                  value={currentOp.fechaIngreso} 
                  onChange={(e) => setCurrentOp({ ...currentOp, fechaIngreso: e.target.value })}
                />
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label>Notas de Seguimiento</label>
                <textarea 
                  value={currentOp.notas} 
                  onChange={(e) => setCurrentOp({ ...currentOp, notas: e.target.value })}
                  placeholder="Escribe comentarios de la última reunión o detalles adicionales de la obra..."
                  style={{ minHeight: '60px' }}
                />
              </div>

              {/* ACTION BUTTONS */}
              <div style={{ gridColumn: 'span 2', display: 'flex', gap: '1rem', borderTop: '1px solid var(--border-primary)', paddingTop: '1.5rem', marginTop: '1rem' }}>
                {currentOp.id && activeRole === 'Admin' && (
                  <button 
                    type="button" 
                    onClick={() => handleDeleteOpportunity(currentOp.id, currentOp.codigo)}
                    className="btn-danger" 
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    🗑️ Eliminar Registro
                  </button>
                )}
                
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="btn-secondary" 
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  Cancelar
                </button>
                
                <button 
                  type="submit" 
                  className="btn-primary" 
                  style={{ flex: 2, justifyContent: 'center' }}
                >
                  💾 {currentOp.id ? 'Guardar Cambios' : 'Registrar Oportunidad'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
