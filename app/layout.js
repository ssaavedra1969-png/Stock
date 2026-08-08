import './globals.css';
import { AppProvider } from '@/context/AppContext';
import Sidebar from '@/components/Sidebar';
import ModalForm from '@/components/ModalForm';
import Toast from '@/components/Toast';

export const metadata = {
  title: 'GRUPO FALPAT SRL — Control de Stock de Materiales',
  description:
    'Sistema de gestión de stock de materiales: entradas y salidas de remitos.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="min-h-screen">
        <div className="industrial-grid" aria-hidden="true" />
        <AppProvider>
          <div className="relative z-10 flex min-h-screen">
            <Sidebar />
            <main className="flex-1 px-4 pb-28 pt-24 sm:px-6 lg:ml-64 lg:pb-12 lg:pt-8 lg:pr-10">
              {children}
            </main>
          </div>
          <ModalForm />
          <Toast />
        </AppProvider>
      </body>
    </html>
  );
}
