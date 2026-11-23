import { create } from 'zustand';
import { GamePhase, Track, Player, CarType, CarStats, Point, AIArchetype, RaceResultItem, PlayerTelemetry } from '../types';
import { TRACKS } from '../utils/tracks';

export interface CarLiveryOption {
  id: string;
  name: string;
  hex: string;
}

export const CAR_LIVERY_PALETTE: CarLiveryOption[] = [
  { id: 'electric-blue', name: 'Azul F1', hex: '#0ea5e9' },
  { id: 'scuderia-red', name: 'Rojo GP', hex: '#ef4444' },
  { id: 'gp-yellow', name: 'Amarillo', hex: '#facc15' },
  { id: 'neon-purple', name: 'Púrpura', hex: '#a855f7' },
  { id: 'papaya-orange', name: 'Papaya', hex: '#f97316' },
  { id: 'racing-green', name: 'Esmeralda', hex: '#10b981' }
];

export const pickDistinctLiveryColor = (
  preferredHex: string | undefined,
  usedColors: Set<string>
): string => {
  if (preferredHex && !usedColors.has(preferredHex.toLowerCase())) {
    return preferredHex;
  }
  const available = CAR_LIVERY_PALETTE.find((opt) => !usedColors.has(opt.hex.toLowerCase()));
  if (available) return available.hex;
  // Fallback deterministic distinct HSL hue if ever > 6 cars
  return CAR_LIVERY_PALETTE[usedColors.size % CAR_LIVERY_PALETTE.length].hex;
};

export const CAR_STATS: Record<CarType, CarStats> = {
  speedster: {
    name: 'Rayo Veloz',
    color: '#ef4444', // Scuderia Red
    maxSpeed: 8.6,
    acceleration: 0.16,
    grip: 0.045, // slides super easily!
    driftRecovery: 0.15,
    description: 'Máxima velocidad punta (360+ km/h). Brutal en las rectas, pero exige frenar a tiempo en curvas cerradas.'
  },
  drifter: {
    name: 'Derrape Pro',
    color: '#10b981', // Emerald Green
    maxSpeed: 7.4,
    acceleration: 0.25,
    grip: 0.115, // stable and recovers slides instantly
    driftRecovery: 0.75,
    description: 'El rey del paso por curva (315 km/h). Gran apoyo aerodinámico y tracción inmediata al salir de horquillas.'
  },
  balanced: {
    name: 'Grip F1',
    color: '#0ea5e9', // Electric F1 Racing Blue
    maxSpeed: 8.1,
    acceleration: 0.20,
    grip: 0.08,
    driftRecovery: 0.45,
    description: 'Monoplaza F1 equilibrado (345 km/h). Comportamiento predecible y rapidísimo tanto en rectas como en curvas.'
  }
};

interface GameState {
  phase: GamePhase;
  selectedTrack: Track;
  gameMode: 'solo' | 'ai' | 'multiplayer';
  totalLaps: number;
  players: Player[];
  activePlayerIndex: number;
  raceResults: RaceResultItem[] | null;
  telemetries: Record<string, PlayerTelemetry>;
  isReplaying: boolean;
  
  // Actions
  setPhase: (phase: GamePhase) => void;
  setSelectedTrack: (track: Track) => void;
  setGameMode: (mode: 'solo' | 'ai' | 'multiplayer') => void;
  setTotalLaps: (laps: number) => void;
  setupPlayers: (
    playersSetup: {
      name: string;
      carType: CarType;
      color?: string;
      isAI: boolean;
      aiArchetype?: AIArchetype;
    }[]
  ) => void;
  setDrawnPath: (playerId: string, path: Point[]) => void;
  addLapPath: (playerId: string, path: Point[]) => void;
  replaceLapPath: (playerId: string, lapIndex: number, path: Point[]) => void;
  removeLastLapPath: (playerId: string) => void;
  setPlayerLapPaths: (playerId: string, paths: Point[][]) => void;
  setActivePlayerIndex: (idx: number) => void;
  setRaceResults: (results: RaceResultItem[] | null) => void;
  setTelemetries: (telemetries: Record<string, PlayerTelemetry>) => void;
  startReplay: () => void;
  stopReplay: () => void;
  clearDrawnPaths: () => void;
  restartGame: () => void;
  goToMenu: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  phase: 'menu',
  selectedTrack: TRACKS[0],
  gameMode: 'ai',
  totalLaps: 3,
  players: [],
  activePlayerIndex: 0,
  raceResults: null,
  telemetries: {},
  isReplaying: false,

