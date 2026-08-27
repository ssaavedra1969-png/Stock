import './globals.css';
import { AppProvider } from '@/context/AppContext';
import Sidebar from '@/components/Sidebar';
import ModalForm from '@/components/ModalForm';
import Toast from '@/components/Toast';
import Topbar from '@/components/Topbar';

export const metadata = {
  title: 'GRUPO FALPAT SRL — Control de Stock de Materiales',
  description:
    'Sistema de gestión de stock de materiales: entradas y salidas de remitos.',
  icons: { icon: '/favicon.svg' },
};

export const viewport = {
  themeColor: '#02040a',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="min-h-screen">
        <div className="industrial-grid" aria-hidden="true" />
        <div className="ambient-orb orb-1" aria-hidden="true" />
        <div className="ambient-orb orb-2" aria-hidden="true" />
        <div className="ambient-orb orb-3" aria-hidden="true" />
        <div className="noise-overlay" aria-hidden="true" />
        <AppProvider>
          <div className="relative z-10 flex min-h-screen">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
              <Topbar />
              <main className="flex-1 px-4 pb-28 pt-4 sm:px-6 lg:pb-12 lg:pt-6 lg:pr-10">
                {children}
              </main>
            </div>
          </div>
          <ModalForm />
          <Toast />
        </AppProvider>
      </body>
    </html>
  );
}
