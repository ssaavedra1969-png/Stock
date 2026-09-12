'use client';

// ============================================================
// components/AppShell.js
// Envuelve el layout del panel: Sidebar (izquierda, colapsable)
// + columna de contenido (Topbar + main). Mantiene el estado de
// colapso para ver la app en pantalla completa.
// ============================================================
import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';

export default function AppShell({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="relative z-10 flex min-h-screen">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
      />
      <div
        className={`flex min-w-0 flex-1 flex-col transition-[padding] duration-300 ${
          sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'
        }`}
      >
        <Topbar />
        <main className="flex-1 px-4 pb-28 pt-4 sm:px-6 lg:pb-12 lg:pt-6 lg:pr-10">
          {children}
        </main>
      </div>
    </div>
  );
}