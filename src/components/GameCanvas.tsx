import React, { useRef, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { Point, Track, Player, RaceCarState, Particle, CarStats, TelemetrySample, PlayerTelemetry, RaceResultItem } from '../types';
import { isPointInPolygon, checkSegmentCrossing, getDistance, generateAIPath, computeTelemetryEvaluation } from '../utils/tracks';
import { useGameStore } from '../store/gameStore';
import { audio } from '../utils/audio';
import { Play, RotateCcw, AlertCircle, HelpCircle, Maximize2, Minimize2, CheckCircle2, Flag, Zap, Trophy, Gauge, Video, Camera } from 'lucide-react';

// Import our newly created high-end modular 3D components
import { TrackMesh } from './ThreeGame/TrackMesh';
import { Environment3D } from './ThreeGame/Environment3D';
import { Car3D } from './ThreeGame/Car3D';
import { GlowingSpline } from './ThreeGame/GlowingSpline';
import { SmokeParticles } from './ThreeGame/SmokeParticles';
import { Skidmarks3D } from './ThreeGame/Skidmarks3D';
import { CameraDirector } from './ThreeGame/CameraDirector';

import * as THREE from 'three';

interface GameCanvasProps {
  track: Track;
  players: Player[];
  carStats: Record<string, CarStats>;
  activePlayerIndex: number;
  phase: 'drawing' | 'racing';
  onPathDrawn: (playerId: string, path: Point[]) => void;
  onRaceFinished: (results: RaceResultItem[]) => void;
  onRestart: () => void;
}


function findSegmentIntersection(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number }
): { x: number; y: number } | null {
  const det = (a2.x - a1.x) * (b2.y - b1.y) - (b2.x - b1.x) * (a2.y - a1.y);
  if (det === 0) return null;

  const lambda = ((b2.y - b1.y) * (b2.x - a1.x) + (b1.x - b2.x) * (b2.y - a1.y)) / det;
  const gamma = ((a1.y - a2.y) * (b2.x - a1.x) + (a2.x - a1.x) * (b2.y - a1.y)) / det;

  if (0 <= lambda && lambda <= 1 && 0 <= gamma && gamma <= 1) {
    return {
      x: a1.x + lambda * (a2.x - a1.x),
      y: a1.y + lambda * (a2.y - a1.y)
    };
  }
  return null;
}

