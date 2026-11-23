import React, { useState } from 'react';
import { Download, Share, Smartphone, WifiOff } from 'lucide-react';
import { usePWAInstall, useOnlineStatus } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState<'ios' | 'android' | null>(null);

  // Hide automatically when running as an installed app on Android or iPhone Home Screen
  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="flex items-center gap-1.5 px-3 py-2 sm:px-3.5 sm:py-1.5 min-h-[38px] rounded-lg bg-amber-400 hover:bg-amber-300 active:scale-95 text-slate-950 transition-all cursor-pointer shadow-md"
        title="Instalar Draw Race en tu dispositivo"
      >
        <Download className="w-4 h-4 shrink-0" />
        <span className="text-[11px] sm:text-xs font-mono font-extrabold whitespace-nowrap">INSTALAR APP</span>
      </button>
    );
  }

  if (isIOS || isAndroid) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowGuide(isIOS ? 'ios' : 'android')}
          className="flex items-center gap-1.5 px-3 py-2 sm:px-3 sm:py-1.5 min-h-[38px] rounded-lg border border-amber-400/40 bg-amber-400/10 hover:bg-amber-400/20 active:scale-95 text-amber-300 transition-all cursor-pointer"
          title="Añadir Draw Race a tu pantalla de inicio"
        >
          <Smartphone className="w-4 h-4 shrink-0" />
          <span className="text-[11px] sm:text-xs font-mono font-bold whitespace-nowrap">
            {isIOS ? 'AÑADIR A IPHONE' : 'INSTALAR APP'}
          </span>
        </button>

        {showGuide && (
          <div
            className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 pb-safe"
            onClick={() => setShowGuide(null)}
          >
            <div
              className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-5 shadow-2xl animate-fadeIn"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-amber-400 shrink-0" />
                {showGuide === 'ios'
                  ? 'Instalar Draw Race en iPhone / iPad'
                  : 'Instalar Draw Race en Android'}
              </h3>

              {showGuide === 'ios' ? (
                <ol className="mt-3 space-y-2.5 text-xs text-slate-300 leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-400/20 text-amber-300 font-mono font-bold flex items-center justify-center shrink-0">
                      1
                    </span>
                    <span>
                      Abre este enlace en <strong>Safari</strong> y pulsa el icono{' '}
                      <strong className="inline-flex items-center gap-1 text-white">
                        <Share className="w-3.5 h-3.5 text-cyan-400 inline" /> Compartir
                      </strong>{' '}
                      en la barra inferior.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-400/20 text-amber-300 font-mono font-bold flex items-center justify-center shrink-0">
                      2
                    </span>
                    <span>
                      Desliza hacia abajo y toca <strong>«Añadir a pantalla de inicio»</strong>.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-400/20 text-amber-300 font-mono font-bold flex items-center justify-center shrink-0">
                      3
                    </span>
                    <span>
                      ¡Listo! Se abrirá a pantalla completa sin barras de Safari y funcionará incluso sin conexión.
                    </span>
                  </li>
                </ol>
              ) : (
                <ol className="mt-3 space-y-2.5 text-xs text-slate-300 leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-400/20 text-amber-300 font-mono font-bold flex items-center justify-center shrink-0">
                      1
                    </span>
                    <span>
                      Pulsa el menú <strong>⋮ (3 puntos)</strong> en la esquina superior derecha de Chrome.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-400/20 text-amber-300 font-mono font-bold flex items-center justify-center shrink-0">
                      2
                    </span>
                    <span>
                      Toca <strong>«Instalar aplicación»</strong> o <strong>«Añadir a pantalla de inicio»</strong>.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-400/20 text-amber-300 font-mono font-bold flex items-center justify-center shrink-0">
                      3
                    </span>
                    <span>
                      Se instalará con icono nativo, vibración háptica y soporte offline.
                    </span>
                  </li>
                </ol>
              )}

              <button
                type="button"
                onClick={() => setShowGuide(null)}
                className="mt-4 w-full min-h-[44px] rounded-xl bg-amber-400 hover:bg-amber-300 active:scale-[0.98] py-2.5 text-xs font-extrabold text-slate-950 cursor-pointer transition-all"
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
    <div
      className="fixed left-3 z-[60] flex items-center gap-2 rounded-xl bg-slate-900/95 border border-amber-500/40 px-3 py-2 text-[11px] font-mono font-bold text-amber-300 shadow-xl"
      style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      <span>Modo Offline · Jugando sin conexión</span>
    </div>
  );
};
