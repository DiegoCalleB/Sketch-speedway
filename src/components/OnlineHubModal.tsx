import React, { useEffect, useState } from 'react';
import {
  Globe,
  Trophy,
  Wifi,
  Users,
  Swords,
  Copy,
  Check,
  Play,
  LogOut,
  RefreshCw,
  MapPin,
  Sparkles,
  X,
  Search
} from 'lucide-react';
import { CarType, LightingPreset, Point, Track, WeatherCondition } from '../types';
import {
  REGIONS,
  getRegionByCode,
  LeaderboardEntry,
  OnlineRoomState,
  PublicRoomSummary,
  onlineClient,
  fetchLeaderboardEntries,
  fetchChallengeByCode
} from '../utils/onlineMultiplayer';
import { CAR_LIVERY_PALETTE, CAR_STATS } from '../store/gameStore';
import { audio } from '../utils/audio';

interface OnlineHubModalProps {
  isOpen: boolean;
  initialTab?: 'leaderboard' | 'multiplayer';
  tracks: Track[];
  selectedTrack: Track;
  playerName: string;
  playerRegion: string;
  playerCarType: CarType;
  playerColor: string;
  totalLaps: number;
  lightingPreset: LightingPreset;
  weather: WeatherCondition;
  onUpdateProfile: (profile: {
    name: string;
    regionCode: string;
    carType: CarType;
    color: string;
  }) => void;
  onClose: () => void;
  onStartGhostChallenge: (entry: LeaderboardEntry, targetTrack: Track) => void;
  onOnlineRoomDrawingStart: (room: OnlineRoomState, localClientId: string) => void;
  onOnlineRoomRaceStart: (room: OnlineRoomState, localClientId: string) => void;
}

