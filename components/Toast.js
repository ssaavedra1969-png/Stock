'use client';

// ============================================================
// components/Toast.js
// Notificación transitoria (feedback al guardar/eliminar).
// ============================================================
import { useApp } from '@/context/AppContext';
import { IconAlert } from './Icons';

export default function Toast() {
  const { toast } = useApp();
  if (!toast) return null;

  const isError = toast.type === 'error';

  return (
    <div
      role="status"
      className={
        'fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2.5 rounded-xl border px-5 py-3 text-sm font-semibold shadow-xl backdrop-blur-xl animate-slide-up ' +
        (isError
          ? 'border-red-500/40 bg-red-950/80 text-red-200'
          : 'border-falpat/40 bg-night-900/85 text-falpat-soft')
      }
    >
      {isError && <IconAlert className="h-4 w-4 shrink-0" />}
      <span className="text-slate-100">{toast.message}</span>
    </div>
  );
}
