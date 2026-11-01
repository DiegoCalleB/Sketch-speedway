import React, { useState } from 'react';
import { GamePhase, Track, Player, CarType, CarStats, AIArchetype, RaceResultItem } from '../types';
import { motion } from 'motion/react';
import { Trophy, Users, Cpu, Sliders, Volume2, VolumeX, Play, RotateCcw, HelpCircle, Check, Flag, Car, Zap, Sparkles, Activity } from 'lucide-react';
import { audio } from '../utils/audio';
import { TelemetryLab } from './TelemetryLab';
import { useGameStore } from '../store/gameStore';

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
  onSetupPlayers: (playersSetup: { name: string; carType: CarType; isAI: boolean; aiArchetype?: AIArchetype }[]) => void;
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
  const [isMuted, setIsMuted] = useState(audio.getMuted());
  const [selectedAiArchetype, setSelectedAiArchetype] = useState<AIArchetype>('apex_master');
  const [resultsTab, setResultsTab] = useState<'podium' | 'telemetry'>('podium');
  
  // Local state for player registration form
  const [playersForm, setPlayersForm] = useState<{[key: number]: { name: string; carType: CarType }}>({
    0: { name: 'Jugador 1', carType: 'balanced' },
    1: { name: 'Jugador 2', carType: 'drifter' },
    2: { name: 'Jugador 3', carType: 'speedster' },
    3: { name: 'Jugador 4', carType: 'balanced' },
  });
  
  const [numPlayers, setNumPlayers] = useState(2); // for multiplayer local

  const handleMuteToggle = () => {
    const nextMute = audio.toggleMute();
    setIsMuted(nextMute);
  };

  const handleFormChange = (idx: number, field: 'name' | 'carType', value: string) => {
    setPlayersForm(prev => ({
      ...prev,
      [idx]: {
        ...prev[idx],
        [field]: value
      }
    }));
  };

  const handleStartSetup = () => {
    const list: { name: string; carType: CarType; isAI: boolean; aiArchetype?: AIArchetype }[] = [];
    
    if (gameMode === 'solo') {
      list.push({
        name: playersForm[0].name || 'Piloto Solo',
        carType: playersForm[0].carType,
        isAI: false
      });
    } else if (gameMode === 'ai') {
      list.push({
        name: playersForm[0].name || 'Jugador',
        carType: playersForm[0].carType,
        isAI: false
      });
      list.push({
        name: selectedAiArchetype === 'apex_master' ? 'Apex Master IA' : selectedAiArchetype === 'aggressive' ? 'Predator IA' : 'Guardian IA',
        carType: 'balanced',
        isAI: true,
        aiArchetype: selectedAiArchetype
      });
    } else {
      for (let i = 0; i < numPlayers; i++) {
        list.push({
          name: playersForm[i].name || `Jugador ${i + 1}`,
          carType: playersForm[i].carType,
          isAI: false
        });
      }
    }
    
    onSetupPlayers(list);
    audio.playBeep(440, 0.1, 'sine');
  };


  return (
    <div className="w-full flex flex-col gap-3 sm:gap-6" id="game-dashboard-ui">
      {/* HEADER / NAV PANEL */}
      <div className={`flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl shadow-lg transition-all ${
        (phase === 'drawing' || phase === 'racing') 
          ? 'p-2 sm:p-3 gap-2' 
          : 'p-4 gap-4'
      }`}>
        <div className="flex items-center gap-2 sm:gap-3">
          {!(phase === 'drawing' || phase === 'racing') && (
            <div className="p-2.5 bg-gradient-to-br from-amber-400 to-rose-500 rounded-lg text-slate-950 animate-pulse hidden sm:block">
              <Flag className="w-5 h-5" />
            </div>
          )}
          <div>
            <h1 className="font-sans font-extrabold text-sm sm:text-xl tracking-tight text-white flex items-center gap-1.5">
              DRAW RACE {!(phase === 'drawing' || phase === 'racing') && <span className="text-amber-400 text-xs bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded font-mono hidden sm:inline-block">CHAMPIONSHIP</span>}
            </h1>
            {!(phase === 'drawing' || phase === 'racing') && (
              <p className="text-slate-400 text-xs hidden sm:block">Dibuja tus trazadas, dosifica tu velocidad y gana la carrera</p>
            )}
          </div>
        </div>

        {/* Audio controls */}
        <button
          onClick={handleMuteToggle}
          className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
        >
          {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
          <span className="text-[10px] sm:text-xs font-mono font-bold">{isMuted ? 'MUTE' : 'SONIDO'}</span>
        </button>
      </div>

      {/* PHASE 1: CHOOSE TRACK & MODE */}
      {phase === 'menu' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fadeIn">
          {/* TRACK SELECTOR */}
          <div className="lg:col-span-7 flex flex-col gap-4 bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-lg">
            <h3 className="font-sans font-bold text-white text-base flex items-center gap-2 border-b border-slate-800 pb-2">
              <Sliders className="w-4.5 h-4.5 text-amber-400" />
              1. Selecciona el Circuito
            </h3>
            
            <div className="grid grid-cols-1 gap-3.5">
              {tracks.map((tk) => {
                const isSelected = tk.id === selectedTrack.id;
                const diffColor = tk.difficulty === 'Fácil' ? 'text-emerald-400 bg-emerald-400/10' : 
                                  tk.difficulty === 'Medio' ? 'text-amber-400 bg-amber-400/10' : 
                                  'text-rose-400 bg-rose-400/10';
                return (
                  <button
                    key={tk.id}
                    onClick={() => {
                      onSelectTrack(tk);
                      audio.playBeep(330, 0.08, 'sine');
                    }}
                    className={`flex flex-col sm:flex-row text-left p-4 rounded-xl border transition-all duration-200 cursor-pointer ${
                      isSelected 
                        ? 'bg-slate-800/80 border-amber-400/70 shadow-lg ring-1 ring-amber-400/20' 
                        : 'bg-slate-950/40 border-slate-800 hover:border-slate-700 hover:bg-slate-800/30'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white font-sans">{tk.name}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${diffColor}`}>
                          {tk.difficulty}
                        </span>
                      </div>
                      <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">{tk.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* GAME MODE SELECTOR */}
          <div className="lg:col-span-5 flex flex-col gap-4 bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-lg">
            <h3 className="font-sans font-bold text-white text-base flex items-center gap-2 border-b border-slate-800 pb-2">
              <Users className="w-4.5 h-4.5 text-amber-400" />
              2. Elige el Modo de Juego
            </h3>

            <div className="grid grid-cols-1 gap-3">
              {/* SOLO TIME TRIAL */}
              <button
                onClick={() => {
                  onSetGameMode('solo');
                  audio.playBeep(330, 0.08, 'sine');
                }}
                className={`flex items-center gap-4 p-4 rounded-xl border text-left transition-colors cursor-pointer ${
                  gameMode === 'solo' 
                    ? 'bg-slate-800/80 border-amber-400/70' 
                    : 'bg-slate-950/40 border-slate-800 hover:border-slate-700 hover:bg-slate-800/30'
                }`}
              >
                <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-lg">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm">Contrarreloj Solo</h4>
                  <p className="text-slate-400 text-[11px] mt-0.5">Dibuja, compite contra tu propio cronómetro y pule tu trazada ideal.</p>
                </div>
              </button>

              {/* VS AI */}
              <button
                onClick={() => {
                  onSetGameMode('ai');
                  audio.playBeep(330, 0.08, 'sine');
                }}
                className={`flex items-center gap-4 p-4 rounded-xl border text-left transition-colors cursor-pointer ${
                  gameMode === 'ai' 
                    ? 'bg-slate-800/80 border-amber-400/70' 
                    : 'bg-slate-950/40 border-slate-800 hover:border-slate-700 hover:bg-slate-800/30'
                }`}
              >
                <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-lg">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm">Contra la IA</h4>
                  <p className="text-slate-400 text-[11px] mt-0.5">Mídete a una Inteligencia Artificial que traza líneas de carreras perfectas.</p>
                </div>
              </button>

              {/* MULTIPLAYER PASS AND PLAY */}
              <button
                onClick={() => {
                  onSetGameMode('multiplayer');
                  audio.playBeep(330, 0.08, 'sine');
                }}
                className={`flex items-center gap-4 p-4 rounded-xl border text-left transition-colors cursor-pointer ${
                  gameMode === 'multiplayer' 
                    ? 'bg-slate-800/80 border-amber-400/70' 
                    : 'bg-slate-950/40 border-slate-800 hover:border-slate-700 hover:bg-slate-800/30'
                }`}
              >
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm">Pasa y Juega (Multijugador local)</h4>
                  <p className="text-slate-400 text-[11px] mt-0.5">De 2 a 4 amigos en el mismo dispositivo. Dibujáis por turnos y corréis juntos.</p>
                </div>
              </button>
            </div>

            {/* CONFIRM BUTTON */}
            <button
              onClick={() => {
                audio.playBeep(440, 0.1, 'sine');
                onRestart(); // Move to Car Selection screen
              }}
              className="mt-4 flex items-center justify-center gap-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-slate-950 font-bold py-3 px-6 rounded-xl shadow-lg transition-transform hover:scale-[1.02] cursor-pointer"
            >
              Configurar Pilotos
              <Play className="w-4 h-4 fill-slate-950" />
            </button>
          </div>
        </div>
      )}

      {/* PHASE 2: CAR SELECTION & PLAYER REGISTRATION */}
      {phase === 'car_selection' && (
        <div className="flex flex-col gap-6 bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-lg animate-fadeIn">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="font-sans font-bold text-white text-lg flex items-center gap-2">
              <Car className="w-5 h-5 text-amber-400" />
              Configuración de Pilotos y Vehículos
            </h3>
            <p className="text-slate-400 text-xs mt-1">Personaliza el nombre y selecciona el coche para cada piloto de la carrera.</p>
          </div>

          {gameMode === 'multiplayer' && (
            <div className="flex items-center gap-3 bg-slate-950/50 p-3 rounded-lg border border-slate-800">
              <span className="text-xs font-bold text-slate-300">Número de jugadores locales:</span>
              <div className="flex gap-1.5">
                {[2, 3, 4].map((num) => (
                  <button
                    key={num}
                    onClick={() => {
                      setNumPlayers(num);
                      audio.playBeep(261.63, 0.05, 'sine');
                    }}
                    className={`w-8 h-8 rounded-md font-mono font-bold text-xs flex items-center justify-center border transition-all ${
                      numPlayers === num 
                        ? 'bg-amber-400 text-slate-950 border-amber-400' 
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Render individual customization card per active player slot */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: gameMode === 'solo' ? 1 : gameMode === 'ai' ? 1 : numPlayers }).map((_, idx) => (
              <div key={idx} className="flex flex-col gap-3.5 bg-slate-950/40 border border-slate-800/80 p-4 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-amber-400 uppercase tracking-wider font-mono">Piloto #{idx + 1}</span>
                  <div className="flex gap-1">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: carStats[playersForm[idx].carType].color }} />
                    <span className="text-[10px] text-slate-400 capitalize font-mono">{playersForm[idx].carType}</span>
                  </div>
                </div>

                {/* Name Input */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10.5px] font-bold text-slate-400 uppercase">Nombre del Piloto</label>
                  <input
                    type="text"
                    maxLength={14}
                    value={playersForm[idx].name}
                    onChange={(e) => handleFormChange(idx, 'name', e.target.value)}
                    className="bg-slate-900 border border-slate-800 text-white rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-amber-400/50"
                  />
                </div>

                {/* Car Presets Grid */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10.5px] font-bold text-slate-400 uppercase">Selecciona tu Coche</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(carStats) as CarType[]).map((type) => {
                      const car = carStats[type];
                      const isSelected = playersForm[idx].carType === type;
                      return (
                        <button
                          key={type}
                          onClick={() => {
                            handleFormChange(idx, 'carType', type);
                            audio.playBeep(260 + (type === 'speedster' ? 150 : type === 'drifter' ? -50 : 0), 0.08, 'sine');
                          }}
                          className={`flex flex-col items-center justify-center p-2.5 rounded-lg border transition-all text-center cursor-pointer ${
                            isSelected 
                              ? 'bg-slate-800 border-amber-400' 
                              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <span className="w-4 h-4 rounded-full mb-1" style={{ backgroundColor: car.color }} />
                          <span className="text-[10px] font-bold text-white capitalize">{car.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Selected Car Stats Bar */}
                <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800/60 text-xs">
                  <p className="text-[10px] text-slate-300 leading-normal italic mb-2">"{carStats[playersForm[idx].carType].description}"</p>
                  
                  {/* Speed Stat */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-16 text-[9.5px] font-mono text-slate-400">Velocidad</span>
                    <div className="flex-1 h-1.5 bg-slate-950 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500 rounded-full" style={{ width: `${(carStats[playersForm[idx].carType].maxSpeed / 7.5) * 100}%` }} />
                    </div>
                  </div>

                  {/* Accel Stat */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-16 text-[9.5px] font-mono text-slate-400">Aceleración</span>
                    <div className="flex-1 h-1.5 bg-slate-950 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 rounded-full" style={{ width: `${(carStats[playersForm[idx].carType].acceleration / 0.25) * 100}%` }} />
                    </div>
                  </div>

                  {/* Grip/Drift Recovery Stat */}
                  <div className="flex items-center gap-2">
                    <span className="w-16 text-[9.5px] font-mono text-slate-400">Control Giro</span>
                    <div className="flex-1 h-1.5 bg-slate-950 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(carStats[playersForm[idx].carType].grip / 0.12) * 100}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* AI Opponent Card with Archetype Configuration */}
            {gameMode === 'ai' && (
              <div className="flex flex-col gap-3 bg-slate-950/40 border border-slate-800 p-4 rounded-xl">
                <div className="flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-cyan-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                    Personalidad del Agente IA (TFM)
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Selecciona el algoritmo heurístico de conducción para la IA oponente:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    {
                      id: 'apex_master' as AIArchetype,
                      title: 'Apex Master',
                      desc: 'Trazada de vértice tardío (Late Apex) y frenada geométrica óptima.',
                      color: 'border-cyan-500 text-cyan-400'
                    },
                    {
                      id: 'aggressive' as AIArchetype,
                      title: 'Predator (Agresivo)',
                      desc: 'Entradas fulgurantes a curva, rebufo tenaz y máximo paso por curva.',
                      color: 'border-rose-500 text-rose-400'
                    },
                    {
                      id: 'defensive' as AIArchetype,
                      title: 'Guardian (Defensivo)',
                      desc: 'Márgenes de seguridad amplios, cero derrapes y ritmo regular.',
                      color: 'border-emerald-500 text-emerald-400'
                    }
                  ].map((arch) => (
                    <button
                      key={arch.id}
                      type="button"
                      onClick={() => setSelectedAiArchetype(arch.id)}
                      className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                        selectedAiArchetype === arch.id
                          ? `bg-slate-800 ${arch.color} ring-1 ring-cyan-500/30`
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="text-xs font-bold">{arch.title}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">{arch.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-800 pt-4">
            <button
              onClick={() => onRestart()}
              className="px-5 py-2.5 rounded-xl border border-slate-800 text-slate-300 hover:bg-slate-800 text-xs font-bold cursor-pointer"
            >
              Atrás
            </button>
            <button
              onClick={handleStartSetup}
              className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold py-2.5 px-6 rounded-xl shadow-lg transition-transform hover:scale-[1.02] text-xs cursor-pointer"
            >
              Confirmar Pilotos
              <Check className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* PHASE 3: DRAWING STATE HUD (LIST OF WHO HAS DRAWN) */}
      {phase === 'drawing' && (
        <div className="flex flex-col gap-2.5 sm:gap-4 bg-slate-900 border border-slate-800 p-3 sm:p-5 rounded-xl shadow-lg animate-fadeIn">
          <div>
            <h3 className="font-sans font-bold text-white text-xs sm:text-base flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 text-amber-400" />
              Fase de Trazado
            </h3>
            <p className="text-slate-400 text-[10px] sm:text-xs mt-0.5 hidden sm:block">Cada jugador dibuja su trazada en orden. El circuito recordará la velocidad de tu dedo.</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {players.map((p, idx) => {
              const isCurrent = idx === activePlayerIndex;
              const hasDrawn = p.drawnPath.length > 0;
              const stats = carStats[p.carType];
              
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-1.5 p-1.5 sm:p-3 rounded-lg border transition-all ${
                    isCurrent 
                      ? 'bg-amber-400/10 border-amber-400/60 ring-1 ring-amber-400/20' 
                      : hasDrawn 
                        ? 'bg-slate-950/50 border-slate-800/80' 
                        : 'bg-slate-950/20 border-slate-900 opacity-50'
                  }`}
                >
                  <span className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 rounded-full shrink-0" style={{ backgroundColor: stats.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] sm:text-xs font-bold text-white truncate">{p.name}</p>
                    <p className="text-[9px] sm:text-[10px] text-slate-400 truncate">
                      {isCurrent ? '👉 Dibujando' : hasDrawn ? '✅ Listo' : '⏳ Esperando'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* If all players have completed their paths, reveal start button */}
          {players.every(p => p.drawnPath.length > 0 || p.isAI) && (
            <div className="flex justify-center border-t border-slate-800 pt-2.5 sm:pt-4 animate-bounce">
              <button
                onClick={() => {
                  audio.playBeep(880, 0.15, 'sine');
                  onStartRace();
                }}
                className="flex items-center gap-1.5 sm:gap-2.5 bg-gradient-to-r from-red-500 to-amber-500 hover:from-red-600 hover:to-amber-600 text-white font-extrabold py-2 px-4 sm:py-3.5 sm:px-8 rounded-xl shadow-xl transition-all hover:scale-[1.04] text-xs sm:text-base cursor-pointer"
              >
                🏁 ¡COMENZAR LA CARRERA!
                <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-white" />
              </button>
            </div>
          )}
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
          <div className="flex flex-col gap-5 bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-lg animate-fadeIn">
            <div className="border-b border-slate-800 pb-3 text-center">
              <Trophy className="w-12 h-12 text-amber-400 mx-auto mb-2 animate-bounce" />
              <h3 className="font-sans font-extrabold text-white text-xl">Resultados de la Competición</h3>
              <p className="text-slate-400 text-xs">Clasificación y tiempos de vuelta oficiales.</p>
            </div>

            <div className="flex flex-col gap-2.5 max-w-xl mx-auto w-full">
              {raceResults
                .sort((a, b) => {
                  if (a.disqualified) return 1;
                  if (b.disqualified) return -1;
                  return a.time - b.time;
                })
                .map((res, idx) => {
                  const player = players.find(p => p.id === res.playerId)!;
                  const stats = carStats[player.carType];
                  const displayTime = res.disqualified 
                    ? 'DESCALIFICADO' 
                    : `${(res.time / 1000).toFixed(2)}s`;

                  const medalBg = idx === 0 ? 'bg-amber-400 text-slate-950 font-extrabold' : 
                                  idx === 1 ? 'bg-slate-300 text-slate-950 font-bold' : 
                                  idx === 2 ? 'bg-amber-700 text-white font-bold' : 
                                  'bg-slate-800 text-slate-400';

                  return (
                    <div
                      key={res.playerId}
                      className="flex items-center justify-between p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono ${medalBg}`}>
                          {idx + 1}
                        </div>
                        <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: stats.color }} />
                        <span className="font-bold text-white text-sm">{player.name}</span>
                        {player.isAI && (
                          <span className="text-[9px] bg-cyan-400/10 text-cyan-400 border border-cyan-400/20 px-1.5 py-0.5 rounded font-mono">
                            IA: {player.aiArchetype || 'Equilibrada'}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4">
                        {res.performanceScore !== undefined && (
                          <span className="text-[10px] font-mono text-emerald-400 hidden sm:inline">
                            Precisión: {res.performanceScore}%
                          </span>
                        )}
                        <span className="font-mono text-xs text-slate-400">Tiempo:</span>
                        <span className={`font-mono text-sm font-bold ${idx === 0 && !res.disqualified ? 'text-amber-400' : res.disqualified ? 'text-rose-500' : 'text-slate-200'}`}>
                          {displayTime}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 border-t border-slate-800 pt-4">
              <button
                onClick={() => {
                  audio.playBeep(600, 0.1, 'sine');
                  setResultsTab('telemetry');
                }}
                className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold py-2.5 px-5 rounded-xl cursor-pointer shadow-lg transition-transform hover:scale-[1.02]"
              >
                <Activity className="w-4 h-4" />
                Abrir Apex Telemetry Lab (TFM)
              </button>

              <button
                onClick={() => {
                  audio.playBeep(440, 0.1, 'sine');
                  onRestart();
                }}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2.5 px-5 rounded-xl cursor-pointer transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Volver a Jugar
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
};