export const OnlineHubModal: React.FC<OnlineHubModalProps> = ({
  isOpen,
  initialTab = 'leaderboard',
  tracks,
  selectedTrack,
  playerName,
  playerRegion,
  playerCarType,
  playerColor,
  totalLaps,
  lightingPreset,
  weather,
  onUpdateProfile,
  onClose,
  onStartGhostChallenge,
  onOnlineRoomDrawingStart,
  onOnlineRoomRaceStart
}) => {
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'multiplayer'>(initialTab);
  const [filterTrackId, setFilterTrackId] = useState<string>(selectedTrack.id);
  const [rankingScope, setRankingScope] = useState<'GLOBAL' | 'REGIONAL'>('GLOBAL');
  const [filterRegionCode, setFilterRegionCode] = useState<string>(playerRegion);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loadingLb, setLoadingLb] = useState<boolean>(false);

  const [challengeInput, setChallengeInput] = useState<string>('');
  const [challengeStatus, setChallengeStatus] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Online multiplayer room state
  const [wsConnected, setWsConnected] = useState<boolean>(onlineClient.connected);
  const [room, setRoom] = useState<OnlineRoomState | null>(onlineClient.currentRoom);
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>(onlineClient.publicRooms);
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [roomError, setRoomError] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setFilterTrackId(selectedTrack.id);
  }, [selectedTrack.id]);

  useEffect(() => {
    setFilterRegionCode(playerRegion);
  }, [playerRegion]);

  const loadLeaderboard = async () => {
    setLoadingLb(true);
    const regionFilter = rankingScope === 'GLOBAL' ? 'ALL' : filterRegionCode;
    const res = await fetchLeaderboardEntries(filterTrackId, regionFilter);
    setEntries(res.entries);
    if (res.publicRooms.length > 0) {
      setPublicRooms(res.publicRooms);
    }
    setLoadingLb(false);
  };

  useEffect(() => {
    if (isOpen) {
      loadLeaderboard();
    }
  }, [isOpen, filterTrackId, rankingScope, filterRegionCode]);

  useEffect(() => {
    const unsubscribe = onlineClient.subscribe((evt) => {
      setWsConnected(onlineClient.connected);
      if (evt.type === 'room:state') {
        const nextRoom = evt.room || null;
        setRoom(nextRoom);
        setRoomError(null);
        if (nextRoom && nextRoom.status === 'drawing') {
          onOnlineRoomDrawingStart(nextRoom, onlineClient.clientId);
        } else if (nextRoom && nextRoom.status === 'racing') {
          onOnlineRoomRaceStart(nextRoom, onlineClient.clientId);
        }
      } else if (evt.type === 'rooms:list' && evt.rooms) {
        setPublicRooms(evt.rooms);
      } else if (evt.type === 'room:error' && evt.message) {
        setRoomError(evt.message);
      } else if (evt.type === 'leaderboard:updated') {
        loadLeaderboard();
      }
    });
    return unsubscribe;
  }, [onOnlineRoomDrawingStart, onOnlineRoomRaceStart, filterTrackId, rankingScope, filterRegionCode]);

  if (!isOpen) return null;

  const handleCopyCode = (code: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).catch(() => {});
    }
    setCopiedCode(code);
    audio.playBeep(660, 0.06, 'sine');
    setTimeout(() => setCopiedCode(null), 2200);
  };

  const handleSearchChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeInput.trim()) return;
    setChallengeStatus('Buscando código de reto...');
    const found = await fetchChallengeByCode(challengeInput);
    if (!found) {
      setChallengeStatus(`No se encontró ningún reto con el código "${challengeInput.toUpperCase()}".`);
      return;
    }
    const targetTrack = tracks.find((t) => t.id === found.trackId) || selectedTrack;
    setChallengeStatus(null);
    audio.playBeep(580, 0.1, 'triangle');
    onStartGhostChallenge(found, targetTrack);
  };

  const handleCreateOnlineRoom = () => {
    setRoomError(null);
    onlineClient.createRoom({
      playerName: playerName || 'Piloto F1',
      regionCode: playerRegion,
      carType: playerCarType,
      color: playerColor,
      trackId: selectedTrack.id,
      totalLaps,
      lightingPreset,
      weather
    });
    audio.playBeep(520, 0.08, 'sine');
  };

  const handleJoinOnlineRoom = (codeToJoin: string) => {
    const clean = codeToJoin.trim().toUpperCase();
    if (!clean) return;
    setRoomError(null);
    onlineClient.joinRoom({
      roomCode: clean,
      playerName: playerName || 'Piloto F1',
      regionCode: playerRegion,
      carType: playerCarType,
      color: playerColor
    });
    audio.playBeep(520, 0.08, 'sine');
  };

  const isHost = room && room.hostId === onlineClient.clientId;
  const roomTrack = tracks.find((t) => t.id === room?.trackId) || selectedTrack;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]">
        {/* TOP MODAL HEADER */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800 gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 text-slate-950">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-white font-extrabold text-sm sm:text-base tracking-tight flex items-center gap-2">
                <span>FIA WORLD & REGIONAL NETWORK</span>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-md border ${
                    wsConnected
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  }`}
                >
                  <Wifi className="w-3 h-3" />
                  {wsConnected ? 'ONLINE EN VIVO' : 'CONECTANDO...'}
                </span>
              </h2>
              <p className="text-slate-400 text-[11px]">
                Clasificación Mundial y Regional · Retos Fantasma · Salas Multijugador entre dispositivos
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* DRIVER PROFILE BAR (NAME + REGION + CAR) */}
        <div className="px-4 py-2.5 bg-slate-900/95 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1">
              <span className="text-[10px] font-mono text-slate-400 uppercase">Piloto:</span>
              <input
                type="text"
                value={playerName}
                maxLength={22}
                onChange={(e) =>
                  onUpdateProfile({
                    name: e.target.value,
                    regionCode: playerRegion,
                    carType: playerCarType,
                    color: playerColor
                  })
                }
                placeholder="Tu nombre"
                className="bg-transparent text-white font-bold text-xs focus:outline-none w-28 sm:w-36"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1">
              <MapPin className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[10px] font-mono text-slate-400 uppercase">Región:</span>
              <select
                value={playerRegion}
                onChange={(e) =>
                  onUpdateProfile({
                    name: playerName,
                    regionCode: e.target.value,
                    carType: playerCarType,
                    color: playerColor
                  })
                }
                className="bg-slate-950 text-cyan-300 font-bold text-xs focus:outline-none cursor-pointer"
              >
                {REGIONS.map((reg) => (
                  <option key={reg.code} value={reg.code}>
                    {reg.flag} {reg.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* NAVIGATION TABS */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => {
                setActiveTab('leaderboard');
                audio.playBeep(420, 0.05, 'sine');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'leaderboard'
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Trophy className="w-3.5 h-3.5" />
              Ranking & Retos
            </button>
            <button
              onClick={() => {
                setActiveTab('multiplayer');
                audio.playBeep(480, 0.05, 'sine');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'multiplayer'
                  ? 'bg-cyan-400 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Salas Online ({publicRooms.length})
            </button>
          </div>
        </div>

        {/* BODY CONTENT */}
        <div className="p-3 sm:p-4 overflow-y-auto flex-1 flex flex-col gap-3">
          {activeTab === 'leaderboard' ? (
            <>
              {/* DIRECT CHALLENGE CODE BAR */}
              <form
                onSubmit={handleSearchChallenge}
                className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-amber-500/30 rounded-xl p-2.5 sm:p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    <Swords className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>¿Te han picado con un Código de Reto?</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Introduce el código (ej. <span className="text-amber-300 font-mono">JRM-55</span>,{' '}
                      <span className="text-amber-300 font-mono">MAD-26</span>,{' '}
                      <span className="text-amber-300 font-mono">MON-16</span>) o reta directamente a cualquier piloto de la tabla.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={challengeInput}
                    onChange={(e) => setChallengeInput(e.target.value.toUpperCase())}
                    placeholder="CÓDIGO (ej. MAD-26)"
                    maxLength={10}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-amber-300 uppercase focus:outline-none focus:border-amber-400 w-36"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <Search className="w-3.5 h-3.5" />
                    Aceptar Reto
                  </button>
                </div>
              </form>

              {challengeStatus && (
                <div className="text-xs font-mono text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-1.5">
                  {challengeStatus}
                </div>
              )}

              {/* CIRCUIT & GLOBAL/REGIONAL FILTER BAR */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                {/* Circuit Pills */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                  {tracks.map((tk) => (
                    <button
                      key={tk.id}
                      onClick={() => setFilterTrackId(tk.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap border transition-all cursor-pointer ${
                        filterTrackId === tk.id
                          ? 'bg-slate-800 border-amber-400 text-amber-300'
                          : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {tk.name.split('–')[0].trim()}
                    </button>
                  ))}
                </div>

                {/* Global vs Regional Scope Toggle */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setRankingScope('GLOBAL')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                      rankingScope === 'GLOBAL'
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    🌍 Mundial
                  </button>
                  <button
                    onClick={() => setRankingScope('REGIONAL')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                      rankingScope === 'REGIONAL'
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    🇪🇸 Regional
                  </button>

                  {rankingScope === 'REGIONAL' && (
                    <select
                      value={filterRegionCode}
                      onChange={(e) => setFilterRegionCode(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-amber-300 focus:outline-none"
                    >
                      {REGIONS.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.flag} {r.name}
                        </option>
                      ))}
                    </select>
                  )}

                  <button
                    onClick={loadLeaderboard}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                    title="Actualizar Clasificación"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingLb ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* LEADERBOARD TABLE */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-900/90 border-b border-slate-800 text-[10px] font-mono text-slate-400 uppercase">
                  <div className="col-span-1">Pos</div>
                  <div className="col-span-4 sm:col-span-3">Piloto</div>
                  <div className="col-span-3 sm:col-span-2">Región</div>
                  <div className="hidden sm:block sm:col-span-2">Monoplaza & Telemetría</div>
                  <div className="col-span-2 text-right">Tiempo</div>
                  <div className="col-span-2 text-right">Retar / Código</div>
                </div>

                {entries.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 text-xs">
                    Aún no hay tiempos registrados en esta región para este circuito. ¡Completa una carrera para inaugurar el récord!
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/70 max-h-[340px] overflow-y-auto">
                    {entries.map((entry, idx) => {
                      const reg = getRegionByCode(entry.regionCode);
                      const isTop3 = idx < 3;
                      const badgeColors = [
                        'bg-amber-400 text-slate-950',
                        'bg-slate-300 text-slate-950',
                        'bg-amber-700 text-white'
                      ];
                      const targetTrack =
                        tracks.find((t) => t.id === entry.trackId) || selectedTrack;

                      return (
                        <div
                          key={entry.id}
                          className="grid grid-cols-12 gap-2 px-3 py-2.5 items-center text-xs hover:bg-slate-900/60 transition-colors"
                        >
                          <div className="col-span-1">
                            <span
                              className={`inline-flex items-center justify-center w-5 h-5 rounded-md font-mono font-extrabold text-[11px] ${
                                isTop3
                                  ? badgeColors[idx]
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {idx + 1}
                            </span>
                          </div>

                          <div className="col-span-4 sm:col-span-3 flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: entry.carColor }}
                            />
                            <span className="font-bold text-white truncate">
                              {entry.driverName}
                            </span>
                          </div>

                          <div className="col-span-3 sm:col-span-2 flex items-center gap-1 text-[11px] text-slate-300 truncate">
                            <span>{reg.flag}</span>
                            <span className="truncate">{reg.name.split('·')[0].trim()}</span>
                          </div>

                          <div className="hidden sm:flex sm:col-span-2 items-center gap-1.5 text-[10px] font-mono text-slate-400">
                            <span className="text-slate-300 font-bold">
                              {CAR_STATS[entry.carType]?.name || 'Grip F1'}
                            </span>
                            <span>·</span>
                            <span className="text-emerald-400">Apex {entry.apexScore}%</span>
                          </div>

                          <div className="col-span-2 text-right font-mono font-extrabold text-cyan-300 tabular-nums">
                            {(entry.lapTimeMs / 1000).toFixed(3)}s
                          </div>

                          <div className="col-span-2 flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleCopyCode(entry.challengeCode)}
                              className="hidden md:inline-flex items-center gap-1 px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-slate-300 cursor-pointer"
                              title="Copiar código de reto para compartir"
                            >
                              {copiedCode === entry.challengeCode ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              <span>{entry.challengeCode}</span>
                            </button>

                            <button
                              onClick={() => {
                                audio.playBeep(580, 0.08, 'triangle');
                                onStartGhostChallenge(entry, targetTrack);
                              }}
                              className="px-2 py-1 rounded-lg bg-gradient-to-r from-amber-400 to-rose-500 hover:from-amber-300 hover:to-rose-400 text-slate-950 font-extrabold text-[11px] flex items-center gap-1 cursor-pointer shadow-sm"
                              title={`Retar el récord de ${entry.driverName}`}
                            >
                              <Swords className="w-3 h-3" />
                              <span>Retar</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* TAB 2: REAL-TIME CROSS-DEVICE ONLINE MULTIPLAYER ROOMS */
            <div className="flex flex-col gap-3">
              {roomError && (
                <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-bold">
                  {roomError}
                </div>
              )}

              {!room ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* CREATE OR JOIN BY CODE */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between gap-3">
                    <div>
                      <h3 className="text-white font-bold text-sm flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-cyan-400" />
                        Crear o Unirse a Sala Online
                      </h3>
                      <p className="text-slate-400 text-xs mt-1">
                        Juega en tiempo real con amigos aunque cada uno esté en su propio móvil, tablet u ordenador en cualquier lugar.
                      </p>
                    </div>

                    {/* Car & Color selector for Online Room */}
                    <div className="flex flex-col gap-2 bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-[10px] font-mono text-slate-400 uppercase">
                        Tu Monoplaza Online:
                      </span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(['balanced', 'speedster', 'drifter'] as CarType[]).map((cType) => (
                          <button
                            key={cType}
                            onClick={() =>
                              onUpdateProfile({
                                name: playerName,
                                regionCode: playerRegion,
                                carType: cType,
                                color: playerColor
                              })
                            }
                            className={`px-2 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                              playerCarType === cType
                                ? 'bg-slate-800 border-cyan-400 text-white'
                                : 'bg-slate-950 border-slate-800 text-slate-400'
                            }`}
                          >
                            {CAR_STATS[cType].name}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5 pt-1">
                        {CAR_LIVERY_PALETTE.map((opt) => (
                          <button
                            key={opt.id}
                            onClick={() =>
                              onUpdateProfile({
                                name: playerName,
                                regionCode: playerRegion,
                                carType: playerCarType,
                                color: opt.hex
                              })
                            }
                            className={`w-5 h-5 rounded-full border-2 cursor-pointer ${
                              playerColor.toLowerCase() === opt.hex.toLowerCase()
                                ? 'border-white scale-110'
                                : 'border-transparent opacity-75'
                            }`}
                            style={{ backgroundColor: opt.hex }}
                          />
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={handleCreateOnlineRoom}
                      className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer shadow-md"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      Crear Sala Online Nueva
                    </button>

                    <div className="border-t border-slate-800 pt-2.5 flex items-center gap-2">
                      <input
                        type="text"
                        value={joinCodeInput}
                        onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                        placeholder="CÓDIGO DE SALA (4 letras)"
                        maxLength={6}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono font-bold text-cyan-300 uppercase focus:outline-none focus:border-cyan-400"
                      />
                      <button
                        onClick={() => handleJoinOnlineRoom(joinCodeInput)}
                        className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs cursor-pointer"
                      >
                        Unirse
                      </button>
                    </div>
                  </div>

                  {/* ACTIVE PUBLIC ROOMS LIST */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-white font-bold text-sm flex items-center gap-2">
                        <Users className="w-4 h-4 text-emerald-400" />
                        Salas Públicas Activas ({publicRooms.length})
                      </h3>
                      <button
                        onClick={loadLeaderboard}
                        className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Actualizar
                      </button>
                    </div>

                    {publicRooms.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-800 rounded-xl text-slate-400 text-xs gap-2">
                        <Wifi className="w-6 h-6 text-slate-600" />
                        <span>
                          No hay salas abiertas en este instante. ¡Pulsa <strong>Crear Sala Online Nueva</strong> y comparte el código de 4 letras con tus amigos!
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 max-h-[260px] overflow-y-auto">
                        {publicRooms.map((r) => {
                          const tk = tracks.find((t) => t.id === r.trackId);
                          return (
                            <div
                              key={r.code}
                              className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700"
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-extrabold text-cyan-300 text-xs bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 rounded">
                                    {r.code}
                                  </span>
                                  <span className="font-bold text-white text-xs">
                                    {tk ? tk.name.split('–')[0].trim() : r.trackId}
                                  </span>
                                  <span className="text-[10px] font-mono text-slate-400">
                                    · {r.totalLaps}V
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                  Anfitrión: <strong className="text-slate-200">{r.hostName}</strong> ·{' '}
                                  {r.playerCount}/4 pilotos
                                </p>
                              </div>

                              <button
                                onClick={() => handleJoinOnlineRoom(r.code)}
                                className="px-3 py-1.5 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-extrabold text-xs cursor-pointer"
                              >
                                Entrar
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* ACTIVE ONLINE ROOM LOBBY */
                <div className="bg-slate-950 border border-cyan-500/40 rounded-xl p-3.5 sm:p-4 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="px-3 py-1.5 rounded-xl bg-cyan-500/15 border border-cyan-400/50 text-cyan-300 font-mono font-extrabold text-base flex items-center gap-2">
                        <span>SALA: {room.code}</span>
                        <button
                          onClick={() => handleCopyCode(room.code)}
                          className="p-1 rounded bg-cyan-400/20 hover:bg-cyan-400/30 text-cyan-200 cursor-pointer"
                          title="Copiar Código de Sala"
                        >
                          {copiedCode === room.code ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">
                          {roomTrack.name} · {room.totalLaps} {room.totalLaps === 1 ? 'Vuelta' : 'Vueltas'}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Comparte el código <strong className="text-cyan-300 font-mono">{room.code}</strong> para que otros dispositivos se unan a la parrilla.
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => onlineClient.leaveRoom()}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 hover:text-rose-300 text-slate-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Salir de Sala
                    </button>
                  </div>

                  {/* HOST CIRCUIT & WEATHER SETTINGS */}
                  {isHost && (
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-[11px] font-bold text-amber-300">
                        ⚙️ Opciones de Anfitrión:
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={room.trackId}
                          onChange={(e) =>
                            onlineClient.updateRoomSettings({ trackId: e.target.value })
                          }
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-bold text-white"
                        >
                          {tracks.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>

                        <select
                          value={room.totalLaps}
                          onChange={(e) =>
                            onlineClient.updateRoomSettings({
                              totalLaps: Number(e.target.value)
                            })
                          }
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-bold text-amber-300"
                        >
                          <option value={1}>1 Vuelta</option>
                          <option value={2}>2 Vueltas</option>
                          <option value={3}>3 Vueltas</option>
                        </select>

                        <select
                          value={room.weather}
                          onChange={(e) =>
                            onlineClient.updateRoomSettings({
                              weather: e.target.value as WeatherCondition
                            })
                          }
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-bold text-cyan-300"
                        >
                          <option value="dry">☀️ Asfalto Seco</option>
                          <option value="rain">🌧️ Lluvia Wet GP</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* CONNECTED PILOTS GRID */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {room.players.map((pl, idx) => {
                      const reg = getRegionByCode(pl.regionCode);
                      const isMe = pl.id === onlineClient.clientId;
                      return (
                        <div
                          key={pl.id}
                          className={`p-3 rounded-xl border flex items-center justify-between ${
                            isMe
                              ? 'bg-slate-900 border-cyan-400/60'
                              : 'bg-slate-900/60 border-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/40"
                              style={{ backgroundColor: pl.color }}
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                                <span>
                                  P{idx + 1}. {pl.name}
                                </span>
                                {isMe && (
                                  <span className="text-[10px] font-mono bg-cyan-500/20 text-cyan-300 px-1.5 py-0.2 rounded">
                                    TÚ
                                  </span>
                                )}
                                {pl.id === room.hostId && (
                                  <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded">
                                    HOST
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                                <span>
                                  {reg.flag} {reg.name.split('·')[0].trim()}
                                </span>
                                <span>·</span>
                                <span className="text-slate-300 font-mono">
                                  {CAR_STATS[pl.carType]?.name || 'Grip F1'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                            CONECTADO
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* LAUNCH MULTIPLAYER RACE BUTTON */}
                  <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-2">
                    <span className="text-xs text-slate-400">
                      {room.players.length === 1
                        ? 'Puedes esperar a que entren más amigos con el código o iniciar ya (se completará la parrilla con IA F1).'
                        : `${room.players.length} dispositivos conectados listos para trazar su estrategia.`}
                    </span>

                    {isHost ? (
                      <button
                        onClick={() => {
                          audio.playBeep(880, 0.12, 'sine');
                          onlineClient.startOnlineDrawingPhase();
                        }}
                        className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 hover:from-amber-300 hover:to-rose-400 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        Iniciar GP Online en Todos los Dispositivos
                      </button>
                    ) : (
                      <div className="text-xs font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 px-3 py-2 rounded-xl">
                        Esperando a que el anfitrión inicie la fase de trazado...
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
