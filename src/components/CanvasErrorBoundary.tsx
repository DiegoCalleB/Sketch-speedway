import React from 'react';
import { RotateCcw, AlertTriangle } from 'lucide-react';

interface State {
  hasError: boolean;
}

interface Props {
  children: React.ReactNode;
  onReset?: () => void;
}

export class CanvasErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('3D viewport recovery triggered:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 text-slate-100 p-6 text-center gap-3 z-40">
          <AlertTriangle className="w-10 h-10 text-amber-400" />
          <h3 className="font-bold text-base text-white">Reiniciando motor gráfico 3D</h3>
          <p className="text-xs text-slate-400 max-w-xs">
            El dispositivo reinició el contexto gráfico. Pulsa el botón para continuar la carrera.
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false });
              this.props.onReset?.();
            }}
            className="flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs px-4 py-2 rounded-xl cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reanudar 3D
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