  setPhase: (phase) => set({ phase }),
  setSelectedTrack: (selectedTrack) => set({ selectedTrack }),
  setGameMode: (gameMode) => set({ gameMode }),
  setTotalLaps: (totalLaps) =>
    set((state) => {
      const clampedLaps = Math.max(1, totalLaps);
      const updatedPlayers = state.players.map((p) => {
        const trimmed = (p.lapPaths || []).slice(0, clampedLaps);
        return {
          ...p,
          lapPaths: trimmed,
          drawnPath: trimmed[0] || [],
          isReady: p.isAI || trimmed.length >= clampedLaps
        };
      });
      const firstIncompleteIdx = updatedPlayers.findIndex(
        (p) => !p.isAI && (p.lapPaths?.length || 0) < clampedLaps
      );
      return {
        totalLaps: clampedLaps,
        players: updatedPlayers,
        activePlayerIndex:
          firstIncompleteIdx !== -1 ? firstIncompleteIdx : state.activePlayerIndex
      };
    }),
  
  setupPlayers: (playersSetup) => {
    const usedColors = new Set<string>();
    const list: Player[] = playersSetup.map((p, idx) => {
      const preferred = p.color || (idx === 0 ? CAR_STATS[p.carType].color : undefined);
      const fallbackClassColor = CAR_STATS[p.carType].color;
      let chosenColor: string;

      if (preferred && !usedColors.has(preferred.toLowerCase())) {
        chosenColor = preferred;
      } else if (!usedColors.has(fallbackClassColor.toLowerCase())) {
        chosenColor = fallbackClassColor;
      } else {
        chosenColor = pickDistinctLiveryColor(undefined, usedColors);
      }

      usedColors.add(chosenColor.toLowerCase());

      return {
        id: `p-${idx}-${Date.now()}`,
        name: p.name,
        color: chosenColor,
        carType: p.carType,
        drawnPath: [],
        lapPaths: [],
        isAI: p.isAI,
        aiArchetype: p.aiArchetype || (idx % 2 === 0 ? 'apex_master' : 'aggressive'),
        isReady: p.isAI, // AI is always ready
        raceTime: 0,
        finished: false,
        currentLap: 1,
        disqualified: false
      };
    });

    set({
      players: list,
      activePlayerIndex: 0,
      phase: 'drawing',
      raceResults: null,
      telemetries: {},
      isReplaying: false
    });
  },

  setDrawnPath: (playerId, path) => {
    get().addLapPath(playerId, path);
  },

  addLapPath: (playerId, path) => {
    set((state) => {
      const requiredLaps = Math.max(1, state.totalLaps);
      const updatedPlayers = state.players.map((p) => {
        if (p.id === playerId) {
          const existing = p.lapPaths || [];
          const nextLaps =
            existing.length < requiredLaps
              ? [...existing, path]
              : [...existing.slice(0, requiredLaps - 1), path];
          return {
            ...p,
            lapPaths: nextLaps,
            drawnPath: nextLaps[0] || path,
            isReady: nextLaps.length >= requiredLaps
          };
        }
        return p;
      });

      const currentPlayer = updatedPlayers.find((p) => p.id === playerId);
      const currentDone = !currentPlayer || currentPlayer.isReady;

      if (!currentDone) {
        return { players: updatedPlayers };
      }

      // Advance to the next human player who hasn't completed all laps yet
      const nextIdx = updatedPlayers.findIndex(
        (p, idx) => idx > state.activePlayerIndex && !p.isAI && (p.lapPaths?.length || 0) < requiredLaps
      );
      const fallbackIdx =
        nextIdx !== -1
          ? nextIdx
          : updatedPlayers.findIndex((p) => !p.isAI && (p.lapPaths?.length || 0) < requiredLaps);

      if (fallbackIdx !== -1) {
        return {
          players: updatedPlayers,
          activePlayerIndex: fallbackIdx
        };
      }
      return { players: updatedPlayers };
    });
  },

