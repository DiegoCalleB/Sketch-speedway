import React, { useState, useCallback } from 'react';
import { GamePhase, Track, Player, CarType, CarStats, AIArchetype, RaceResultItem } from '../types';
import { motion } from 'motion/react';
import { Trophy, Users, Cpu, Sliders, Volume2, VolumeX, Play, RotateCcw, HelpCircle, Check, Flag, Car, Zap, Sparkles, Activity, Video, Globe, Swords, Copy, Wifi } from 'lucide-react';
import { audio } from '../utils/audio';
import { TelemetryLab } from './TelemetryLab';
import { useGameStore, CAR_LIVERY_PALETTE } from '../store/gameStore';
import { PWAInstallButton } from './PWAControls';
import { OnlineHubModal } from './OnlineHubModal';
import {
  LeaderboardEntry,
  OnlineRoomState,
  getRegionByCode,
  onlineClient,
  submitLeaderboardRecord
} from '../utils/onlineMultiplayer';
import { computeTelemetryEvaluation, getPerfectLapGuide } from '../utils/tracks';

interface GameUIProps {
  phase: GamePhase;
  tracks: Track[];
  selectedTrack: Track;
  players: Player[];
  carStats: Record<CarType, CarStats>;
  activePlayerIndex: number;
  gameMode: 'solo' | 'ai' | 'multiplayer';
  onSelectTrack: (track: Track) => void;
  onSetGameMode: (mode: 'solo' | 'ai' | 'multiplayer') => void;
  onSetupPlayers: (
    playersSetup: {
      name: string;
      carType: CarType;
      color?: string;
      isAI: boolean;
      aiArchetype?: AIArchetype;
    }[]
  ) => void;
  onStartDrawing: () => void;
  onStartRace: () => void;
  raceResults: RaceResultItem[] | null;
  onRestart: () => void;
}

