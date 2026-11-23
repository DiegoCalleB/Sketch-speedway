import { create } from 'zustand';
import { GamePhase, Track, Player, CarType, CarStats, Point, AIArchetype, RaceResultItem, PlayerTelemetry } from '../types';
import { TRACKS } from '../utils/tracks';

export const CAR_STATS: Record<CarType, CarStats> = {
  speedster: {
    name: 'Rayo Veloz',
    color: '#f43f5e', // Rose/Red
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
  setupPlayers: (playersSetup: { name: string; carType: CarType; isAI: boolean; aiArchetype?: AIArchetype }[]) => void;
  setDrawnPath: (playerId: string, path: Point[]) => void;
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
  setTotalLaps: (totalLaps) => set({ totalLaps }),
  
  setupPlayers: (playersSetup) => {
    const aiPalette = ['#f59e0b', '#e11d48', '#a855f7', '#10b981'];
    const list: Player[] = playersSetup.map((p, idx) => {
      const baseColor = CAR_STATS[p.carType].color;
      const usedByFirst = idx > 0 && playersSetup[0].carType === p.carType;
      const distinctColor = p.isAI && usedByFirst ? aiPalette[idx % aiPalette.length] : baseColor;
      return {
        id: `p-${idx}-${Date.now()}`,
        name: p.name,
        color: distinctColor,
        carType: p.carType,
        drawnPath: [],
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

