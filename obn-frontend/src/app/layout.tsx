// src/app/layout.tsx
import './globals.css';
import { Providers } from './providers';

export const metadata = {
  title: 'Olive Branch Network',
  description: 'Staking dApp',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="earthtone">
      <body className="bg-base-100 text-base-content min-h-screen flex flex-col">
        <Providers>
          {/* Main content grows to fill available space */}
          <div className="flex-1">{children}</div>

          {/* 🌱 Global footer — now static, not fixed */}
          <footer className="bg-white text-black p-4 flex items-center justify-center gap-2 text-sm shadow-inner">
            <span className="text-xl">🌱</span>
            <span className="font-medium">Olive Branch Network</span>
          </footer>
        </Providers>
      </body>
    </html>
  );
}