'use client';

// ============================================================
// context/AppContext.js
// Contexto global de la aplicacion.
//
// Los datos se guardan en el repo de GitHub (data/db.json) via las
// API Routes /api/db. Al iniciar se hace UNA sola lectura y todo se
// cachea en memoria: los dropdowns de autocompletado, la tabla, los
// filtros y las estadisticas se resuelven localmente sin nuevas
// lecturas. Se asume que el volumen de registros no superara los
// miles de documentos a corto plazo.
// ============================================================
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { fetchState, createRecord, removeRecord } from '@/lib/api';
import { toMillis } from '@/lib/utils';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [records, setRecords] = useState([]);
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { records: data, productos: prods } = await fetchState();

      // Ordenar por fecha de remito (mas reciente primero); empates por createdAt
      data.sort((a, b) => {
        const fa = toMillis(a.fechaRemito) || 0;
        const fb = toMillis(b.fechaRemito) || 0;
        if (fa !== fb) return fb - fa;
        const ca = a.createdAt ? toMillis(a.createdAt) || 0 : 0;
        const cb = b.createdAt ? toMillis(b.createdAt) || 0 : 0;
        return cb - ca;
      });

      setRecords(data);
      setProductos(prods);
    } catch (err) {
      console.error('Error leyendo datos:', err);
      setError(err.message || 'No se pudieron leer los datos.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Carga inicial.
  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const openModal = useCallback(() => setModalOpen(true), []);
  const closeModal = useCallback(() => setModalOpen(false), []);

  const addRecord = useCallback(
    async (data) => {
      const { record, productos: prods } = await createRecord(data);
      setRecords((prev) => [record, ...prev]);
      setProductos(prods);
      showToast('Registro guardado correctamente');
      return record;
    },
    [showToast]
  );

  const deleteRecord = useCallback(
    async (id) => {
      await removeRecord(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      showToast('Registro eliminado');
    },
    [showToast]
  );

  // Valores unicos para el autocompletado (extraidos de la cache local).
  const uniqueValues = useMemo(() => {
    const FIELDS = [
      'producto',
      'patente',
      'chofer',
      'pesoBalanza',
      'planta',
      'cliente',
      'nroRemitoFalpat',
    ];
    const sets = Object.fromEntries(FIELDS.map((f) => [f, new Set()]));
    for (const r of records) {
      for (const field of FIELDS) {
        const v = typeof r[field] === 'string' ? r[field].trim() : '';
        if (v) sets[field].add(v);
      }
    }
    // El catalogo de productos es fuente de verdad adicional.
    for (const p of productos) {
      if (p) sets.producto.add(p);
    }
    return Object.fromEntries(
      Object.entries(sets).map(([k, set]) => [
        k,
        [...set].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })),
      ])
    );
  }, [records, productos]);

  // Estadisticas globales del dashboard
  const stats = useMemo(() => {
    const total = records.length;
    const entradas = records.filter((r) => r.carga === 'Entrada').length;
    const salidas = total - entradas;
    return { total, entradas, salidas, ultimo: records[0] || null };
  }, [records]);

  const value = useMemo(
    () => ({
      records,
      productos,
      loading,
      error,
      reload: loadRecords,
      addRecord,
      deleteRecord,
      uniqueValues,
      stats,
      modalOpen,
      openModal,
      closeModal,
      toast,
      showToast,
    }),
    [
      records,
      productos,
      loading,
      error,
      loadRecords,
      addRecord,
      deleteRecord,
      uniqueValues,
      stats,
      modalOpen,
      openModal,
      closeModal,
      toast,
      showToast,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp debe usarse dentro de <AppProvider>.');
  }
  return ctx;
}

export { AppContext };
