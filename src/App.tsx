import { useEffect } from 'react';
import { useGameStore, CAR_STATS } from './store/gameStore';
import { TRACKS } from './utils/tracks';
import { GameCanvas } from './components/GameCanvas';
import { GameUI } from './components/GameUI';
import { OfflineIndicator } from './components/PWAControls';
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

  // Synchronously unlock WebAudio on the very first touch/click so iPhone Safari & Android Chrome play F1 engine audio reliably
  useEffect(() => {
    const unlockAudio = () => {
      audio.unlockForMobile();
    };
    window.addEventListener('touchstart', unlockAudio, { passive: true, once: true });
    window.addEventListener('pointerdown', unlockAudio, { passive: true, once: true });
    return () => {
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('pointerdown', unlockAudio);
    };
  }, []);

  const handleRestart = () => {
    restartGame();
  };

  const handleGoToCarSelection = () => {
    setPhase('car_selection');
  };

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100 pt-safe pb-safe px-2 sm:py-3 sm:px-5 md:py-4 md:px-6 flex flex-col items-center justify-start gap-2 sm:gap-3 font-sans">
      <div className="w-full max-w-5xl flex flex-col gap-2 sm:gap-3">
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
            onStartRace={() => setPhase('racing')}
            onRaceFinished={(results) => {
              setRaceResults(results);
              setPhase('results');
            }}
            onRestart={handleRestart}
          />
        )}

        {phase === 'menu' && (
          <div className="text-center text-[10px] text-slate-500 font-mono pb-1" id="footer-credits">
            Draw Race · Campeonato F1 3D · Android & iPhone Ready
          </div>
        )}
      </div>

      <OfflineIndicator />
    </div>
  );
}