// Orbiting Daylight Sun component to cast rotating soft shadows
const OrbitingDaylightSun = () => {
  const sunRef = useRef<THREE.DirectionalLight>(null);

  // Time is simulated or bound to the clock to slowly orbit
  // This satisfies: "reflejar la luz del sol dinámicamente según la hora del día"
  // We'll calculate a slow orbiting angle using useFrame
  React.useEffect(() => {
    let frameId = 0;
    const tick = () => {
      if (sunRef.current) {
        const elapsed = Date.now() * 0.0003; // slow orbit speed
        const radius = 350;
        const x = 400 + Math.cos(elapsed) * radius;
        const y = 250 + Math.sin(elapsed) * radius;
        sunRef.current.position.set(x, y, 320);
        sunRef.current.target.position.set(400, 250, 0);
        sunRef.current.target.updateMatrixWorld();
      }
      frameId = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <directionalLight
      ref={sunRef}
      intensity={1.4}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-420}
      shadow-camera-right={420}
      shadow-camera-top={320}
      shadow-camera-bottom={-320}
      shadow-camera-near={0.5}
      shadow-camera-far={1000}
      shadow-bias={-0.0005}
    />
  );
};

export const GameCanvas: React.FC<GameCanvasProps> = ({
  track,
  players,
  carStats,
  activePlayerIndex,
  phase,
  onPathDrawn,
  onRaceFinished,
  onRestart,
}) => {
  // Drawing states
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawnPoints, setHasDrawnPoints] = useState(false);
  const [activeSpeed, setActiveSpeed] = useState<number | null>(null);
  const [drawingError, setDrawingError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(true);
  const [isVirtualFullscreen, setIsVirtualFullscreen] = useState(false);
  const [countdownValue, setCountdownValue] = useState<string | null>(null);
  const [drawingSectorProgress, setDrawingSectorProgress] = useState(0);
  const [cameraMode, setCameraMode] = useState<'chase' | 'tv'>('chase');

  // Escape key listener for virtual fullscreen mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isVirtualFullscreen) {
        setIsVirtualFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVirtualFullscreen]);

  // Core drawing vectors
  const [drawnPoints, setDrawnPoints] = useState<Point[]>([]);
  const drawnPointsRef = useRef<Point[]>([]);

  // Simulation physics reactive states
  const [activeCars, setActiveCars] = useState<RaceCarState[]>([]);
  const [skidmarks, setSkidmarks] = useState<{ x: number; y: number; color: string; alpha: number }[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);

  // Simulation refs for loop synchronization
  const carsStateRef = useRef<RaceCarState[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const skidmarksRef = useRef<{ x: number; y: number; color: string; alpha: number }[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const raceStartTimeRef = useRef<number>(0);
  const isRacingRef = useRef<boolean>(false);
  const simulationTickRef = useRef<number>(0);
  const telemetrySamplesRef = useRef<Record<string, TelemetrySample[]>>({});
  const finishCountdownTimerRef = useRef<any>(null);

  const activePlayer = players[activePlayerIndex];
  const gridPos = track.startGrid[activePlayerIndex] || track.startGrid[0];

  const getSpeedColor = (speed: number) => {
    if (speed < 2) return '#38bdf8'; // Sky Blue
    if (speed < 4) return '#22c55e'; // Green
    if (speed < 5.5) return '#eab308'; // Yellow
    return '#ef4444'; // Red
  };

  const getSpeedLabel = (speed: number) => {
    if (speed < 2) return 'Muy Lento (Seguro)';
    if (speed < 4) return 'Lento (Curvas)';
    if (speed < 5.5) return 'Rápido (Media recta)';
    return '¡A Tope! (Recta)';
  };

  // Countdown and Racing loop hooks
  useEffect(() => {
    if (phase === 'racing') {
      startRaceCountdown();
    }
    return () => {
      isRacingRef.current = false;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (finishCountdownTimerRef.current) clearTimeout(finishCountdownTimerRef.current);
      audio.stopAll();
    };
  }, [phase, track, players]);

  const startRaceCountdown = async () => {
    isRacingRef.current = false;
    audio.stopAll();
    simulationTickRef.current = 0;
    telemetrySamplesRef.current = {};
    if (finishCountdownTimerRef.current) clearTimeout(finishCountdownTimerRef.current);

    // Setup initial physical states
    const initialCars: RaceCarState[] = players.map((p, idx) => {
      const grid = track.startGrid[idx] || track.startGrid[0];
      return {
        playerId: p.id,
        x: grid.x,
        y: grid.y,
        vx: 0,
        vy: 0,
        angle: grid.angle,
        targetIndex: 0,
        isDrifting: false,
        driftAngle: 0,
        offTrack: false,
        finished: p.isAI ? false : p.drawnPath.length === 0,
        disqualified: false,
        timeFinished: null,
        checkpointPassed: -1,
        lap: 1,
        bounceCooldown: 0,
        slipstreamActive: false,
      };
    });

    carsStateRef.current = initialCars;
    particlesRef.current = [];
    skidmarksRef.current = [];
    setActiveCars([...initialCars]);
    setParticles([]);
    setSkidmarks([]);

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    for (let count = 3; count > 0; count--) {
      setCountdownValue(count.toString());
      audio.playCountdownTick();
      await delay(900);
    }
    
    setCountdownValue('¡YA!');
    audio.playCountdownGo();
    raceStartTimeRef.current = Date.now();
    isRacingRef.current = true;
    
    players.forEach(p => {
      audio.startEngine(p.id);
    });

    setTimeout(() => {
      setCountdownValue(null);
    }, 850);

    runSimulationLoop();
  };

  const runSimulationLoop = () => {
    if (!isRacingRef.current) return;
    
    simulationTickRef.current++;
    updateSimulationPhysics();

    // Copy physics refs to states for high performance reactive R3F binding
    setActiveCars([...carsStateRef.current]);
    setParticles([...particlesRef.current]);
    setSkidmarks([...skidmarksRef.current]);

    // Safety timeout: If leader finishes or 28 seconds elapse, auto-complete lagging cars smoothly
    const elapsed = Date.now() - raceStartTimeRef.current;
    const finishedCount = carsStateRef.current.filter(c => c.finished).length;
    
    if (finishedCount >= Math.min(2, players.length) && !finishCountdownTimerRef.current) {
      finishCountdownTimerRef.current = setTimeout(() => {
        carsStateRef.current.forEach(c => {
          if (!c.finished && !c.disqualified) {
            c.finished = true;
            c.timeFinished = c.timeFinished || (Date.now() - raceStartTimeRef.current);
          }
        });
      }, 4000);
    }

    if (elapsed > 30000) {
      carsStateRef.current.forEach(c => {
        if (!c.finished && !c.disqualified) {
          c.finished = true;
          c.timeFinished = c.timeFinished || elapsed;
        }
      });
    }

    const allDone = carsStateRef.current.every(c => c.finished || c.disqualified);
    if (allDone) {
      isRacingRef.current = false;
      if (finishCountdownTimerRef.current) clearTimeout(finishCountdownTimerRef.current);
      audio.stopAll();
      audio.playVictoryJingle();

      // Compute academic telemetry evaluation per player
      const telemetryMap: Record<string, PlayerTelemetry> = {};
      players.forEach((p) => {
        const evalMetrics = computeTelemetryEvaluation(p.drawnPath, track);
        const samples = telemetrySamplesRef.current[p.id] || [];
        telemetryMap[p.id] = {
          playerId: p.id,
          playerName: p.name,
          color: carStats[p.carType].color,
          carType: p.carType,
          samples,
          apexScore: evalMetrics.apexScore,
          smoothnessScore: evalMetrics.smoothnessScore,
          avgSpeed: evalMetrics.avgSpeed,
          maxSpeed: evalMetrics.maxSpeed,
          maxLateralG: evalMetrics.maxLateralG,
        };
      });

      useGameStore.getState().setTelemetries(telemetryMap);
      
      const finalResults: RaceResultItem[] = carsStateRef.current.map(c => {
        const pTel = telemetryMap[c.playerId];
        return {
          playerId: c.playerId,
          finished: c.finished,
          time: c.timeFinished || 999999,
          disqualified: c.disqualified,
          telemetry: pTel?.samples,
          performanceScore: pTel ? Math.round((pTel.apexScore + pTel.smoothnessScore) / 2) : 80
        };
      });

      onRaceFinished(finalResults);
      return;
    }

    animationFrameRef.current = requestAnimationFrame(runSimulationLoop);
  };

  const updateSimulationPhysics = () => {
    const cars = carsStateRef.current;
    const active_particles = particlesRef.current;
    const active_skidmarks = skidmarksRef.current;
    const tick = simulationTickRef.current;

    cars.forEach((car, carIdx) => {
      if (car.finished || car.disqualified) {
        audio.stopEngine(car.playerId);
        audio.stopScreech(car.playerId);
        return;
      }

      const player = players.find(p => p.id === car.playerId)!;
      let path = player.drawnPath;

      if (player.isAI && path.length === 0) {
        player.drawnPath = generateAIPath(track, 320, player.aiArchetype || 'apex_master', carIdx);
        path = player.drawnPath;
      }

      if (path.length === 0) {
        car.disqualified = true;
        return;
      }

      const stats = carStats[player.carType];
      
      let targetIdx = car.targetIndex;
      if (targetIdx >= path.length) {
        car.finished = true;
        car.timeFinished = car.timeFinished || (Date.now() - raceStartTimeRef.current);
        return;
      }

      let targetPt = path[targetIdx];
      let distanceToTarget = Math.hypot(targetPt.x - car.x, targetPt.y - car.y);

      // Robust check to finish when reaching the end of the path
      if (targetIdx === path.length - 1) {
        const speed = Math.hypot(car.vx, car.vy);
        if (distanceToTarget < 18 || speed < 0.3) {
          car.finished = true;
          car.timeFinished = car.timeFinished || (Date.now() - raceStartTimeRef.current);
          return;
        }
      }

      while (distanceToTarget < 14 && targetIdx < path.length - 1) {
        targetIdx++;
        targetPt = path[targetIdx];
        distanceToTarget = Math.hypot(targetPt.x - car.x, targetPt.y - car.y);
      }
      car.targetIndex = targetIdx;

      const dx = targetPt.x - car.x;
      const dy = targetPt.y - car.y;
      const targetAngle = Math.atan2(dy, dx);

      let targetSpeed = targetPt.speed;

      // Aerodynamic Slipstream (Rebufo): Check if drafting within 48px behind an opponent
      let slipstreamActive = false;
      cars.forEach((otherCar, oIdx) => {
        if (carIdx !== oIdx && !otherCar.finished && !otherCar.disqualified) {
          const dX = otherCar.x - car.x;
          const dY = otherCar.y - car.y;
          const dist = Math.hypot(dX, dY);
          if (dist > 14 && dist < 50) {
            const headingToOther = Math.atan2(dY, dX);
            let diffHead = Math.abs(headingToOther - car.angle);
            if (diffHead > Math.PI) diffHead = Math.PI * 2 - diffHead;
            if (diffHead < 0.6) {
              slipstreamActive = true;
            }
          }
        }
      });
      car.slipstreamActive = slipstreamActive;

      if (slipstreamActive) {
        targetSpeed *= 1.14; // 14% speed boost when in the slipstream pocket
        if (Math.random() < 0.25) {
          active_particles.push({
            x: car.x - Math.cos(car.angle) * 10,
            y: car.y - Math.sin(car.angle) * 10,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
            color: '#38bdf8',
            size: 2,
            alpha: 0.7,
            life: 0,
            maxLife: 10
          });
        }
      }

      const pointInAsphalt = isPointInPolygon({ x: car.x, y: car.y }, track.outerBoundary) && 
                            !isPointInPolygon({ x: car.x, y: car.y }, track.innerBoundary);
      
      car.offTrack = !pointInAsphalt;

      if (car.offTrack) {
        targetSpeed = Math.min(1.4, targetSpeed * 0.35);
      }

      const activeMaxSpeed = stats.maxSpeed * (car.offTrack ? 0.35 : 1.0) * (slipstreamActive ? 1.12 : 1.0);
      targetSpeed = Math.min(targetSpeed, activeMaxSpeed);

      const targetVx = Math.cos(targetAngle) * targetSpeed;
      const targetVy = Math.sin(targetAngle) * targetSpeed;

      const accelRate = car.offTrack ? 0.06 : stats.acceleration;
      
      car.vx += (targetVx - car.vx) * accelRate;
      car.vy += (targetVy - car.vy) * accelRate;

      const currentSpeed = Math.hypot(car.vx, car.vy);


      const velocityAngle = Math.atan2(car.vy, car.vx);
      const pathAngle = targetAngle;
      
      let angleDiff = Math.abs(pathAngle - velocityAngle);
      if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;

      const physicalCentrifugalForce = angleDiff * currentSpeed;
      const driftThreshold = stats.grip; 
      const isDriftingNow = physicalCentrifugalForce > driftThreshold && !car.offTrack;

      car.isDrifting = isDriftingNow;

      if (isDriftingNow) {
        const driftFactor = 0.85 - (stats.driftRecovery * 0.15);
        car.vx = car.vx * driftFactor + Math.cos(velocityAngle) * currentSpeed * (1 - driftFactor);
        car.vy = car.vy * driftFactor + Math.sin(velocityAngle) * currentSpeed * (1 - driftFactor);

        car.angle = velocityAngle + (Math.sin(Date.now() / 40) * 0.25);

        if (Math.random() < 0.6) {
          active_particles.push({
            x: car.x - Math.cos(velocityAngle) * 8,
            y: car.y - Math.sin(velocityAngle) * 8,
            vx: (Math.random() - 0.5) * 0.6 - car.vx * 0.1,
            vy: (Math.random() - 0.5) * 0.6 - car.vy * 0.1,
            color: 'rgba(200, 200, 200, 0.45)',
            size: Math.random() * 5 + 3,
            alpha: 0.6,
            life: 0,
            maxLife: Math.random() * 25 + 15,
          });
        }

        active_skidmarks.push({
          x: car.x,
          y: car.y,
          color: 'rgba(0, 0, 0, 0.35)',
          alpha: 0.35,
        });

        audio.updateScreech(car.playerId, physicalCentrifugalForce * 1.5);
      } else {
        car.angle = velocityAngle;
        audio.updateScreech(car.playerId, 0);

        if (car.offTrack && currentSpeed > 0.4) {
          if (Math.random() < 0.4) {
            active_particles.push({
              x: car.x,
              y: car.y,
              vx: (Math.random() - 0.5) * 1.5 - car.vx * 0.2,
              vy: (Math.random() - 0.5) * 1.5 - car.vy * 0.2,
              color: '#34d399',
              size: Math.random() * 2.5 + 1.5,
              alpha: 0.8,
              life: 0,
              maxLife: Math.random() * 15 + 10,
            });
          }
        }
      }

      audio.updateEngine(car.playerId, currentSpeed / 5, car.offTrack);

      if (car.bounceCooldown > 0) {
        car.bounceCooldown--;
      }

      const oldX = car.x;
      const oldY = car.y;
      car.x += car.vx;
      car.y += car.vy;

      // Wall collision and asphalt check
      const currentInAsphalt = isPointInPolygon({ x: car.x, y: car.y }, track.outerBoundary) && 
                             !isPointInPolygon({ x: car.x, y: car.y }, track.innerBoundary);

      if (!currentInAsphalt && car.bounceCooldown === 0) {
        const hitOuter = !isPointInPolygon({ x: car.x, y: car.y }, track.outerBoundary);
        const hitInner = isPointInPolygon({ x: car.x, y: car.y }, track.innerBoundary);

        if (hitOuter || hitInner) {
          car.x = oldX;
          car.y = oldY;

          // Realign velocity towards the next target waypoint on the path
          const toTargetX = targetPt.x - car.x;
          const toTargetY = targetPt.y - car.y;
          const len = Math.hypot(toTargetX, toTargetY) || 1;
          const reboundSpeed = Math.max(1.2, Math.min(2.5, currentSpeed * 0.5));
          car.vx = (toTargetX / len) * reboundSpeed;
          car.vy = (toTargetY / len) * reboundSpeed;

          car.bounceCooldown = 16;

          audio.playCrash();

          for (let pIdx = 0; pIdx < 12; pIdx++) {
            active_particles.push({
              x: car.x,
              y: car.y,
              vx: (Math.random() - 0.5) * 4 + car.vx,
              vy: (Math.random() - 0.5) * 4 + car.vy,
              color: '#fbbf24',
              size: Math.random() * 3 + 2,
              alpha: 1,
              life: 0,
              maxLife: Math.random() * 20 + 10,
            });
          }
        }
      }

      // Car-to-car proximity collision
      cars.forEach((otherCar, otherIdx) => {
        if (carIdx !== otherIdx && !otherCar.finished && !otherCar.disqualified) {
          const cDist = Math.hypot(car.x - otherCar.x, car.y - otherCar.y);
          if (cDist < 14 && cDist > 0.01) {
            const pushX = (car.x - otherCar.x) / cDist;
            const pushY = (car.y - otherCar.y) / cDist;
            car.x += pushX * 1.2;
            car.y += pushY * 1.2;
            otherCar.x -= pushX * 1.2;
            otherCar.y -= pushY * 1.2;

            if (Math.random() < 0.25) {
              active_particles.push({
                x: (car.x + otherCar.x) / 2,
                y: (car.y + otherCar.y) / 2,
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2,
                color: '#fbbf24',
                size: 2.5,
                alpha: 1,
                life: 0,
                maxLife: 12,
              });
            }
          }
        }
      });

      // Checkpoint passing detection
      const nextCpIdx = (car.checkpointPassed + 1) % track.checkpoints.length;
      const targetCp = track.checkpoints[nextCpIdx];

      if (checkSegmentCrossing({ x: oldX, y: oldY }, { x: car.x, y: car.y }, targetCp)) {
        car.checkpointPassed = nextCpIdx;
        audio.playBeep(659.25, 0.05, 'triangle');
      }

      // Start/Finish line crossing detection
      if (checkSegmentCrossing({ x: oldX, y: oldY }, { x: car.x, y: car.y }, track.startLine)) {
        if (car.checkpointPassed === track.checkpoints.length - 1) {
          car.finished = true;
          car.timeFinished = Date.now() - raceStartTimeRef.current;
          audio.playBeep(1046.50, 0.25, 'sine');
        }
      }

      // Telemetry sampling (sampled every 5 simulation ticks for academic fidelity)
      if (tick % 5 === 0) {
        if (!telemetrySamplesRef.current[car.playerId]) {
          telemetrySamplesRef.current[car.playerId] = [];
        }
        const latG = (currentSpeed * currentSpeed * angleDiff) / 10;
        const lapProg = path.length > 0 ? Math.min(1.0, car.targetIndex / path.length) : 0;
        telemetrySamplesRef.current[car.playerId].push({
          timestamp: Date.now() - raceStartTimeRef.current,
          x: Math.round(car.x),
          y: Math.round(car.y),
          speed: Number(currentSpeed.toFixed(2)),
          lateralG: Number(Math.min(3.5, latG).toFixed(2)),
          longitudinalG: Number((car.vx * 0.1).toFixed(2)),
          isDrifting: isDriftingNow,
          slipstreamActive,
          distToCenterline: 0,
          lapProgress: Number(lapProg.toFixed(3))
        });
      }
    });

    for (let i = active_particles.length - 1; i >= 0; i--) {
      const p = active_particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life++;
      p.alpha = 1 - (p.life / p.maxLife);
      if (p.life >= p.maxLife) {
        active_particles.splice(i, 1);
      }
    }

    if (active_skidmarks.length > 500) {
      active_skidmarks.shift();
    }
  };

  // --- HTML DRAWING GESTURE CAPTURE OVERLAY ---
  const handlePointerDown = (e: React.PointerEvent<any>) => {
    if (phase !== 'drawing' || !activePlayer) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * track.width;
    const y = ((e.clientY - rect.top) / rect.height) * track.height;

    const startDist = Math.hypot(x - gridPos.x, y - gridPos.y);
    
    if (startDist > 55) {
      setDrawingError('Debes empezar a dibujar EXACTAMENTE desde tu coche parpadeante.');
      audio.playBeep(220, 0.15, 'square');
      return;
    }

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
      console.warn(err);
    }

    setDrawingError(null);
    setIsDrawing(true);
    setDrawingSectorProgress(0);
    
    const firstPoint: Point = { x: gridPos.x, y: gridPos.y, t: Date.now(), speed: 1.5 };
    drawnPointsRef.current = [firstPoint];
    setDrawnPoints([firstPoint]);
    setHasDrawnPoints(true);
    setActiveSpeed(1.5);
    
    audio.playBeep(523.25, 0.08, 'sine');
  };

  const handlePointerMove = (e: React.PointerEvent<any>) => {
    if (!isDrawing || phase !== 'drawing' || !activePlayer) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(track.width, ((e.clientX - rect.left) / rect.width) * track.width));
    const y = Math.max(0, Math.min(track.height, ((e.clientY - rect.top) / rect.height) * track.height));

    const now = Date.now();
    const activePath = drawnPointsRef.current;
    if (activePath.length === 0) return;
    
    const lastPt = activePath[activePath.length - 1];
    
    const dist = Math.hypot(x - lastPt.x, y - lastPt.y);
    if (dist < 3.5) return;

    const dt = now - lastPt.t;
    const rawSpeed = dt > 0 ? (dist / dt) * 16 : 1.5;

    const alpha = 0.25;
    const smoothedSpeed = lastPt.speed * (1 - alpha) + rawSpeed * alpha;
    const clampedSpeed = Math.max(0.8, Math.min(7.5, smoothedSpeed));

    if (Math.random() < 0.15) {
      audio.playBeep(200 + clampedSpeed * 80, 0.02, 'sine');
    }

    const newPoint: Point = { x, y, t: now, speed: clampedSpeed };
    activePath.push(newPoint);
    setDrawnPoints([...activePath]);

    // Track sector checkpoint progress dynamically
    if (drawingSectorProgress < track.checkpoints.length) {
      const targetCp = track.checkpoints[drawingSectorProgress];
      if (checkSegmentCrossing(lastPt, newPoint, targetCp)) {
        const nextSector = drawingSectorProgress + 1;
        setDrawingSectorProgress(nextSector);
        audio.playBeep(650 + nextSector * 70, 0.08, 'triangle');
      }
    }

    const lastLabel = getSpeedLabel(lastPt.speed);
    const newLabel = getSpeedLabel(clampedSpeed);
    if (lastLabel !== newLabel) {
      setActiveSpeed(clampedSpeed);
    }
  };

  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    const activePath = drawnPointsRef.current;

    if (activePath.length < 15) {
      setDrawingError('La trazada es demasiado corta. Dibuja un recorrido completo alrededor de la pista.');
      drawnPointsRef.current = [];
      setDrawnPoints([]);
      setHasDrawnPoints(false);
      setActiveSpeed(null);
      setDrawingSectorProgress(0);
      return;
    }

    let cpProgress = 0;
    let lastCpIdx = 0;
    
    for (let i = 1; i < activePath.length; i++) {
      const p1 = activePath[i - 1];
      const p2 = activePath[i];
      
      const currentCp = track.checkpoints[cpProgress];
      if (currentCp && checkSegmentCrossing(p1, p2, currentCp)) {
        cpProgress++;
        lastCpIdx = i;
      }
    }

    const requiredCps = track.checkpoints.length;
    
    if (cpProgress < requiredCps) {
      setDrawingError(`¡Trazada incompleta! Debes pasar por todos los sectores (${cpProgress}/${requiredCps} puntos de control alcanzados). Sigue el circuito.`);
      audio.playBeep(180, 0.25, 'triangle');
      drawnPointsRef.current = [];
      setDrawnPoints([]);
      setHasDrawnPoints(false);
      setActiveSpeed(null);
      setDrawingSectorProgress(0);
      return;
    }

    let finishSegment: [Point, Point] | null = null;
    for (let i = Math.max(1, lastCpIdx); i < activePath.length; i++) {
      const p1 = activePath[i - 1];
      const p2 = activePath[i];
      if (checkSegmentCrossing(p1, p2, track.startLine)) {
        finishSegment = [p1, p2];
        break;
      }
    }

    if (!finishSegment) {
      setDrawingError('Debes cruzar de nuevo la línea de meta para registrar y cerrar la vuelta.');
      audio.playBeep(180, 0.25, 'triangle');
      drawnPointsRef.current = [];
      setDrawnPoints([]);
      setHasDrawnPoints(false);
      setActiveSpeed(null);
      setDrawingSectorProgress(0);
      return;
    }

    const fP1 = finishSegment[0];
    const fP2 = finishSegment[1];
    const intersection = findSegmentIntersection(fP1, fP2, track.startLine.p1, track.startLine.p2);

    if (intersection) {
      const onAsphalt = isPointInPolygon(intersection, track.outerBoundary) && 
                         !isPointInPolygon(intersection, track.innerBoundary);
      if (!onAsphalt) {
        setDrawingError('¡Trazada inválida! Has cruzado la meta por fuera de los límites de la pista (por el césped).');
        audio.playBeep(180, 0.25, 'triangle');
        drawnPointsRef.current = [];
        setDrawnPoints([]);
        setHasDrawnPoints(false);
        setActiveSpeed(null);
        setDrawingSectorProgress(0);
        return;
      }

      const gridAngle = track.startGrid[0].angle;
      const drawVec = { x: fP2.x - fP1.x, y: fP2.y - fP1.y };
      const gridVec = { x: Math.cos(gridAngle), y: Math.sin(gridAngle) };
      const dot = drawVec.x * gridVec.x + drawVec.y * gridVec.y;

      if (dot < 0) {
        setDrawingError('¡Dirección contraria! Estás cruzando la meta al revés. Debes recorrer la pista en el sentido de la carrera.');
        audio.playBeep(180, 0.25, 'triangle');
        drawnPointsRef.current = [];
        setDrawnPoints([]);
        setHasDrawnPoints(false);
        setActiveSpeed(null);
        setDrawingSectorProgress(0);
        return;
      }
    } else {
      setDrawingError('Debes completar la vuelta cruzando de nuevo la línea de meta para registrar la trazada.');
      audio.playBeep(180, 0.25, 'triangle');
      drawnPointsRef.current = [];
      setDrawnPoints([]);
      setHasDrawnPoints(false);
      setActiveSpeed(null);
      setDrawingSectorProgress(0);
      return;
    }

    audio.playBeep(587.33, 0.1, 'sine');
    audio.playBeep(880.00, 0.2, 'sine');
    
    onPathDrawn(activePlayer.id, [...activePath]);
    
    drawnPointsRef.current = [];
    setDrawnPoints([]);
    setHasDrawnPoints(false);
    setActiveSpeed(null);
    setDrawingSectorProgress(0);
    setDrawingError(null);
  };

  const handleClear = () => {
    drawnPointsRef.current = [];
    setDrawnPoints([]);
    setHasDrawnPoints(false);
    setActiveSpeed(null);
    setDrawingSectorProgress(0);
    setDrawingError(null);
    audio.playBeep(330, 0.15, 'sawtooth');
  };

  // Get coordinates for active camera target positioning
  const activeCarObj = activeCars.find(c => c.playerId === players[activePlayerIndex]?.id);
  const activeDrawnTipObj = drawnPoints.length > 0 ? drawnPoints[drawnPoints.length - 1] : null;

  return (
    <div 
      className={`${
        isVirtualFullscreen 
          ? 'fixed inset-0 z-50 bg-slate-950 p-2 sm:p-4 md:p-6 flex flex-col items-center justify-center' 
          : 'flex flex-col items-center w-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl p-4 lg:p-6'
      } transition-all duration-300 animate-fadeIn`}
      id="game-canvas-container"
    >
      {/* 3D R3F Viewport Wrapper with responsive aspect-ratio lock */}
      <div 
        className="relative border-4 border-slate-950 rounded-lg shadow-inner overflow-hidden w-full bg-slate-950 transition-all duration-300" 
        style={{ 
          aspectRatio: '8 / 5',
          maxWidth: isVirtualFullscreen ? '95vw' : 'none',
          maxHeight: isVirtualFullscreen ? '82vh' : 'none'
        }}
      >
        {/* Fullscreen and Camera Mode Toggle Buttons */}
        <div className="absolute top-4 left-4 flex items-center gap-2 z-30">
          <button
            onClick={() => {
              audio.playBeep(600, 0.08, 'sine');
              const container = document.getElementById('game-canvas-container');
              if (!document.fullscreenElement && !isVirtualFullscreen) {
                container?.requestFullscreen?.().catch(() => {});
                setIsVirtualFullscreen(true);
              } else {
                if (document.fullscreenElement) {
                  document.exitFullscreen?.().catch(() => {});
                }
                setIsVirtualFullscreen(false);
              }
            }}
            className="bg-slate-950/95 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-white px-2.5 py-1.5 rounded-lg shadow-2xl flex items-center gap-1.5 transition-all cursor-pointer group text-[10px] sm:text-xs font-mono font-bold backdrop-blur-md"
            title={isVirtualFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          >
            {isVirtualFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-rose-400 group-hover:scale-110 transition-transform" />
                <span className="hidden sm:inline text-rose-400">SALIR</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
                <span className="hidden sm:inline text-emerald-400">PANTALLA COMPLETA</span>
              </>
            )}
          </button>

          {phase === 'racing' && (
            <button
              onClick={() => {
                audio.playBeep(700, 0.08, 'sine');
                setCameraMode((prev) => (prev === 'chase' ? 'tv' : 'chase'));
              }}
              className="bg-slate-950/95 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-white px-2.5 py-1.5 rounded-lg shadow-2xl flex items-center gap-1.5 transition-all cursor-pointer group text-[10px] sm:text-xs font-mono font-bold backdrop-blur-md"
              title="Cambiar modo de cámara"
            >
              {cameraMode === 'chase' ? (
                <>
                  <Video className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="hidden sm:inline text-cyan-400">CÁMARA: CHASE 3D</span>
                </>
              ) : (
                <>
                  <Camera className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline text-amber-400">CÁMARA: TV STADIUM</span>
                </>
              )}
            </button>
          )}
        </div>
        
        <Canvas 
          shadows 
          gl={{ antialias: true }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          {/* Dynamic perspective camera for drawing vs 3D perspective camera for racing */}
          {phase === 'drawing' ? (
            <PerspectiveCamera
              makeDefault
              position={[400, 250, 326]}
              fov={75}
              near={0.1}
              far={2000}
            />
          ) : (
            <PerspectiveCamera
              makeDefault
              position={[400, 150, 300]}
              fov={60}
              near={1}
              far={2000}
            />
          )}

          {/* Subtle Ambient Arena glow */}
          <ambientLight intensity={0.45} />
          
          {/* Orbiting Daylight Sun */}
          <OrbitingDaylightSun />

          {/* Racetrack Asphalt tarmac */}
          <TrackMesh track={track} />

          {/* Boundaries, grandstands, volumetric trees & decorations */}
          <Environment3D track={track} />

          {/* Dynamic Skidmarks layer */}
          <Skidmarks3D skidmarks={skidmarks} />

          {/* Dynamic 3D CPU and Player cars */}
          {phase === 'racing' ? (
            activeCars.map((car) => {
              const p = players.find(player => player.id === car.playerId)!;
              const stats = carStats[p.carType];
              const speed = Math.hypot(car.vx, car.vy);
              const isBraking = speed > 1.5 && car.targetIndex < p.drawnPath.length && p.drawnPath[car.targetIndex].speed < speed * 0.9;

              return (
                <Car3D
                  key={car.playerId}
                  color={stats.color}
                  position={[car.x, 500 - car.y, 0.45]}
                  angle={car.angle}
                  isDrifting={car.isDrifting}
                  isBraking={isBraking}
                  name={p.name}
                  active={p.id === activePlayer?.id}
                  speed={speed}
                />
              );
            })
          ) : (
            players.map((p, idx) => {
              const grid = track.startGrid[idx] || track.startGrid[0];
              const stats = carStats[p.carType];
              const isCurrent = p.id === activePlayer?.id;

              return (
                <Car3D
                  key={p.id}
                  color={stats.color}
                  position={[grid.x, 500 - grid.y, 0.45]}
                  angle={grid.angle}
                  isDrifting={false}
                  isBraking={false}
                  name={p.name}
                  active={isCurrent}
                  speed={0}
                  showLabel={false}
                />
              );
            })
          )}

          {/* Render semi-transparent static paths drawn by other players only during racing */}
          {phase === 'racing' && players.map((p) => {
            if (p.drawnPath.length > 0) {
              return (
                <GlowingSpline
                  key={`static-path-${p.id}`}
                  path={p.drawnPath}
                  colorOverride={`${p.color}`}
                  isCompleted={true}
                />
              );
            }
            return null;
          })}

          {/* Dynamic Tyre smoke / turf clump / impact spark particles */}
          <SmokeParticles particles={particles} />

          {/* Smooth Isomorphic Director Camera */}
          <CameraDirector
            phase={phase}
            activeCar={activeCarObj}
            activePlayerGrid={gridPos}
            activeDrawingTip={activeDrawnTipObj}
            track={track}
            cameraMode={cameraMode}
          />
        </Canvas>

        {/* 3D Giant Race Countdown Overlay */}
        {phase === 'racing' && countdownValue && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-xs z-30 pointer-events-none transition-all duration-300">
            <div className="flex flex-col items-center justify-center animate-scale-up">
              <div className="relative flex items-center justify-center">
                <span className="absolute w-40 h-40 rounded-full border-4 border-amber-400/30 animate-ping" />
                <span className="text-8xl md:text-9xl font-black font-mono tracking-tight text-white drop-shadow-[0_0_35px_rgba(245,158,11,0.9)] scale-110 animate-pulse">
                  {countdownValue}
                </span>
              </div>
              <span className="mt-4 px-4 py-1.5 rounded-full bg-slate-900/90 border border-amber-500/40 text-amber-300 font-mono font-extrabold text-xs md:text-sm uppercase tracking-widest shadow-xl">
                {countdownValue === '¡YA!' ? '¡Aceleradores a fondo!' : 'Preparando motores...'}
              </span>
            </div>
          </div>
        )}

        {/* Live Racing Leaderboard HUD */}
        {phase === 'racing' && !countdownValue && (
          <div className="absolute top-3 right-3 bg-slate-950/90 border border-slate-800/80 backdrop-blur-md rounded-xl p-2.5 shadow-2xl z-20 pointer-events-none min-w-[170px] max-w-[220px]">
            <div className="flex items-center gap-1.5 pb-1.5 mb-1.5 border-b border-slate-800 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>Posiciones en vivo</span>
            </div>
            <div className="space-y-1.5">
              {[...activeCars]
                .sort((a, b) => {
                  if (a.finished && !b.finished) return -1;
                  if (!a.finished && b.finished) return 1;
                  if (a.finished && b.finished) return (a.timeFinished || 0) - (b.timeFinished || 0);
                  return (b.targetIndex || 0) - (a.targetIndex || 0);
                })
                .map((car, rank) => {
                  const p = players.find(player => player.id === car.playerId);
                  const pColor = p ? carStats[p.carType]?.color || '#3b82f6' : '#3b82f6';
                  const speed = Math.round(Math.hypot(car.vx, car.vy) * 22);

                  return (
                    <div key={car.playerId} className="flex items-center justify-between gap-2 text-xs font-mono">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className={`w-4 h-4 rounded text-[10px] font-bold flex items-center justify-center ${
                          rank === 0 ? 'bg-amber-400 text-slate-950' : rank === 1 ? 'bg-slate-300 text-slate-950' : 'bg-slate-800 text-slate-300'
                        }`}>
                          {rank + 1}
                        </span>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: pColor }} />
                        <span className="text-white font-medium truncate text-[11px]">{p?.name || 'Corredor'}</span>
                      </div>
                      <span className="text-[10px] font-bold shrink-0">
                        {car.finished ? (
                          <span className="text-emerald-400 flex items-center gap-0.5">
                            <CheckCircle2 className="w-3 h-3" /> Meta
                          </span>
                        ) : car.disqualified ? (
                          <span className="text-rose-400">Desc.</span>
                        ) : (
                          <span className="text-slate-400">{speed} km/h</span>
                        )}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Flat transparent pointer event overlay & high-performance SVG drawing canvas */}
        {phase === 'drawing' ? (
          <svg
            style={{ 
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              cursor: 'crosshair',
              touchAction: 'none',
              pointerEvents: 'auto',
              zIndex: 10
            }}
            viewBox="0 0 800 500"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            id="race-viewport"
          >
            {/* Visual Checkpoint Gate markers in drawing mode */}
            {track.checkpoints.map((cp, idx) => (
              <g key={`cp-gate-${idx}`}>
                <line
                  x1={cp.p1.x}
                  y1={cp.p1.y}
                  x2={cp.p2.x}
                  y2={cp.p2.y}
                  stroke={drawingSectorProgress > idx ? '#10b981' : '#f59e0b'}
                  strokeWidth="2"
                  strokeDasharray="4,4"
                  opacity={drawingSectorProgress > idx ? 0.35 : 0.65}
                />
              </g>
            ))}

            {/* Start/Finish Line in SVG */}
            <line
              x1={track.startLine.p1.x}
              y1={track.startLine.p1.y}
              x2={track.startLine.p2.x}
              y2={track.startLine.p2.y}
              stroke="#ffffff"
              strokeWidth="3.5"
              strokeDasharray="6,4"
              opacity="0.85"
            />

            {/* Guide: Already completed paths of opponents rendered in dashed/transparent style */}
            {activePlayer && players.map((p) => {
              if (p.drawnPath.length > 1 && p.id !== activePlayer.id) {
                return (
                  <path
                    key={`opponent-guide-${p.id}`}
                    d={`M ${p.drawnPath.map(pt => `${pt.x} ${pt.y}`).join(' L ')}`}
                    fill="none"
                    stroke={carStats[p.carType].color}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.3"
                    strokeDasharray="5,6"
                  />
                );
              }
              return null;
            })}

            {/* Pulsing starting beacon centered on the player's car */}
            {activePlayer && !hasDrawnPoints && (
              <g>
                <circle
                  cx={gridPos.x}
                  cy={gridPos.y}
                  r="24"
                  fill="none"
                  stroke={carStats[activePlayer.carType].color}
                  strokeWidth="2.5"
                  className="animate-ping"
                  style={{ transformOrigin: `${gridPos.x}px ${gridPos.y}px` }}
                />
                <circle
                  cx={gridPos.x}
                  cy={gridPos.y}
                  r="12"
                  fill={carStats[activePlayer.carType].color}
                  opacity="0.3"
                />
                <circle
                  cx={gridPos.x}
                  cy={gridPos.y}
                  r="6"
                  fill="#ffffff"
                  stroke={carStats[activePlayer.carType].color}
                  strokeWidth="2"
                />
              </g>
            )}

            {/* Active drawing-in-progress lines with dynamic velocity-colored segments */}
            {drawnPoints.slice(1).map((pt, idx) => {
              const p1 = drawnPoints[idx];
              const p2 = pt;
              const color = getSpeedColor(p2.speed);
              return (
                <line
                  key={`draw-seg-${idx}`}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke={color}
                  strokeWidth={4.5 + p2.speed * 0.45}
                  strokeLinecap="round"
                />
              );
            })}
          </svg>
        ) : (
          <div
            style={{ 
              position: 'absolute',
              inset: 0,
              cursor: 'default',
              touchAction: 'none'
            }}
            id="race-viewport"
          />
        )}

        {/* Sector Progress in Drawing Mode */}
        {phase === 'drawing' && isDrawing && (
          <div className="absolute top-3 left-3 bg-slate-950/90 border border-slate-800 text-white text-[11px] font-mono px-3 py-1.5 rounded-lg flex items-center gap-2 backdrop-blur z-20 pointer-events-none shadow-lg">
            <Flag className="w-3.5 h-3.5 text-amber-400" />
            <span>Progreso de Sectores:</span>
            <span className="font-bold text-amber-400">{drawingSectorProgress} / {track.checkpoints.length}</span>
          </div>
        )}

        {/* Tutorial Overlay */}
        {phase === 'drawing' && showGuide && !isDrawing && (
          <div className="absolute top-16 left-3 right-3 bg-slate-950/95 text-white text-xs md:text-sm p-4 rounded-xl flex items-start gap-2.5 backdrop-blur shadow-2xl border border-slate-700/60 transition-all duration-300 z-30">
            <HelpCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5 animate-pulse" />
            <div className="flex-1">
              <p className="font-extrabold text-amber-300">¿Cómo se juega?</p>
              <p className="text-slate-200 mt-0.5 text-[11px] sm:text-xs">
                Mantén presionado sobre tu coche parpadeante y <strong>dibuja la trazada por toda la pista</strong>.
              </p>
              <p className="text-slate-300 text-[10px] sm:text-[11px] mt-1">
                💡 <strong className="text-sky-300">Dibuja rápido</strong> para acelerar en las rectas. <strong className="text-red-300">Dibuja despacio</strong> para frenar antes de las curvas, ¡o derraparás y chocarás contra el muro!
              </p>
            </div>
            <button 
              onClick={() => {
                audio.playBeep(440, 0.08, 'sine');
                setShowGuide(false);
              }}
              className="text-[10px] bg-slate-800 hover:bg-slate-700 hover:text-white font-bold px-2.5 py-1 rounded-md cursor-pointer transition-colors"
            >
              Entendido
            </button>
          </div>
        )}

        {/* Error Displays floating inside viewport */}
        {drawingError && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-rose-950/95 border border-rose-800 text-rose-200 px-4 py-2.5 rounded-lg text-[10px] sm:text-xs max-w-[90%] shadow-2xl animate-bounce z-30 pointer-events-none">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <p className="font-sans font-bold leading-tight">{drawingError}</p>
          </div>
        )}
      </div>

      {/* 2026 Unified External HUD & Controls Bar */}
      <div className="w-full mt-4 bg-slate-950/90 border border-slate-800/80 rounded-xl p-3 sm:p-4 flex flex-col md:flex-row items-center justify-between gap-3 text-sm z-10 backdrop-blur-sm shadow-xl">
        {/* Left side: Game phase / turn indicator */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <div className="flex flex-col">
            <span className="text-[9px] text-slate-400 uppercase tracking-wider font-mono">MODO DE JUEGO</span>
            <span className="font-bold text-white text-xs sm:text-sm whitespace-nowrap">
              {phase === 'drawing' ? `Trazado: Turno de ${activePlayer?.name}` : 'Carrera en Curso'}
            </span>
          </div>
        </div>

        {/* Middle: Speedometer / Drawing help instructions */}
        <div className="flex items-center gap-3.5 bg-slate-900/80 border border-slate-850 px-3.5 py-2 rounded-lg w-full md:flex-1 md:max-w-md justify-center">
          {phase === 'drawing' ? (
            hasDrawnPoints && activeSpeed !== null ? (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 font-mono uppercase">Velocidad:</span>
                <span 
                  className="text-xs font-extrabold font-mono transition-colors mr-1"
                  style={{ color: getSpeedColor(activeSpeed) }}
                >
                  {getSpeedLabel(activeSpeed)}
                </span>
                
                {/* Visual speed progress bar */}
                <div className="flex gap-0.5 items-center">
                  {[1, 2, 3, 4, 5].map((tick) => {
                    const activeSpeedVal = activeSpeed || 0;
                    const isActive = tick <= (activeSpeedVal / 7.5) * 5;
                    let color = 'bg-slate-800';
                    if (isActive) {
                      if (activeSpeedVal < 2) color = 'bg-sky-450 shadow-[0_0_6px_#38bdf8]';
                      else if (activeSpeedVal < 4) color = 'bg-emerald-400 shadow-[0_0_6px_#34d399]';
                      else if (activeSpeedVal < 5.5) color = 'bg-amber-400 shadow-[0_0_6px_#f59e0b]';
                      else color = 'bg-rose-500 shadow-[0_0_6px_#f43f5e]';
                    }
                    return (
                      <span 
                        key={tick} 
                        className={`w-2 h-3 rounded-sm transition-all duration-150 ${color}`} 
                      />
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-[11px] sm:text-xs text-amber-400 font-bold animate-pulse flex items-center gap-1.5 text-center">
                👉 Mantén pulsado y arrastra desde tu coche parpadeante
              </p>
            )
          ) : (
            <div className="text-[11px] sm:text-xs text-slate-300 font-mono text-center">
              🏁 Los bólidos 3D compiten siguiendo las trazadas exactas.
            </div>
          )}
        </div>

        {/* Right side: Interactive action triggers */}
        <div className="flex gap-2 w-full md:w-auto justify-end shrink-0">
          {phase === 'drawing' && (
            <button
              onClick={() => {
                audio.playBeep(550, 0.08, 'sine');
                setShowGuide(!showGuide);
              }}
              className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
              Guía de Juego
            </button>
          )}

          {phase === 'drawing' && hasDrawnPoints && (
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-4 py-1.5 rounded-lg shadow-md hover:shadow-lg transition-all hover:scale-[1.02] cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Borrar Trazada
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