  replaceLapPath: (playerId, lapIndex, path) => {
    set((state) => {
      const requiredLaps = Math.max(1, state.totalLaps);
      const updatedPlayers = state.players.map((p) => {
        if (p.id !== playerId) return p;
        const nextLaps = [...(p.lapPaths || [])];
        nextLaps[lapIndex] = path;
        return {
          ...p,
          lapPaths: nextLaps,
          drawnPath: nextLaps[0] || [],
          isReady: nextLaps.filter((lp) => lp && lp.length > 1).length >= requiredLaps
        };
      });
      return { players: updatedPlayers };
    });
  },

  removeLastLapPath: (playerId) => {
    set((state) => {
      const requiredLaps = Math.max(1, state.totalLaps);
      const targetIdx = state.players.findIndex((p) => p.id === playerId);
      const updatedPlayers = state.players.map((p) => {
        if (p.id !== playerId) return p;
        const nextLaps = (p.lapPaths || []).slice(0, -1);
        return {
          ...p,
          lapPaths: nextLaps,
          drawnPath: nextLaps[0] || [],
          isReady: p.isAI || nextLaps.length >= requiredLaps
        };
      });
      return {
        players: updatedPlayers,
        activePlayerIndex: targetIdx !== -1 ? targetIdx : state.activePlayerIndex
      };
    });
  },

  setPlayerLapPaths: (playerId, paths) => {
    set((state) => {
      const requiredLaps = Math.max(1, state.totalLaps);
      const updatedPlayers = state.players.map((p) => {
        if (p.id !== playerId) return p;
        return {
          ...p,
          lapPaths: paths,
          drawnPath: paths[0] || [],
          isReady: p.isAI || paths.length >= requiredLaps
        };
      });
      return { players: updatedPlayers };
    });
  },

  setActivePlayerIndex: (activePlayerIndex) => set({ activePlayerIndex }),
  setRaceResults: (raceResults) => set({ raceResults }),
  setTelemetries: (telemetries) => set({ telemetries }),

  startReplay: () => {
    set({
      isReplaying: true,
      phase: 'racing'
    });
  },

  stopReplay: () => {
    set({
      isReplaying: false,
      phase: 'results'
    });
  },

  goToMenu: () => {
    set({
      phase: 'menu',
      players: [],
      raceResults: null,
      telemetries: {},
      activePlayerIndex: 0,
      isReplaying: false
    });
  },

  clearDrawnPaths: () => {
    set((state) => ({
      players: state.players.map((p) => ({
        ...p,
        drawnPath: [],
        lapPaths: [],
        isReady: p.isAI,
        finished: false,
        raceTime: 0,
        disqualified: false
      })),
      raceResults: null,
      telemetries: {},
      activePlayerIndex: 0,
      isReplaying: false,
      phase: 'drawing'
    }));
  },

  restartGame: () => {
    const { phase } = get();
    if (phase === 'results') {
      // Re-setup with same players but clear drawings
      set((state) => ({
        players: state.players.map((p) => ({
          ...p,
          drawnPath: [],
          lapPaths: [],
          isReady: p.isAI,
          finished: false,
          raceTime: 0,
          disqualified: false
        })),
        raceResults: null,
        telemetries: {},
        activePlayerIndex: 0,
        isReplaying: false,
        phase: 'drawing'
      }));
    } else {
      // Return to main configuration menu
      set({
        players: [],
        raceResults: null,
        telemetries: {},
        activePlayerIndex: 0,
        isReplaying: false,
        phase: 'menu'
      });
    }
  }
}));

