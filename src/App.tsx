import { useEffect } from 'react';
import { useGameStore, CAR_STATS } from './store/gameStore';
import { TRACKS } from './utils/tracks';
import { GameCanvas } from './components/GameCanvas';
import { GameUI } from './components/GameUI';
import { audio } from './utils/audio';

export default function App() {
  const {
    phase,
    selectedTrack,
    gameMode,
    players,
    activePlayerIndex,
    raceResults,
    setPhase,
    setSelectedTrack,
    setGameMode,
    setupPlayers,
    setDrawnPath,
    setRaceResults,
    restartGame
  } = useGameStore();

  useEffect(() => {
    const playIntro = () => {
      audio.playBeep(523.25, 0.08, 'sine');
      audio.playBeep(659.25, 0.08, 'sine');
      audio.playBeep(783.99, 0.15, 'sine');
    };
    
    window.addEventListener('pointerdown', playIntro, { once: true });
    return () => {
      window.removeEventListener('pointerdown', playIntro);
    };
  }, []);

  const handleRestart = () => {
    restartGame();
  };

  const handleGoToCarSelection = () => {
    setPhase('car_selection');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-3 px-3 md:py-6 md:px-8 flex flex-col items-center justify-start gap-3 sm:gap-6 font-sans">
      <div className="w-full max-w-5xl flex flex-col gap-3 sm:gap-6">
        
        <GameUI
          phase={phase}
          tracks={TRACKS}
          selectedTrack={selectedTrack}
          players={players}
          carStats={CAR_STATS}
          activePlayerIndex={activePlayerIndex}
          gameMode={gameMode}
          onSelectTrack={setSelectedTrack}
          onSetGameMode={setGameMode}
          onSetupPlayers={setupPlayers}
          onStartDrawing={() => setPhase('drawing')}
          onStartRace={() => setPhase('racing')}
          raceResults={raceResults}
          onRestart={phase === 'menu' ? handleGoToCarSelection : handleRestart}
        />

        {(phase === 'drawing' || phase === 'racing') && (
          <GameCanvas
            track={selectedTrack}
            players={players}
            carStats={CAR_STATS}
            activePlayerIndex={activePlayerIndex}
            phase={phase === 'drawing' ? 'drawing' : 'racing'}
            onPathDrawn={setDrawnPath}
            onRaceFinished={(results) => {
              setRaceResults(results);
              setPhase('results');
            }}
            onRestart={handleRestart}
          />
        )}

        <div className="text-center text-[11px] text-slate-500 font-mono mt-2" id="footer-credits">
          ApexAI Racing Lab · Simulación Cinemática y Optimización de Trazadas con Inteligencia Artificial · TFM
        </div>
      </div>
    </div>
  );
}