export const GameUI: React.FC<GameUIProps> = ({
  phase,
  tracks,
  selectedTrack,
  players,
  carStats,
  activePlayerIndex,
  gameMode,
  onSelectTrack,
  onSetGameMode,
  onSetupPlayers,
  onStartDrawing,
  onStartRace,
  raceResults,
  onRestart,
}) => {
  const totalLaps = useGameStore((s) => s.totalLaps);
  const setTotalLaps = useGameStore((s) => s.setTotalLaps);
  const lightingPreset = useGameStore((s) => s.lightingPreset);
  const setLightingPreset = useGameStore((s) => s.setLightingPreset);
  const weather = useGameStore((s) => s.weather);
  const setWeather = useGameStore((s) => s.setWeather);
  const [isMuted, setIsMuted] = useState(audio.getMuted());
  const [selectedAiArchetype, setSelectedAiArchetype] = useState<AIArchetype>('apex_master');
  const [resultsTab, setResultsTab] = useState<'podium' | 'telemetry'>('podium');

  // Online Hub Modal & Regional Profile State
  const [onlineHubOpen, setOnlineHubOpen] = useState(false);
  const [onlineHubTab, setOnlineHubTab] = useState<'leaderboard' | 'multiplayer'>('leaderboard');
  const [playerRegion, setPlayerRegion] = useState<string>(() => {
    try {
      return localStorage.getItem('drawrace_f1_region_v1') || 'ES-MD';
    } catch {
      return 'ES-MD';
    }
  });
  const [activeChallengeEntry, setActiveChallengeEntry] = useState<LeaderboardEntry | null>(null);
  const [publishedEntry, setPublishedEntry] = useState<LeaderboardEntry | null>(null);
  const [copiedChallenge, setCopiedChallenge] = useState(false);
  const [activeOnlineRoom, setActiveOnlineRoom] = useState<OnlineRoomState | null>(null);

  // Official Track Records (best single lap time in ms per trackId, persisted in localStorage)
  const [trackRecords, setTrackRecords] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('drawrace_f1_records_v1');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [newRecordPlayerId, setNewRecordPlayerId] = useState<string | null>(null);

  // Local state for player registration form (each slot has a guaranteed unique high-contrast livery color!)
  const [playersForm, setPlayersForm] = useState<{
    [key: number]: { name: string; carType: CarType; color: string };
  }>(() => {
    let savedName = 'Piloto F1';
    try {
      savedName = localStorage.getItem('drawrace_f1_pilot_name_v1') || 'Piloto F1';
    } catch {
      // ignore
    }
    return {
      0: { name: savedName, carType: 'balanced', color: CAR_LIVERY_PALETTE[0].hex },
      1: { name: 'Jugador 2', carType: 'drifter', color: CAR_LIVERY_PALETTE[1].hex },
      2: { name: 'Jugador 3', carType: 'speedster', color: CAR_LIVERY_PALETTE[2].hex },
      3: { name: 'Jugador 4', carType: 'balanced', color: CAR_LIVERY_PALETTE[3].hex }
    };
  });
  const [aiColor, setAiColor] = useState<string>(CAR_LIVERY_PALETTE[1].hex);

  const [numPlayers, setNumPlayers] = useState(2); // for multiplayer local

  React.useEffect(() => {
    if (phase === 'results' && raceResults && raceResults.length > 0) {
      const validHumanResults = raceResults.filter((r) => {
        const pl = players.find((p) => p.id === r.playerId);
        const lapMetric = r.bestLap || r.time;
        return (
          pl &&
          !pl.isAI &&
          !pl.id.startsWith('ghost-rival') &&
          !pl.id.startsWith('remote-') &&
          r.finished &&
          !r.disqualified &&
          lapMetric > 1000 &&
          lapMetric < 900000
        );
      });
      if (validHumanResults.length > 0) {
        const bestHuman = validHumanResults.reduce((best, curr) =>
          (curr.bestLap || curr.time) < (best.bestLap || best.time) ? curr : best
        );
        const bestHumanLap = bestHuman.bestLap || bestHuman.time;
        const prevBest = trackRecords[selectedTrack.id];
        if (!prevBest || bestHumanLap < prevBest) {
          const updated = { ...trackRecords, [selectedTrack.id]: bestHumanLap };
          setTrackRecords(updated);
          setNewRecordPlayerId(bestHuman.playerId);
          try {
            localStorage.setItem('drawrace_f1_records_v1', JSON.stringify(updated));
          } catch {
            // ignore storage errors
          }
        } else {
          setNewRecordPlayerId(null);
        }

        // Automatically publish best human lap & ghost trajectory to Global & Regional Ranking!
        const humanPlayer = players.find((p) => p.id === bestHuman.playerId);
        if (humanPlayer) {
          const evalMetrics = computeTelemetryEvaluation(humanPlayer.drawnPath, selectedTrack);
          const regInfo = getRegionByCode(playerRegion);
          submitLeaderboardRecord({
            trackId: selectedTrack.id,
            driverName: humanPlayer.name,
            regionCode: regInfo.code,
            regionName: regInfo.name,
            carType: humanPlayer.carType,
            carColor: humanPlayer.color,
            lapTimeMs: Math.round(bestHumanLap),
            apexScore: evalMetrics.apexScore,
            smoothnessScore: evalMetrics.smoothnessScore,
            topSpeedKmh: Math.min(368, Math.round(evalMetrics.maxSpeed * 46)),
            weather,
            ghostPath: humanPlayer.drawnPath
          }).then((saved) => {
            if (saved) setPublishedEntry(saved);
          });
        }
      }
    } else if (phase !== 'results') {
      setNewRecordPlayerId(null);
      setPublishedEntry(null);
    }
  }, [phase, raceResults, selectedTrack.id]);

  // Subscribe to online room updates when playing in a Cross-Device Online Multiplayer Room
  const handleOnlineRoomDrawingStart = useCallback(
    (room: OnlineRoomState, localClientId: string) => {
      const targetTrack = tracks.find((t) => t.id === room.trackId) || selectedTrack;
      onSelectTrack(targetTrack);
      setTotalLaps(room.totalLaps);
      setLightingPreset(room.lightingPreset);
      setWeather(room.weather);
      setActiveOnlineRoom(room);
      setActiveChallengeEntry(null);
      setOnlineHubOpen(false);

      const me = room.players.find((p) => p.id === localClientId) || room.players[0];
      useGameStore.setState({
        selectedTrack: targetTrack,
        totalLaps: room.totalLaps,
        lightingPreset: room.lightingPreset,
        weather: room.weather,
        players: [
          {
            id: `local-${localClientId}`,
            name: me ? me.name : playersForm[0].name || 'Piloto Online',
            color: me ? me.color : playersForm[0].color,
            carType: me ? me.carType : playersForm[0].carType,
            drawnPath: [],
            lapPaths: [],
            isAI: false,
            isReady: false,
            raceTime: 0,
            finished: false,
            currentLap: 1,
            disqualified: false
          }
        ],
        activePlayerIndex: 0,
        phase: 'drawing',
        raceResults: null,
        telemetries: {},
        isReplaying: false
      });
    },
    [tracks, selectedTrack, onSelectTrack, setTotalLaps, setLightingPreset, setWeather, playersForm]
  );

  const handleOnlineRoomRaceStart = useCallback(
    (room: OnlineRoomState, localClientId: string) => {
      const targetTrack = tracks.find((t) => t.id === room.trackId) || selectedTrack;
      setActiveOnlineRoom(room);
      setOnlineHubOpen(false);

      const racePlayers: Player[] = room.players.map((rp) => {
        const isMe = rp.id === localClientId;
        const path =
          rp.drawnPath && rp.drawnPath.length > 2
            ? rp.drawnPath
            : getPerfectLapGuide(targetTrack, carStats[rp.carType].grip, 0).perfectPath;
        const lapPaths = Array.from({ length: Math.max(1, room.totalLaps) }, () => path);
        return {
          id: isMe ? `local-${rp.id}` : `remote-${rp.id}`,
          name: rp.name,
          color: rp.color,
          carType: rp.carType,
          drawnPath: path,
          lapPaths,
          isAI: false,
          isReady: true,
          raceTime: 0,
          finished: false,
          currentLap: 1,
          disqualified: false
        };
      });

      // If only 1 human in the online room, add an AI challenger so it's still an exciting duel
      if (racePlayers.length === 1) {
        racePlayers.push({
          id: `ai-online-duel`,
          name: 'Apex Master IA',
          color: '#10b981',
          carType: 'balanced',
          drawnPath: [],
          lapPaths: [],
          isAI: true,
          aiArchetype: 'apex_master',
          isReady: true,
          raceTime: 0,
          finished: false,
          currentLap: 1,
          disqualified: false
        });
      }

      useGameStore.setState({
        selectedTrack: targetTrack,
        totalLaps: room.totalLaps,
        players: racePlayers,
        activePlayerIndex: 0,
        phase: 'racing',
        raceResults: null
      });
    },
    [tracks, selectedTrack, carStats]
  );

  // Keep activeOnlineRoom synced during drawing phase and automatically submit local path when ready
  React.useEffect(() => {
    const unsub = onlineClient.subscribe((evt) => {
      if (evt.type === 'room:state') {
        const nextRoom = evt.room || null;
        setActiveOnlineRoom(nextRoom);
        if (nextRoom && nextRoom.status === 'racing' && phase === 'drawing') {
          handleOnlineRoomRaceStart(nextRoom, onlineClient.clientId);
        }
      }
    });
    return unsub;
  }, [phase, handleOnlineRoomRaceStart]);

  const localOnlinePlayer =
    activeOnlineRoom && players.length > 0 ? players[0] : null;
  React.useEffect(() => {
    if (
      activeOnlineRoom &&
      activeOnlineRoom.status === 'drawing' &&
      localOnlinePlayer &&
      localOnlinePlayer.isReady &&
      localOnlinePlayer.drawnPath.length > 4
    ) {
      const myRoomEntry = activeOnlineRoom.players.find((p) => p.id === onlineClient.clientId);
      if (myRoomEntry && !myRoomEntry.pathSubmitted) {
        onlineClient.submitOnlinePath(localOnlinePlayer.drawnPath);
      }
    }
  }, [activeOnlineRoom, localOnlinePlayer?.isReady, localOnlinePlayer?.drawnPath]);

  // Start a Direct Ghost Challenge against any World/Regional Leaderboard entry
  const handleStartGhostChallenge = useCallback(
    (entry: LeaderboardEntry, targetTrack: Track) => {
      onSelectTrack(targetTrack);
      setActiveChallengeEntry(entry);
      setActiveOnlineRoom(null);
      setOnlineHubOpen(false);

      const humanColor = playersForm[0].color;
      const ghostColor =
        entry.carColor.toLowerCase() === humanColor.toLowerCase() ? '#f43f5e' : entry.carColor;

      const ghostTrajectory =
        entry.ghostPath && entry.ghostPath.length > 5
          ? entry.ghostPath
          : getPerfectLapGuide(targetTrack, carStats[entry.carType]?.grip || 0.08, 1).perfectPath;

      const requiredLaps = Math.max(1, totalLaps);
      const ghostLapPaths = Array.from({ length: requiredLaps }, () => ghostTrajectory);

      const challengePlayers: Player[] = [
        {
          id: `p-0-${Date.now()}`,
          name: playersForm[0].name || 'Piloto 1',
          color: humanColor,
          carType: playersForm[0].carType,
          drawnPath: [],
          lapPaths: [],
          isAI: false,
          isReady: false,
          raceTime: 0,
          finished: false,
          currentLap: 1,
          disqualified: false
        },
        {
          id: `ghost-rival-${entry.id}`,
          name: `🔥 ${entry.driverName} (${(entry.lapTimeMs / 1000).toFixed(2)}s)`,
          color: ghostColor,
          carType: entry.carType,
          drawnPath: ghostTrajectory,
          lapPaths: ghostLapPaths,
          isAI: false,
          isReady: true,
          raceTime: 0,
          finished: false,
          currentLap: 1,
          disqualified: false
        }
      ];

      useGameStore.setState({
        selectedTrack: targetTrack,
        players: challengePlayers,
        activePlayerIndex: 0,
        phase: 'drawing',
        raceResults: null,
        telemetries: {},
        isReplaying: false
      });
    },
    [onSelectTrack, playersForm, carStats, totalLaps]
  );

  const resolvedAiColor =
    aiColor.toLowerCase() === playersForm[0].color.toLowerCase()
      ? CAR_LIVERY_PALETTE.find(
          (c) => c.hex.toLowerCase() !== playersForm[0].color.toLowerCase()
        )?.hex || CAR_LIVERY_PALETTE[1].hex
      : aiColor;

  const handleMuteToggle = () => {
    const nextMute = audio.toggleMute();
    setIsMuted(nextMute);
  };

  const handleFormChange = (idx: number, field: 'name' | 'carType', value: string) => {
    if (idx === 0 && field === 'name') {
      try {
        localStorage.setItem('drawrace_f1_pilot_name_v1', value);
      } catch {
        // ignore
      }
    }
    setPlayersForm((prev) => ({
      ...prev,
      [idx]: {
        ...prev[idx],
        [field]: value
      }
    }));
  };

  const handlePlayerColorChange = (idx: number, newHex: string) => {
    setPlayersForm((prev) => {
      const oldHex = prev[idx].color;
      if (oldHex.toLowerCase() === newHex.toLowerCase()) return prev;
      const next = { ...prev };
      // If another pilot currently owns this color, swap cleanly so every car stays 100% unique
      Object.keys(next).forEach((k) => {
        const otherIdx = Number(k);
        if (otherIdx !== idx && next[otherIdx].color.toLowerCase() === newHex.toLowerCase()) {
          next[otherIdx] = { ...next[otherIdx], color: oldHex };
        }
      });
      next[idx] = { ...next[idx], color: newHex };
      return next;
    });

    if (idx === 0 && aiColor.toLowerCase() === newHex.toLowerCase()) {
      const fallbackAi =
        CAR_LIVERY_PALETTE.find((c) => c.hex.toLowerCase() !== newHex.toLowerCase())?.hex ||
        CAR_LIVERY_PALETTE[1].hex;
      setAiColor(fallbackAi);
    }
    audio.playBeep(520, 0.05, 'sine');
  };

  const handleStartSetup = () => {
    setActiveChallengeEntry(null);
    setActiveOnlineRoom(null);
    const list: {
      name: string;
      carType: CarType;
      color?: string;
      isAI: boolean;
      aiArchetype?: AIArchetype;
    }[] = [];

    if (gameMode === 'solo') {
      list.push({
        name: playersForm[0].name || 'Piloto Solo',
        carType: playersForm[0].carType,
        color: playersForm[0].color,
        isAI: false
      });
    } else if (gameMode === 'ai') {
      list.push({
        name: playersForm[0].name || 'Jugador',
        carType: playersForm[0].carType,
        color: playersForm[0].color,
        isAI: false
      });
      list.push({
        name:
          selectedAiArchetype === 'apex_master'
            ? 'Apex Master IA'
            : selectedAiArchetype === 'aggressive'
              ? 'Predator IA'
              : 'Guardian IA',
        carType: 'balanced',
        color: resolvedAiColor,
        isAI: true,
        aiArchetype: selectedAiArchetype
      });
    } else {
      for (let i = 0; i < numPlayers; i++) {
        list.push({
          name: playersForm[i].name || `Jugador ${i + 1}`,
          carType: playersForm[i].carType,
          color: playersForm[i].color,
          isAI: false
        });
      }
    }

    onSetupPlayers(list);
    audio.playBeep(440, 0.1, 'sine');
  };

  return (
    <div className="w-full flex flex-col gap-2 sm:gap-3" id="game-dashboard-ui">
      {/* ONLINE RANKING, GHOST CHALLENGES & MULTIPLAYER ROOMS MODAL */}
      <OnlineHubModal
        isOpen={onlineHubOpen}
        initialTab={onlineHubTab}
        tracks={tracks}
        selectedTrack={selectedTrack}
        playerName={playersForm[0].name}
        playerRegion={playerRegion}
        playerCarType={playersForm[0].carType}
        playerColor={playersForm[0].color}
        totalLaps={totalLaps}
        lightingPreset={lightingPreset}
        weather={weather}
        onUpdateProfile={({ name, regionCode, carType, color }) => {
          handleFormChange(0, 'name', name);
          handleFormChange(0, 'carType', carType);
          handlePlayerColorChange(0, color);
          setPlayerRegion(regionCode);
          try {
            localStorage.setItem('drawrace_f1_region_v1', regionCode);
          } catch {
            // ignore
          }
        }}
        onClose={() => setOnlineHubOpen(false)}
        onStartGhostChallenge={handleStartGhostChallenge}
        onOnlineRoomDrawingStart={handleOnlineRoomDrawingStart}
        onOnlineRoomRaceStart={handleOnlineRoomRaceStart}
      />

      {/* COMPACT HEADER / NAV PANEL */}
      <div className="flex flex-wrap items-center justify-between bg-slate-900 border border-slate-800 rounded-xl shadow-md px-3 py-2 sm:px-4 sm:py-2.5 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-gradient-to-br from-amber-400 to-rose-500 rounded-lg text-slate-950 shrink-0">
            <Flag className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="font-sans font-extrabold text-sm sm:text-lg tracking-tight text-white flex items-center gap-2 truncate">
              <span>DRAW RACE</span>
              <span className="text-slate-400 text-xs font-normal hidden md:inline">
                · Campeonato F1 3D
              </span>
            </h1>
          </div>
        </div>

        {/* Ranking Mundial/Regional, Salas Online, Audio & Quick Play controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            onClick={() => {
              setOnlineHubTab('leaderboard');
              setOnlineHubOpen(true);
              audio.playBeep(520, 0.06, 'sine');
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 min-h-[38px] rounded-lg bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/50 text-amber-300 font-extrabold text-xs transition-all cursor-pointer whitespace-nowrap"
            title="Clasificación Mundial y Regional y Retos Fantasma"
          >
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>Ranking & Retos</span>
          </button>

          <button
            onClick={() => {
              setOnlineHubTab('multiplayer');
              setOnlineHubOpen(true);
              audio.playBeep(560, 0.06, 'sine');
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 min-h-[38px] rounded-lg bg-cyan-400/15 hover:bg-cyan-400/25 border border-cyan-400/50 text-cyan-300 font-extrabold text-xs transition-all cursor-pointer whitespace-nowrap"
            title="Jugar Online con amigos desde distintos dispositivos"
          >
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span>Salas Online</span>
          </button>

          {phase === 'menu' && (
            <button
              onClick={handleStartSetup}
              className="flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] rounded-lg bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-extrabold text-xs shadow-md transition-all cursor-pointer whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5 fill-slate-950" />
              <span>¡JUGAR YA!</span>
            </button>
          )}
          <PWAInstallButton />
          <button
            onClick={handleMuteToggle}
            className="flex items-center gap-1.5 px-2.5 py-1.5 min-h-[38px] rounded-lg border border-slate-800 hover:bg-slate-800 active:scale-95 text-slate-300 transition-all cursor-pointer"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            <span className="text-[11px] font-mono font-bold hidden sm:inline">{isMuted ? 'MUTE' : 'SONIDO'}</span>
          </button>
        </div>
      </div>

      {/* PHASE 1: COMPACT ZERO-SCROLL MENU (TRACK, MODE & LAPS IN ONE VIEWPORT) */}
      {phase === 'menu' && (
        <div className="flex flex-col gap-2.5 sm:gap-3 animate-fadeIn">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 sm:gap-3">
            {/* 1. COMPACT TRACK SELECTOR */}
            <div className="lg:col-span-7 flex flex-col gap-2 bg-slate-900 border border-slate-800 p-3 sm:p-4 rounded-xl shadow-md">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <h3 className="font-sans font-bold text-white text-xs sm:text-sm flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-amber-400" />
                  1. Selecciona el Circuito
                </h3>
                <span className="text-[11px] text-slate-400 font-mono">
                  {selectedTrack.difficulty}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {tracks.map((tk) => {
                  const isSelected = tk.id === selectedTrack.id;
                  const diffText =
                    tk.difficulty === 'Fácil'
                      ? 'text-emerald-400'
                      : tk.difficulty === 'Medio'
                        ? 'text-amber-400'
                        : 'text-rose-400';
                  const centerlinePts = tk.outerBoundary
                    .filter((_, i) => i % 2 === 0)
                    .map((oPt, idx) => {
                      const iPt = tk.innerBoundary[idx * 2] || oPt;
                      return `${((oPt.x + iPt.x) * 0.5).toFixed(0)},${((oPt.y + iPt.y) * 0.5).toFixed(0)}`;
                    })
                    .join(' ');
                  const isRealGp =
                    tk.id === 'jarama' || tk.id === 'madring' || tk.id === 'monaco';

                  return (
                    <button
                      key={tk.id}
                      onClick={() => {
                        onSelectTrack(tk);
                        audio.playBeep(330, 0.08, 'sine');
                      }}
                      className={`flex items-center justify-between gap-2 text-left px-2.5 py-2 rounded-xl border transition-all duration-150 cursor-pointer min-h-[54px] ${
                        isSelected
                          ? 'bg-slate-800/95 border-amber-400 shadow-sm'
                          : 'bg-slate-950/55 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
                      }`}
                    >
                      {/* Mini SVG Track Silhouette Preview */}
                      <div
                        className={`w-12 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                          isSelected
                            ? 'bg-slate-950 border-amber-400/50'
                            : 'bg-slate-900/90 border-slate-800'
                        }`}
                      >
                        <svg viewBox="40 20 720 460" className="w-10 h-6 overflow-visible">
                          <polygon
                            points={centerlinePts}
                            fill="none"
                            stroke="#0f172a"
                            strokeWidth="34"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                          />
                          <polygon
                            points={centerlinePts}
                            fill="none"
                            stroke={isSelected ? '#fbbf24' : isRealGp ? '#38bdf8' : '#94a3b8'}
                            strokeWidth="18"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                          />
                          <line
                            x1={tk.startLine.p1.x}
                            y1={tk.startLine.p1.y}
                            x2={tk.startLine.p2.x}
                            y2={tk.startLine.p2.y}
                            stroke="#ef4444"
                            strokeWidth="22"
                            strokeLinecap="round"
                          />
                        </svg>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-white text-xs font-sans truncate">
                            {tk.name}
                          </span>
                          <span className={`text-[10px] font-bold font-mono ${diffText}`}>
                            {tk.difficulty}
                          </span>
                          {trackRecords[tk.id] && (
                            <span className="text-[10px] font-mono font-bold text-cyan-400 tabular-nums">
                              · {(trackRecords[tk.id] / 1000).toFixed(2)}s
                            </span>
                          )}
                        </div>
                        <p className="text-slate-400 text-[10px] truncate mt-0.5">
                          {tk.description}
                        </p>
                      </div>
                      <div
                        className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 border ${
                          isSelected
                            ? 'bg-amber-400 border-amber-300 text-slate-950'
                            : 'border-slate-700 text-transparent'
                        }`}
                      >
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. COMPACT GAME MODE & LAP COUNT SELECTOR */}
            <div className="lg:col-span-5 flex flex-col justify-between gap-2.5 bg-slate-900 border border-slate-800 p-3 sm:p-4 rounded-xl shadow-md">
              <div className="flex flex-col gap-2">
                <h3 className="font-sans font-bold text-white text-xs sm:text-sm flex items-center gap-1.5 border-b border-slate-800 pb-1.5">
                  <Users className="w-4 h-4 text-amber-400" />
                  2. Modo de Juego
                </h3>

                {/* 4-Column Compact Mode Selector Grid (including Cross-Device Online Rooms) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    {
                      id: 'solo' as const,
                      title: 'Solo',
                      sub: 'Contrarreloj',
                      icon: Trophy,
                      accent: 'text-indigo-400'
                    },
                    {
                      id: 'ai' as const,
                      title: 'Vs IA',
                      sub: 'Duelo GP',
                      icon: Cpu,
                      accent: 'text-cyan-400'
                    },
                    {
                      id: 'multiplayer' as const,
                      title: '2–4 Local',
                      sub: 'Por turnos',
                      icon: Users,
                      accent: 'text-emerald-400'
                    }
                  ].map((m) => {
                    const Icon = m.icon;
                    const active = gameMode === m.id && !activeOnlineRoom;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          onSetGameMode(m.id);
                          audio.playBeep(330, 0.08, 'sine');
                        }}
                        className={`flex flex-col items-center justify-center p-2.5 min-h-[64px] rounded-xl border text-center transition-all cursor-pointer ${
                          active
                            ? 'bg-slate-800 border-amber-400 shadow-sm'
                            : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <Icon className={`w-4 h-4 mb-1 ${active ? 'text-amber-400' : m.accent}`} />
                        <span className="font-bold text-white text-xs whitespace-nowrap">{m.title}</span>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">{m.sub}</span>
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => {
                      audio.playBeep(560, 0.08, 'sine');
                      setOnlineHubTab('multiplayer');
                      setOnlineHubOpen(true);
                    }}
                    className={`flex flex-col items-center justify-center p-2.5 min-h-[64px] rounded-xl border text-center transition-all cursor-pointer ${
                      activeOnlineRoom
                        ? 'bg-emerald-500/20 border-emerald-400 shadow-sm'
                        : 'bg-slate-950/50 border-emerald-500/40 hover:border-emerald-400 hover:bg-emerald-500/10'
                    }`}
                  >
                    <Wifi className="w-4 h-4 mb-1 text-emerald-400" />
                    <span className="font-bold text-white text-xs whitespace-nowrap">Online</span>
                    <span className="text-[10px] text-emerald-300 whitespace-nowrap">
                      {activeOnlineRoom ? `Sala ${activeOnlineRoom.code}` : 'Multidispositivo'}
                    </span>
                  </button>
                </div>
              </div>

              {/* 3. COMPACT LAP COUNT SELECTOR */}
              <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Flag className="w-3.5 h-3.5 text-amber-400" />
                    3. Vueltas
                  </span>
                  <span className="text-[10px] font-mono text-amber-400 font-bold">
                    {totalLaps === 1 ? 'Sprint 1 Vuelta' : `${totalLaps} Vueltas · Trazadas + DRS`}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { laps: 1, label: '1V', sub: 'Sprint' },
                    { laps: 2, label: '2V', sub: 'Duelo' },
                    { laps: 3, label: '3V', sub: 'GP F1' },
                    { laps: 5, label: '5V', sub: 'Endurance' }
                  ].map((opt) => (
                    <button
                      key={opt.laps}
                      type="button"
                      onClick={() => {
                        setTotalLaps(opt.laps);
                        audio.playBeep(360 + opt.laps * 40, 0.06, 'sine');
                      }}
                      className={`flex flex-col items-center justify-center py-1.5 px-1 min-h-[42px] rounded-lg border text-center transition-all cursor-pointer ${
                        totalLaps === opt.laps
                          ? 'bg-amber-400 text-slate-950 border-amber-300 font-extrabold shadow-sm'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-xs font-mono font-bold tabular-nums">{opt.label}</span>
                      <span
                        className={`text-[9px] font-mono ${
                          totalLaps === opt.laps ? 'text-slate-900 font-bold' : 'text-slate-400'
                        }`}
                      >
                        {opt.sub}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. ATMOSPHERE, TIME-OF-DAY & WET WEATHER SELECTOR */}
              <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    4. Condiciones y Atmósfera 3D
                  </span>
                  <span className="text-[10px] font-mono text-cyan-400 font-bold">
                    {weather === 'rain' ? 'Asfalto Mojado PBR + Spray' : 'Asfalto Seco PBR 60 FPS'}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {[
                    { id: 'day' as const, label: '☀️ Día', sub: 'Sol GP' },
                    { id: 'sunset' as const, label: '🌅 Ocaso', sub: 'Dorado' },
                    { id: 'night' as const, label: '🌙 Noche', sub: 'Focos' }
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setLightingPreset(preset.id);
                        audio.playBeep(420, 0.05, 'sine');
                      }}
                      className={`flex flex-col items-center justify-center py-1.5 px-1 min-h-[42px] rounded-lg border text-center transition-all cursor-pointer ${
                        lightingPreset === preset.id
                          ? 'bg-slate-800 text-amber-300 border-amber-400 font-bold shadow-sm'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-[10.5px] font-bold whitespace-nowrap">{preset.label}</span>
                      <span className="text-[8.5px] font-mono text-slate-400">{preset.sub}</span>
                    </button>
                  ))}
                  {[
                    { id: 'dry' as const, label: '🛞 Seco', sub: 'Slicks' },
                    { id: 'rain' as const, label: '🌧️ Lluvia', sub: 'Wet GP' }
                  ].map((wOpt) => (
                    <button
                      key={wOpt.id}
                      type="button"
                      onClick={() => {
                        setWeather(wOpt.id);
                        audio.playBeep(wOpt.id === 'rain' ? 310 : 490, 0.06, 'sine');
                      }}
                      className={`flex flex-col items-center justify-center py-1.5 px-1 min-h-[42px] rounded-lg border text-center transition-all cursor-pointer ${
                        weather === wOpt.id
                          ? wOpt.id === 'rain'
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400 font-extrabold shadow-sm'
                            : 'bg-emerald-500/20 text-emerald-300 border-emerald-400 font-extrabold shadow-sm'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-[10.5px] font-bold whitespace-nowrap">{wOpt.label}</span>
                      <span className="text-[8.5px] font-mono text-slate-400">{wOpt.sub}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* STICKY BOTTOM CTA BAR — ALWAYS VISIBLE WITHOUT SCROLLING */}
          <div className="sticky bottom-2 z-30 bg-slate-900/95 border border-slate-800 p-2.5 sm:p-3 rounded-xl shadow-2xl flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => {
                audio.playBeep(440, 0.1, 'sine');
                onRestart(); // Open Pilot & Car customization screen
              }}
              className="min-h-[46px] px-3.5 sm:px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 active:scale-[0.98] text-slate-100 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0 whitespace-nowrap"
            >
              <Car className="w-4 h-4 text-amber-400" />
              <span>Pilotos y Coches</span>
            </button>

            <button
              type="button"
              onClick={handleStartSetup}
              className="flex-1 min-h-[46px] flex items-center justify-center gap-2 bg-gradient-to-r from-amber-400 to-emerald-400 hover:from-amber-300 hover:to-emerald-300 active:scale-[0.98] text-slate-950 font-extrabold py-2.5 px-5 rounded-xl shadow-lg transition-all text-xs sm:text-sm cursor-pointer whitespace-nowrap"
            >
              <span>¡JUGAR AHORA!</span>
              <Play className="w-4 h-4 fill-slate-950" />
            </button>
          </div>
        </div>
      )}

      {/* PHASE 2: COMPACT CAR SELECTION & PLAYER REGISTRATION WITH STICKY PLAY BUTTON */}
      {phase === 'car_selection' && (
        <div className="flex flex-col gap-2.5 sm:gap-3 animate-fadeIn">
          <div className="flex flex-col gap-3 bg-slate-900 border border-slate-800 p-3 sm:p-4 rounded-xl shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Car className="w-4 h-4 text-amber-400" />
                <h3 className="font-sans font-bold text-white text-sm sm:text-base">
                  Configuración de Pilotos y Vehículos
                </h3>
              </div>

              {gameMode === 'multiplayer' && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-300">Jugadores:</span>
                  <div className="flex gap-1">
                    {[2, 3, 4].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => {
                          setNumPlayers(num);
                          audio.playBeep(261.63, 0.05, 'sine');
                        }}
                        className={`w-8 h-8 rounded-lg font-mono font-bold text-xs flex items-center justify-center border transition-all cursor-pointer ${
                          numPlayers === num
                            ? 'bg-amber-400 text-slate-950 border-amber-400'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Compact Player & AI Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3">
              {Array.from({
                length: gameMode === 'solo' ? 1 : gameMode === 'ai' ? 1 : numPlayers
              }).map((_, idx) => {
                const currentCar = carStats[playersForm[idx].carType];
                return (
                  <div
                    key={idx}
                    className="flex flex-col gap-2.5 bg-slate-950/50 border border-slate-800/90 p-3 rounded-xl"
                  >
                    {/* Row 1: Pilot Label + Inline Name Input */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-amber-400 font-mono shrink-0">
                        #{idx + 1}
                      </span>
                      <input
                        type="text"
                        maxLength={14}
                        value={playersForm[idx].name}
                        onChange={(e) => handleFormChange(idx, 'name', e.target.value)}
                        aria-label={`Nombre Piloto ${idx + 1}`}
                        className="flex-1 min-w-0 bg-slate-900 border border-slate-800 text-white rounded-lg px-2.5 py-1.5 text-base sm:text-xs font-bold focus:outline-none focus:border-amber-400/60"
                      />
                      <span className="text-[10px] text-slate-400 font-mono shrink-0 hidden sm:inline">
                        {CAR_LIVERY_PALETTE.find((c) => c.hex === playersForm[idx].color)?.name}
                      </span>
                    </div>

                    {/* Row 2: Unique Car Livery Color Swatches */}
                    <div className="grid grid-cols-6 gap-1.5">
                      {CAR_LIVERY_PALETTE.map((swatch) => {
                        const isPicked =
                          playersForm[idx].color.toLowerCase() === swatch.hex.toLowerCase();
                        const activeSlotsCount = gameMode === 'multiplayer' ? numPlayers : 1;
                        const usedByOther = Array.from({ length: activeSlotsCount }).some(
                          (_, otherIdx) =>
                            otherIdx !== idx &&
                            playersForm[otherIdx].color.toLowerCase() === swatch.hex.toLowerCase()
                        );
                        return (
                          <button
                            key={swatch.id}
                            type="button"
                            onClick={() => handlePlayerColorChange(idx, swatch.hex)}
                            title={
                              usedByOther
                                ? `${swatch.name} (intercambiar con otro piloto)`
                                : swatch.name
                            }
                            className={`relative h-8 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
                              isPicked
                                ? 'border-white ring-2 ring-amber-400/80 scale-105'
                                : usedByOther
                                  ? 'border-slate-700 opacity-45 hover:opacity-90'
                                  : 'border-slate-800 hover:border-slate-500'
                            }`}
                            style={{ backgroundColor: swatch.hex }}
                          >
                            {isPicked && <Check className="w-3.5 h-3.5 text-slate-950 stroke-[3]" />}
                          </button>
                        );
                      })}
                    </div>

                    {/* Row 3: Chassis Type Selector + Inline Compact Stat Bars */}
                    <div className="grid grid-cols-3 gap-1.5">
                      {(Object.keys(carStats) as CarType[]).map((type) => {
                        const car = carStats[type];
                        const isSelected = playersForm[idx].carType === type;
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => {
                              handleFormChange(idx, 'carType', type);
                              audio.playBeep(
                                260 + (type === 'speedster' ? 150 : type === 'drifter' ? -50 : 0),
                                0.08,
                                'sine'
                              );
                            }}
                            className={`py-2 px-1.5 min-h-[38px] rounded-lg border transition-all text-center cursor-pointer ${
                              isSelected
                                ? 'bg-slate-800 border-amber-400 text-white font-bold'
                                : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            <span className="text-[11px] capitalize whitespace-nowrap">
                              {car.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Compact 1-Line 3-Metric Bar (Velocidad / Acel / Giro) */}
                    <div className="grid grid-cols-3 gap-2 bg-slate-900/60 px-2.5 py-1.5 rounded-lg border border-slate-800/60">
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-mono text-slate-400">Velocidad</span>
                        <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-rose-500 rounded-full"
                            style={{
                              width: `${Math.min(100, (currentCar.maxSpeed / 9.0) * 100)}%`
                            }}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-mono text-slate-400">Aceleración</span>
                        <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-400 rounded-full"
                            style={{
                              width: `${Math.min(100, (currentCar.acceleration / 0.25) * 100)}%`
                            }}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-mono text-slate-400">Agarre</span>
                        <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-400 rounded-full"
                            style={{
                              width: `${Math.min(100, (currentCar.grip / 0.12) * 100)}%`
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Compact AI Opponent Configuration Card */}
              {gameMode === 'ai' && (
                <div className="flex flex-col justify-between gap-2.5 bg-slate-950/50 border border-slate-800/90 p-3 rounded-xl">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Cpu className="w-4 h-4 text-cyan-400" />
                      <span className="text-xs font-bold text-white font-mono">
                        Piloto IA Rival
                      </span>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-cyan-400">
                      {CAR_LIVERY_PALETTE.find((c) => c.hex === resolvedAiColor)?.name || 'IA'}
                    </span>
                  </div>

                  {/* AI Color Swatch Picker */}
                  <div className="grid grid-cols-6 gap-1.5">
                    {CAR_LIVERY_PALETTE.map((swatch) => {
                      const isTakenByHuman =
                        playersForm[0].color.toLowerCase() === swatch.hex.toLowerCase();
                      const isPicked =
                        resolvedAiColor.toLowerCase() === swatch.hex.toLowerCase();
                      return (
                        <button
                          key={`ai-${swatch.id}`}
                          type="button"
                          disabled={isTakenByHuman}
                          onClick={() => {
                            setAiColor(swatch.hex);
                            audio.playBeep(520, 0.05, 'sine');
                          }}
                          className={`relative h-8 rounded-lg border flex items-center justify-center transition-all ${
                            isTakenByHuman
                              ? 'border-slate-800 opacity-20 cursor-not-allowed'
                              : isPicked
                                ? 'border-white ring-2 ring-cyan-400/80 scale-105 cursor-pointer'
                                : 'border-slate-800 hover:border-slate-500 cursor-pointer'
                          }`}
                          style={{ backgroundColor: swatch.hex }}
                        >
                          {isPicked && <Check className="w-3.5 h-3.5 text-slate-950 stroke-[3]" />}
                        </button>
                      );
                    })}
                  </div>

                  {/* AI Driving Style 3-Col Selector */}
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      {
                        id: 'apex_master' as AIArchetype,
                        title: 'Apex Master',
                        sub: 'Trazada fina',
                        color: 'border-cyan-400 text-cyan-300'
                      },
                      {
                        id: 'aggressive' as AIArchetype,
                        title: 'Predator',
                        sub: 'Ataque total',
                        color: 'border-rose-400 text-rose-300'
                      },
                      {
                        id: 'defensive' as AIArchetype,
                        title: 'Guardian',
                        sub: 'Constante',
                        color: 'border-emerald-400 text-emerald-300'
                      }
                    ].map((arch) => (
                      <button
                        key={arch.id}
                        type="button"
                        onClick={() => setSelectedAiArchetype(arch.id)}
                        className={`p-2 min-h-[48px] rounded-lg border text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                          selectedAiArchetype === arch.id
                            ? `bg-slate-800 ${arch.color}`
                            : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <span className="text-[11px] font-bold whitespace-nowrap">{arch.title}</span>
                        <span className="text-[9.5px] text-slate-400 whitespace-nowrap">{arch.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* STICKY BOTTOM BAR FOR CAR SELECTION — ALWAYS REACHABLE */}
          <div className="sticky bottom-2 z-30 bg-slate-900/95 border border-slate-800 p-2.5 sm:p-3 rounded-xl shadow-2xl flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => onRestart()}
              className="min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 active:scale-[0.98] text-xs font-bold cursor-pointer shrink-0"
            >
              Atrás
            </button>
            <button
              type="button"
              onClick={handleStartSetup}
              className="flex-1 min-h-[46px] flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 active:scale-[0.98] text-slate-950 font-extrabold py-2.5 px-6 rounded-xl shadow-lg transition-all text-xs sm:text-sm cursor-pointer whitespace-nowrap"
            >
              <span>¡SALIR A PISTA Y TRAZAR!</span>
              <Play className="w-4 h-4 fill-slate-950" />
            </button>
          </div>
        </div>
      )}

      {/* PHASE 3: COMPACT DRAWING STATE HUD */}
      {phase === 'drawing' && (
        <div className="flex flex-col gap-2 bg-slate-900 border border-slate-800 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl shadow-md animate-fadeIn">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-sans font-bold text-white text-xs sm:text-sm flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>
                Fase de Trazado ({totalLaps} {totalLaps === 1 ? 'Vuelta' : 'Vueltas'})
              </span>
            </h3>

            {/* If all players have completed all their lap paths, show prominent start button right in header too */}
            {players.every((p) => p.isAI || (p.lapPaths?.length || 0) >= totalLaps) && (
              <button
                onClick={() => {
                  audio.playBeep(880, 0.15, 'sine');
                  onStartRace();
                }}
                className="flex items-center gap-1.5 bg-gradient-to-r from-red-500 to-amber-500 hover:from-red-600 hover:to-amber-600 text-white font-extrabold py-1.5 px-4 min-h-[38px] rounded-xl shadow-lg transition-all text-xs cursor-pointer"
              >
                <span>¡COMENZAR LA CARRERA!</span>
                <Play className="w-3.5 h-3.5 fill-white" />
              </button>
            )}
          </div>

          {/* Active Online Room or Ghost Challenge Status Banner during Drawing */}
          {(activeOnlineRoom || activeChallengeEntry) && (
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/80 border border-slate-800 px-2.5 py-1.5 rounded-lg text-[11px]">
              {activeOnlineRoom ? (
                <>
                  <div className="flex items-center gap-1.5 text-emerald-300 font-bold">
                    <Wifi className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                    <span>Sala Online {activeOnlineRoom.code} · Trazado simultáneo en vivo</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {activeOnlineRoom.players.map((rp) => {
                      const isDone = rp.pathSubmitted || rp.ready;
                      return (
                        <span
                          key={rp.id}
                          className={`font-mono text-[10px] px-2 py-0.5 rounded border ${
                            isDone
                              ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-300 font-bold'
                              : 'bg-slate-900 border-slate-800 text-slate-400'
                          }`}
                        >
                          {rp.name}: {isDone ? '✅ Listo' : '✏️ Trazando...'}
                        </span>
                      );
                    })}
                  </div>
                </>
              ) : activeChallengeEntry ? (
                <div className="flex items-center justify-between w-full gap-2">
                  <div className="flex items-center gap-1.5 text-amber-300 font-bold">
                    <Swords className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      Reto Fantasma vs {activeChallengeEntry.driverName} ({activeChallengeEntry.challengeCode})
                    </span>
                  </div>
                  <span className="font-mono text-amber-400 font-bold">
                    Objetivo: {(activeChallengeEntry.lapTimeMs / 1000).toFixed(2)}s
                  </span>
                </div>
              ) : null}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {players.map((p, idx) => {
              const isCurrent = idx === activePlayerIndex;
              const savedCount = p.isAI ? totalLaps : (p.lapPaths?.length || 0);
              const hasDrawnAll = p.isAI || savedCount >= totalLaps;
              const stats = carStats[p.carType];

              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border transition-all ${
                    isCurrent && !hasDrawnAll
                      ? 'bg-amber-400/10 border-amber-400/60'
                      : hasDrawnAll
                        ? 'bg-slate-950/50 border-slate-800/80'
                        : 'bg-slate-950/20 border-slate-900 opacity-50'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: p.color || stats.color }}
                  />
                  <div className="flex-1 min-w-0 flex items-center justify-between gap-1">
                    <span className="text-[10px] sm:text-xs font-bold text-white truncate">
                      {p.name}
                    </span>
                    <span className="text-[9.5px] font-mono text-slate-400 shrink-0">
                      {hasDrawnAll
                        ? `Listo`
                        : isCurrent
                          ? `V${Math.min(totalLaps, savedCount + 1)}/${totalLaps}`
                          : 'Espera'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* PHASE 4: RACE RESULTS & ACADEMIC TELEMETRY LAB */}
      {phase === 'results' && raceResults && (
        resultsTab === 'telemetry' ? (
          <TelemetryLab
            track={selectedTrack}
            players={players}
            results={raceResults}
            telemetries={useGameStore.getState().telemetries}
            onClose={() => setResultsTab('podium')}
          />
        ) : (
          <div className="flex flex-col gap-3 animate-fadeIn">
            <div className="flex flex-col gap-3 bg-slate-900 border border-slate-800 p-3.5 sm:p-4 rounded-xl shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <Trophy className="w-6 h-6 text-amber-400 shrink-0" />
                  <div>
                    <h3 className="font-sans font-extrabold text-white text-sm sm:text-lg">
                      Resultados del Gran Premio ({totalLaps} {totalLaps === 1 ? 'Vuelta' : 'Vueltas'})
                    </h3>
                    <p className="text-slate-400 text-[11px]">
                      Clasificación oficial, tiempos totales y vuelta rápida
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    audio.playBeep(520, 0.07, 'sine');
                    setOnlineHubTab('leaderboard');
                    setOnlineHubOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/50 text-amber-300 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <Globe className="w-3.5 h-3.5 text-amber-400" />
                  <span>Ver Ranking Mundial / Regional</span>
                </button>
              </div>

              {/* Global & Regional Ranking Publication + Shareable Challenge Code Banner */}
              {publishedEntry && (
                <div className="max-w-2xl mx-auto w-full bg-gradient-to-r from-amber-500/15 via-slate-950 to-emerald-500/15 border border-amber-400/40 rounded-xl p-2.5 sm:p-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Swords className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <div className="text-xs font-extrabold text-white flex items-center gap-1.5">
                        <span>Tiempo registrado en el Ranking Mundial y Regional ({publishedEntry.regionName})</span>
                      </div>
                      <p className="text-[10.5px] text-slate-300">
                        Comparte tu código de reto para que tus amigos compitan contra tu Ghost 3D:
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-extrabold text-xs sm:text-sm text-amber-300 bg-slate-950 border border-amber-400/50 px-2.5 py-1 rounded-lg">
                      {publishedEntry.challengeCode}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(publishedEntry.challengeCode);
                        setCopiedChallenge(true);
                        audio.playBeep(660, 0.06, 'sine');
                        setTimeout(() => setCopiedChallenge(false), 2500);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-[11px] cursor-pointer transition-all"
                    >
                      {copiedChallenge ? '¡Copiado!' : 'Copiar Reto'}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2 max-w-2xl mx-auto w-full">
                {(() => {
                  const overallFastestLap = Math.min(
                    ...raceResults
                      .filter((r) => !r.disqualified && (r.bestLap || r.time) > 1000)
                      .map((r) => r.bestLap || r.time)
                  );

                  return [...raceResults]
                    .sort((a, b) => {
                      if (a.disqualified) return 1;
                      if (b.disqualified) return -1;
                      return a.time - b.time;
                    })
                    .map((res, idx) => {
                      const player = players.find((p) => p.id === res.playerId)!;
                      const stats = carStats[player.carType];
                      const displayTime = res.disqualified
                        ? 'DESCALIFICADO'
                        : `${(res.time / 1000).toFixed(2)}s`;
                      const bestLapMs = res.bestLap || res.time;
                      const hasFastestLap =
                        !res.disqualified &&
                        raceResults.length > 1 &&
                        Math.abs(bestLapMs - overallFastestLap) < 5;

                      const medalBg =
                        idx === 0
                          ? 'bg-amber-400 text-slate-950 font-extrabold'
                          : idx === 1
                            ? 'bg-slate-300 text-slate-950 font-bold'
                            : idx === 2
                              ? 'bg-amber-700 text-white font-bold'
                              : 'bg-slate-800 text-slate-400';

                      return (
                        <div
                          key={res.playerId}
                          className="flex flex-col gap-1.5 p-2.5 sm:p-3 bg-slate-950/60 border border-slate-800 rounded-xl"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono ${medalBg}`}
                              >
                                {idx + 1}
                              </div>
                              <span
                                className="w-3 h-3 rounded-full shrink-0"
                                style={{ backgroundColor: player.color || stats.color }}
                              />
                              <span className="font-bold text-white text-xs sm:text-sm">
                                {player.name}
                              </span>
                              {player.isAI && (
                                <span className="text-[10px] text-cyan-400 font-mono">
                                  · IA
                                </span>
                              )}
                              {hasFastestLap && (
                                <span className="text-[10px] font-mono font-bold text-purple-300">
                                  · VR {(bestLapMs / 1000).toFixed(2)}s
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 sm:gap-3">
                              {newRecordPlayerId === res.playerId && (
                                <span className="text-[10px] font-mono font-extrabold text-amber-300">
                                  ¡RÉCORD!
                                </span>
                              )}
                              {res.performanceScore !== undefined && (
                                <span className="text-[10px] font-mono text-emerald-400 hidden sm:inline">
                                  Precisión {res.performanceScore}%
                                </span>
                              )}
                              <span
                                className={`font-mono text-xs sm:text-sm font-bold tabular-nums ${
                                  idx === 0 && !res.disqualified
                                    ? 'text-amber-400'
                                    : res.disqualified
                                      ? 'text-rose-500'
                                      : 'text-slate-200'
                                }`}
                              >
                                {displayTime}
                              </span>
                            </div>
                          </div>

                          {/* Individual Lap Split Times when multi-lap race */}
                          {res.lapTimes && res.lapTimes.length > 1 && (
                            <div className="flex flex-wrap items-center gap-2 pl-8 text-[10px] font-mono text-slate-400">
                              <span className="text-slate-500">Vueltas:</span>
                              {res.lapTimes.map((lt, lIdx) => {
                                const isPersonalBest = Math.abs(lt - bestLapMs) < 5;
                                return (
                                  <span
                                    key={`lap-split-${lIdx}`}
                                    className={`tabular-nums ${
                                      isPersonalBest
                                        ? 'text-emerald-300 font-bold'
                                        : 'text-slate-300'
                                    }`}
                                  >
                                    V{lIdx + 1} {(lt / 1000).toFixed(2)}s
                                    {lIdx < (res.lapTimes?.length || 0) - 1 ? ' ·' : ''}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    });
                })()}
              </div>
            </div>

            {/* STICKY BOTTOM BAR FOR RESULTS — ALWAYS VISIBLE */}
            <div className="sticky bottom-2 z-30 bg-slate-900/95 border border-slate-800 p-2.5 sm:p-3 rounded-xl shadow-2xl grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => {
                  audio.playBeep(440, 0.1, 'sine');
                  onRestart();
                }}
                className="min-h-[44px] flex items-center justify-center gap-1.5 bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 active:scale-[0.98] text-slate-950 text-xs font-extrabold py-2 px-4 rounded-xl cursor-pointer shadow-md transition-all whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Volver a Jugar</span>
              </button>

              <button
                onClick={() => {
                  audio.playBeep(740, 0.1, 'sine');
                  useGameStore.getState().startReplay();
                }}
                className="min-h-[44px] flex items-center justify-center gap-1.5 bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 active:scale-[0.98] text-slate-950 text-xs font-extrabold py-2 px-4 rounded-xl cursor-pointer shadow-md transition-all whitespace-nowrap"
              >
                <Video className="w-3.5 h-3.5" />
                <span>Repetición 3D</span>
              </button>

              <button
                onClick={() => {
                  audio.playBeep(600, 0.1, 'sine');
                  setResultsTab('telemetry');
                }}
                className="min-h-[44px] flex items-center justify-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 active:scale-[0.98] text-white text-xs font-bold py-2 px-4 rounded-xl cursor-pointer shadow-md transition-all whitespace-nowrap"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Telemetría F1</span>
              </button>

              <button
                onClick={() => {
                  audio.playBeep(330, 0.1, 'sine');
                  useGameStore.getState().goToMenu();
                }}
                className="min-h-[44px] flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-amber-400 border border-slate-700 text-xs font-bold py-2 px-4 rounded-xl cursor-pointer transition-colors whitespace-nowrap"
              >
                <span>Menú Principal</span>
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
};

