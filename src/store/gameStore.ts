import { create } from 'zustand';
import { GamePhase, Track, Player, CarType, CarStats, Point, AIArchetype, RaceResultItem, PlayerTelemetry } from '../types';
import { TRACKS } from '../utils/tracks';

export const CAR_STATS: Record<CarType, CarStats> = {
  speedster: {
    name: 'Rayo Veloz',
    color: '#f43f5e', // Rose/Red
    maxSpeed: 7.2,
    acceleration: 0.13,
    grip: 0.04, // slides super easily!
    driftRecovery: 0.15,
    description: 'Máxima velocidad punta. Brutal en las rectas, pero derrapa fácilmente en curvas cerradas si vas rápido.'
  },
  drifter: {
    name: 'Derrape Pro',
    color: '#10b981', // Emerald Green
    maxSpeed: 5.4,
    acceleration: 0.22,
    grip: 0.11, // stable but recovers slides instantly
    driftRecovery: 0.75,
    description: 'El rey de las horquillas. Recupera el control tras deslizar de inmediato y tiene gran aceleración.'
  },
  balanced: {
    name: 'Grip F1',
    color: '#f97316', // Neon Orange
    maxSpeed: 6.1,
    acceleration: 0.17,
    grip: 0.075,
    driftRecovery: 0.45,
    description: 'Comportamiento predecible. Muy veloz en todo tipo de situaciones, ideal tanto para novatos como veteranos.'
  }
};

interface GameState {
  phase: GamePhase;
  selectedTrack: Track;
  gameMode: 'solo' | 'ai' | 'multiplayer';
  players: Player[];
  activePlayerIndex: number;
  raceResults: RaceResultItem[] | null;
  telemetries: Record<string, PlayerTelemetry>;
  
  // Actions
  setPhase: (phase: GamePhase) => void;
  setSelectedTrack: (track: Track) => void;
  setGameMode: (mode: 'solo' | 'ai' | 'multiplayer') => void;
  setupPlayers: (playersSetup: { name: string; carType: CarType; isAI: boolean; aiArchetype?: AIArchetype }[]) => void;
  setDrawnPath: (playerId: string, path: Point[]) => void;
  setActivePlayerIndex: (idx: number) => void;
  setRaceResults: (results: RaceResultItem[] | null) => void;
  setTelemetries: (telemetries: Record<string, PlayerTelemetry>) => void;
  restartGame: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  phase: 'menu',
  selectedTrack: TRACKS[0],
  gameMode: 'ai',
  players: [],
  activePlayerIndex: 0,
  raceResults: null,
  telemetries: {},

  setPhase: (phase) => set({ phase }),
  setSelectedTrack: (selectedTrack) => set({ selectedTrack }),
  setGameMode: (gameMode) => set({ gameMode }),
  
  setupPlayers: (playersSetup) => {
    const list: Player[] = playersSetup.map((p, idx) => ({
      id: `p-${idx}-${Date.now()}`,
      name: p.name,
      color: CAR_STATS[p.carType].color,
      carType: p.carType,
      drawnPath: [],
      isAI: p.isAI,
      aiArchetype: p.aiArchetype || (idx % 2 === 0 ? 'apex_master' : 'aggressive'),
      isReady: p.isAI, // AI is always ready
      raceTime: 0,
      finished: false,
      currentLap: 1,
      disqualified: false
    }));

    set({
      players: list,
      activePlayerIndex: 0,
      phase: 'drawing',
      raceResults: null,
      telemetries: {}
    });
  },

  setDrawnPath: (playerId, path) => {
    set((state) => {
      const updatedPlayers = state.players.map((p) => {
        if (p.id === playerId) {
          return { ...p, drawnPath: path, isReady: true };
        }
        return p;
      });

      // Find the next human player who hasn't drawn yet
      const nextIdx = updatedPlayers.findIndex(
        (p, idx) => idx > state.activePlayerIndex && !p.isAI && p.drawnPath.length === 0
      );

      if (nextIdx !== -1) {
        return {
          players: updatedPlayers,
          activePlayerIndex: nextIdx
        };
      } else {
        return {
          players: updatedPlayers
        };
      }
    });
  },

  setActivePlayerIndex: (activePlayerIndex) => set({ activePlayerIndex }),
  setRaceResults: (raceResults) => set({ raceResults }),
  setTelemetries: (telemetries) => set({ telemetries }),

  restartGame: () => {
    const { phase } = get();
    if (phase === 'results') {
      // Re-setup with same players but clear drawings
      set((state) => ({
        players: state.players.map((p) => ({
          ...p,
          drawnPath: [],
          isReady: p.isAI,
          finished: false,
          raceTime: 0,
          disqualified: false
        })),
        raceResults: null,
        telemetries: {},
        activePlayerIndex: 0,
        phase: 'drawing'
      }));
    } else {
      // Return to main configuration menu
      set({
        players: [],
        raceResults: null,
        telemetries: {},
        activePlayerIndex: 0,
        phase: 'menu'
      });
    }
  }
}));

