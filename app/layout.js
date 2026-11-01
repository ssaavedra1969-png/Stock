import './globals.css';
import './app-theme.css';
import { AppProvider } from '@/context/AppContext';
import { ThemeProvider } from '@/context/ThemeContext';
import AppShell from '@/components/AppShell';
import ModalForm from '@/components/ModalForm';
import Toast from '@/components/Toast';

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
        <AppProvider>
          <ThemeProvider>
            <AppShell>{children}</AppShell>
            <ModalForm />
            <Toast />
          </ThemeProvider>
        </AppProvider>
      </body>
    </html>
  );
}