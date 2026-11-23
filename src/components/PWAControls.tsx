import React, { useState } from 'react';
import { Download, Smartphone, WifiOff } from 'lucide-react';
import { usePWAInstall, useOnlineStatus } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // Hide automatically when running as an installed app or Play Store TWA
  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 transition-colors cursor-pointer shadow-md"
        title="Instalar Draw Race en tu dispositivo"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="text-[10px] sm:text-xs font-mono font-extrabold">INSTALAR APP</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg border border-amber-400/40 bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 transition-colors cursor-pointer"
          title="Añadir Draw Race a tu pantalla de inicio"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span className="text-[10px] sm:text-xs font-mono font-bold">INSTALAR</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-5 shadow-2xl">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-amber-400" />
                Instalar Draw Race en iPhone / iPad
              </h3>
              <p className="mt-2.5 text-xs text-slate-300 leading-relaxed">
                1. Pulsa el botón <strong>Compartir</strong> en la barra inferior de Safari.
                <br />
                2. Desliza hacia abajo y toca <strong>Añadir a pantalla de inicio</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-xl bg-amber-400 hover:bg-amber-300 py-2 text-xs font-extrabold text-slate-950 cursor-pointer transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-3 left-3 z-[60] flex items-center gap-2 rounded-xl bg-slate-900/95 border border-amber-500/40 px-3 py-1.5 text-[11px] font-mono font-bold text-amber-300 shadow-xl">
      <WifiOff className="w-3.5 h-3.5 text-amber-400" />
      <span>Modo Offline · Jugando sin conexión</span>
    </div>
  );
};
