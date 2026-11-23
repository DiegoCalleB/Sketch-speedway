import React, { useRef, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import {
  Point,
  Track,
  Player,
  RaceCarState,
  Particle,
  CarStats,
  TelemetrySample,
  PlayerTelemetry,
  RaceResultItem,
  PaceStrategyMode
} from '../types';
import {
  checkSegmentCrossing,
  distToSegment,
  generateAIPath,
  computeTelemetryEvaluation,
  resampleAndSmoothPath,
  getTrackSurfaceInfo,
  getMaxSafeCornerSpeed,
  analyzeDrawnPathSafety,
  getPerfectLapGuide,
  F1_KMH_FACTOR,
  SegmentSafetyInfo
} from '../utils/tracks';
import { stepVehiclePhysics, resolveCarCollisions } from '../utils/vehiclePhysics';
import { useGameStore } from '../store/gameStore';
import { audio } from '../utils/audio';
import {
  Play,
  Pause,
  RotateCcw,
  AlertCircle,
  HelpCircle,
  Maximize2,
  Minimize2,
  CheckCircle2,
  Flag,
  Trophy,
  Video,
  Camera,
  Eye,
  Smartphone,
  AlertTriangle,
  Sparkles,
  Home
} from 'lucide-react';

import { CanvasErrorBoundary } from './CanvasErrorBoundary';
import { TrackMesh } from './ThreeGame/TrackMesh';
import { Environment3D } from './ThreeGame/Environment3D';
import { Car3D } from './ThreeGame/Car3D';
import { GlowingSpline } from './ThreeGame/GlowingSpline';
import { SmokeParticles } from './ThreeGame/SmokeParticles';
import { Skidmarks3D, SkidmarkPoint } from './ThreeGame/Skidmarks3D';
import { CameraDirector, RaceCameraMode } from './ThreeGame/CameraDirector';
import { SceneAtmosphere, LightingPreset } from './ThreeGame/SceneAtmosphere';
import { PostProcessingEffects } from './ThreeGame/PostProcessingEffects';

import * as THREE from 'three';

interface GameCanvasProps {
  track: Track;
  players: Player[];
  carStats: Record<string, CarStats>;
  activePlayerIndex: number;
  phase: 'drawing' | 'racing';
  onPathDrawn: (playerId: string, path: Point[]) => void;
  onStartRace?: () => void;
  onRaceFinished: (results: RaceResultItem[]) => void;
  onRestart: () => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  track,
  players,
  carStats,
  activePlayerIndex,
  phase,
  onPathDrawn,
  onStartRace,
  onRaceFinished
}) => {
  // Default to full-viewport mode automatically during drawing and racing so the user has maximum space!
  const [isVirtualFullscreen, setIsVirtualFullscreen] = useState(true);
  const [isPortraitTrack, setIsPortraitTrack] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight > window.innerWidth * 1.08 : false
  );
  const [manualOrientationOverride, setManualOrientationOverride] = useState<boolean | null>(null);

  // Drawing states
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawnPoints, setHasDrawnPoints] = useState(false);
  const [activeSpeed, setActiveSpeed] = useState<number | null>(null);
  const [activeMaxSafeSpeed, setActiveMaxSafeSpeed] = useState<number | null>(null);
  const [activeSafetyStatus, setActiveSafetyStatus] = useState<SegmentSafetyInfo['status']>('safe_corner');
  const [drawingError, setDrawingError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [showPerfectLap, setShowPerfectLap] = useState(false);
  const [ghostFloatIdx, setGhostFloatIdx] = useState(0);
  const [countdownValue, setCountdownValue] = useState<string | null>(null);
  const [drawingSectorProgress, setDrawingSectorProgress] = useState(0);
  const [cameraMode, setCameraMode] = useState<RaceCameraMode>('helicopter');
  const [lightingPreset, setLightingPreset] = useState<LightingPreset>('day');
  const [focusedPlayerId, setFocusedPlayerId] = useState<string | null>(null);

  // Multi-Lap & Real-Time F1 Pit-Wall Strategy states
  const totalLaps = useGameStore((s) => s.totalLaps);
  const setTotalLaps = useGameStore((s) => s.setTotalLaps);
  const [paceMode, setPaceMode] = useState<PaceStrategyMode>('balanced');
  const paceModeRef = useRef<PaceStrategyMode>('balanced');
  const [lapBannerText, setLapBannerText] = useState<string | null>(null);
  const lapBannerTimerRef = useRef<any>(null);

  // 3D TV Broadcast Replay states
  const isReplaying = useGameStore((s) => s.isReplaying);
  const [isReplayPaused, setIsReplayPaused] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<number>(1);
  const isReplayPausedRef = useRef(false);
  const replaySpeedRef = useRef(1);
  const [canvasResetKey, setCanvasResetKey] = useState(0);

  const svgTrackGroupRef = useRef<SVGGElement>(null);
  const raceSessionIdRef = useRef(0);
  const activePointerIdRef = useRef<number | null>(null);

  // Automatically detect screen portrait vs landscape on resize unless manually overridden
  useEffect(() => {
    const updateOrientation = () => {
      if (manualOrientationOverride !== null) {
        setIsPortraitTrack(manualOrientationOverride);
      } else {
        setIsPortraitTrack(window.innerHeight > window.innerWidth * 1.08);
      }
    };
    updateOrientation();
    window.addEventListener('resize', updateOrientation);
    return () => window.removeEventListener('resize', updateOrientation);
  }, [manualOrientationOverride]);

  // Escape keylistener for virtual fullscreen mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isVirtualFullscreen) {
        setIsVirtualFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVirtualFullscreen]);

  // Auto-dismiss drawing error toast after 3.5 seconds so it never permanently blocks the track
  useEffect(() => {
    if (!drawingError) return;
    const timer = setTimeout(() => setDrawingError(null), 3500);
    return () => clearTimeout(timer);
  }, [drawingError]);

  // Android / mobile lifecycle: suspend Web Audio & pause delta spikes when app moves to background
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        audio.suspendForBackground();
      } else {
        lastFrameTimeRef.current = performance.now();
        audio.resumeFromBackground();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Core drawing vectors
  const [drawnPoints, setDrawnPoints] = useState<Point[]>([]);
  const drawnPointsRef = useRef<Point[]>([]);

  // Simulation physics reactive states
  const [activeCars, setActiveCars] = useState<RaceCarState[]>([]);
  const [skidmarks, setSkidmarks] = useState<SkidmarkPoint[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);

  // Simulation refs for loop synchronization
  const carsStateRef = useRef<RaceCarState[]>([]);
  const racePathsRef = useRef<Record<string, Point[]>>({});
  const flyingPathsRef = useRef<Record<string, Point[]>>({});
  const particlesRef = useRef<Particle[]>([]);
  const skidmarksRef = useRef<SkidmarkPoint[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const raceStartTimeRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);
  const isRacingRef = useRef<boolean>(false);
  const simulationTickRef = useRef<number>(0);
  const telemetrySamplesRef = useRef<Record<string, TelemetrySample[]>>({});
  const finishCountdownTimerRef = useRef<any>(null);

  const activePlayer = players[activePlayerIndex];
  const gridPos = track.startGrid[activePlayerIndex] || track.startGrid[0];
  const allPlayersReady = players.length > 0 && players.every((p) => p.drawnPath.length > 0 || p.isAI);

  const usePortraitLayout = isVirtualFullscreen && isPortraitTrack;

  const getSegmentSafetyColor = (status: SegmentSafetyInfo['status']) => {
    switch (status) {
      case 'danger_overspeed':
        return '#f43f5e'; // Rose Red - Penalty! Too fast in corner!
      case 'warning_drift':
        return '#f59e0b'; // Amber - At grip limit (drift)
      case 'optimal_straight':
        return '#06b6d4'; // Cyan - Full throttle straight!
      case 'safe_corner':
        return '#10b981'; // Emerald Green - Good cornering speed!
      case 'slow_straight':
      default:
        return '#38bdf8'; // Sky Blue - Slow on straight
    }
  };

  const getLiveTacticalMessage = (
    status: SegmentSafetyInfo['status'],
    speed: number,
    maxSafe: number | null
  ) => {
    const kmh = Math.round(speed * F1_KMH_FACTOR);
    const limitKmh = maxSafe ? Math.round(maxSafe * F1_KMH_FACTOR) : 315;
    switch (status) {
      case 'danger_overspeed':
        return `⚠️ ¡EXCESO EN CURVA! (${kmh} > Máx ${limitKmh} km/h) · Penaliza`;
      case 'warning_drift':
        return `⚡ CURVA AL LÍMITE (${kmh} / ${limitKmh} km/h) · Derrape`;
      case 'optimal_straight':
        return `🚀 ¡RECTA A FONDO! (${kmh} km/h)`;
      case 'slow_straight':
        return `💡 RECTA: ¡TRAZA MÁS RÁPIDO! (${kmh} km/h)`;
      case 'safe_corner':
      default:
        return `✅ CURVA CONTROLADA (${kmh} / Máx ${limitKmh} km/h)`;
    }
  };

  // Convert pointer event to exact 800x500 track coordinates (automatically inverting 90° rotation when in portrait mode!)
  const getSvgPointFromEvent = (e: React.PointerEvent<SVGSVGElement>): { x: number; y: number } => {
    const svg = e.currentTarget;
    const targetGroup = svgTrackGroupRef.current || svg;
    const ctm = targetGroup.getScreenCTM();
    if (ctm) {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const transformed = pt.matrixTransform(ctm.inverse());
      return {
        x: Math.max(0, Math.min(track.width, transformed.x)),
        y: Math.max(0, Math.min(track.height, transformed.y))
      };
    }
    const rect = svg.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(track.width, ((e.clientX - rect.left) / rect.width) * track.width)),
      y: Math.max(0, Math.min(track.height, ((e.clientY - rect.top) / rect.height) * track.height))
    };
  };

  // Countdown and Racing loop hooks
  useEffect(() => {
    if (phase === 'racing') {
      const humanPlayer = players.find((p) => !p.isAI) || players[0];
      setFocusedPlayerId(humanPlayer?.id || null);
      startRaceCountdown();
    }
    return () => {
      raceSessionIdRef.current++;
      isRacingRef.current = false;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (finishCountdownTimerRef.current) clearTimeout(finishCountdownTimerRef.current);
      if (lapBannerTimerRef.current) clearTimeout(lapBannerTimerRef.current);
      audio.stopAll();
    };
  }, [phase, track, players]);

  const startRaceCountdown = async () => {
    const sessionId = ++raceSessionIdRef.current;
    isRacingRef.current = false;
    audio.stopAll();
    simulationTickRef.current = 0;
    telemetrySamplesRef.current = {};
    racePathsRef.current = {};
    flyingPathsRef.current = {};
    setPaceMode('balanced');
    paceModeRef.current = 'balanced';
    setLapBannerText(null);
    if (finishCountdownTimerRef.current) clearTimeout(finishCountdownTimerRef.current);
    if (lapBannerTimerRef.current) clearTimeout(lapBannerTimerRef.current);

    players.forEach((p, idx) => {
      if (p.isAI && p.drawnPath.length === 0) {
        p.drawnPath = generateAIPath(track, 320, p.aiArchetype || 'apex_master', idx);
      }
      const smoothed = resampleAndSmoothPath(p.drawnPath, 5);
      racePathsRef.current[p.id] = smoothed;

      // Build a Flying-Lap path for Laps 2..N where the main straight start zone carries full straightaway exit speed instead of standing-start speed
      const exitStraightSpeed =
        smoothed.length > 4
          ? Math.max(6.0, smoothed[smoothed.length - 3]?.speed || 6.4)
          : 6.4;
      flyingPathsRef.current[p.id] = smoothed.map((pt, ptIdx) => {
        if (ptIdx < 20) {
          const blend = ptIdx / 20;
          const boosted = exitStraightSpeed * (1 - blend * 0.35) + pt.speed * (blend * 0.35);
          return { ...pt, speed: Math.max(pt.speed, boosted) };
        }
        return pt;
      });
    });

    const initialCars: RaceCarState[] = players.map((p, idx) => {
      const grid = track.startGrid[idx] || track.startGrid[0];
      const rPath = racePathsRef.current[p.id] || [];
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
        finished: rPath.length === 0,
        disqualified: false,
        timeFinished: null,
        checkpointPassed: -1,
        lap: 1,
        bounceCooldown: 0,
        slipstreamActive: false,
        lapStartTime: 0,
        lapTimes: [],
        bestLapTime: null,
        tireHealth: 100,
        ersBattery: 100,
        drsActive: false,
        angularVelocity: 0,
        steerAngle: 0,
        slipAngle: 0,
        longitudinalG: 0,
        lateralG: 0,
        throttle: 0,
        brake: 0
      };
    });

    carsStateRef.current = initialCars;
    particlesRef.current = [];
    skidmarksRef.current = [];
    setActiveCars([...initialCars]);
    setParticles([]);
    setSkidmarks([]);

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const isReplayActive = useGameStore.getState().isReplaying;

    if (!isReplayActive) {
      for (let count = 3; count > 0; count--) {
        if (raceSessionIdRef.current !== sessionId) return;
        setCountdownValue(count.toString());
        audio.playCountdownTick();
        await delay(750);
        if (raceSessionIdRef.current !== sessionId) return;
      }

      if (raceSessionIdRef.current !== sessionId) return;
      setCountdownValue('¡YA!');
      audio.playCountdownGo();
      setTimeout(() => {
        if (raceSessionIdRef.current === sessionId) {
          setCountdownValue(null);
        }
      }, 650);
    } else {
      setCountdownValue(null);
    }

    if (raceSessionIdRef.current !== sessionId) return;

    const now = performance.now();
    raceStartTimeRef.current = now;
    lastFrameTimeRef.current = now;
    carsStateRef.current.forEach((c) => {
      c.lapStartTime = now;
    });
    isRacingRef.current = true;

    players.forEach((p) => {
      audio.startEngine(p.id);
    });

    runSimulationLoop();
  };

  const runSimulationLoop = () => {
    if (!isRacingRef.current) return;

    const now = performance.now();
    const dtMs = now - lastFrameTimeRef.current;
    lastFrameTimeRef.current = now;

    // Allow freezing 3D replay at any frame while still rotating/switching cameras!
    if (useGameStore.getState().isReplaying && isReplayPausedRef.current) {
      animationFrameRef.current = requestAnimationFrame(runSimulationLoop);
      return;
    }

    const speedMult = useGameStore.getState().isReplaying ? replaySpeedRef.current : 1;
    const dtFactor = Math.max(0.1, Math.min(3.5, (dtMs / 16.667) * speedMult));

    simulationTickRef.current++;
    updateSimulationPhysics(dtFactor, now);

    setActiveCars([...carsStateRef.current]);
    setParticles([...particlesRef.current]);
    setSkidmarks([...skidmarksRef.current]);

    const elapsed = now - raceStartTimeRef.current;
    const finishedCount = carsStateRef.current.filter((c) => c.finished).length;

    if (finishedCount >= Math.min(2, players.length) && !finishCountdownTimerRef.current) {
      finishCountdownTimerRef.current = setTimeout(() => {
        carsStateRef.current.forEach((c) => {
          if (!c.finished && !c.disqualified) {
            c.finished = true;
            c.timeFinished = c.timeFinished || performance.now() - raceStartTimeRef.current;
          }
        });
      }, 4500);
    }

    const activeTotalLaps = Math.max(1, useGameStore.getState().totalLaps);
    const maxRaceTimeoutMs = 32000 * activeTotalLaps;

    if (elapsed > maxRaceTimeoutMs) {
      carsStateRef.current.forEach((c) => {
        if (!c.finished && !c.disqualified) {
          c.finished = true;
          c.timeFinished = c.timeFinished || elapsed;
        }
      });
    }

    const allDone = carsStateRef.current.every((c) => c.finished || c.disqualified);
    if (allDone) {
      isRacingRef.current = false;
      if (finishCountdownTimerRef.current) clearTimeout(finishCountdownTimerRef.current);
      audio.stopAll();

      // If in 3D TV Replay mode, loop the replay seamlessly after 1.5s without overwriting official race results
      if (useGameStore.getState().isReplaying) {
        finishCountdownTimerRef.current = setTimeout(() => {
          if (useGameStore.getState().isReplaying) {
            startRaceCountdown();
          }
        }, 1400);
        return;
      }

      audio.playVictoryJingle();

      const telemetryMap: Record<string, PlayerTelemetry> = {};
      players.forEach((p) => {
        const evalMetrics = computeTelemetryEvaluation(p.drawnPath, track);
        const samples = telemetrySamplesRef.current[p.id] || [];
        telemetryMap[p.id] = {
          playerId: p.id,
          playerName: p.name,
          color: p.color || carStats[p.carType].color,
          carType: p.carType,
          samples,
          apexScore: evalMetrics.apexScore,
          smoothnessScore: evalMetrics.smoothnessScore,
          avgSpeed: evalMetrics.apexScore ? evalMetrics.avgSpeed : 4.2,
          maxSpeed: evalMetrics.maxSpeed,
          maxLateralG: evalMetrics.maxLateralG
        };
      });

      useGameStore.getState().setTelemetries(telemetryMap);

      const finalResults: RaceResultItem[] = carsStateRef.current.map((c) => {
        const pTel = telemetryMap[c.playerId];
        const totalMs = Math.round(c.timeFinished || 999999);
        const recordedLaps =
          c.lapTimes && c.lapTimes.length > 0
            ? c.lapTimes.map((lt) => Math.round(lt))
            : [Math.round(totalMs / activeTotalLaps)];
        const bestLapMs = c.bestLapTime
          ? Math.round(c.bestLapTime)
          : Math.min(...recordedLaps);
        return {
          playerId: c.playerId,
          finished: c.finished,
          time: totalMs,
          disqualified: c.disqualified,
          telemetry: pTel?.samples,
          performanceScore: pTel ? Math.round((pTel.apexScore + pTel.smoothnessScore) / 2) : 82,
          lapTimes: recordedLaps,
          bestLap: bestLapMs,
          totalLaps: activeTotalLaps
        };
      });

      onRaceFinished(finalResults);
      return;
    }

    animationFrameRef.current = requestAnimationFrame(runSimulationLoop);
  };

  const updateSimulationPhysics = (dtFactor: number, now: number) => {
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

      const player = players.find((p) => p.id === car.playerId)!;
      const path = racePathsRef.current[car.playerId] || [];

      if (path.length < 2) {
        car.disqualified = true;
        return;
      }

      const stats = carStats[player.carType];
      const isHumanDriver = !player.isAI;
      const activeStrategy: PaceStrategyMode = isHumanDriver ? paceModeRef.current : 'balanced';

      const oldX = car.x;
      const oldY = car.y;

      // 1. Sub-stepped Rigid-Body Newtonian Vehicle Physics (Ackermann, Pacejka Friction Circle, Downforce & Drag)
      const phys = stepVehiclePhysics(
        car,
        path,
        stats,
        track,
        cars,
        carIdx,
        activeStrategy,
        dtFactor
      );

      const newSpeed = phys.newSpeed;
      const isDriftingNow = phys.isDrifting;
      const isOverspeedWide = phys.isOverspeedWide;
      const slipstreamActive = phys.slipstreamActive;
      const centrifugalForce = phys.centrifugalForce;

      // 2. Aerodynamic Slipstream wake particles
      if (slipstreamActive && Math.random() < 0.25) {
        active_particles.push({
          x: car.x - Math.cos(car.angle) * 9,
          y: car.y - Math.sin(car.angle) * 9,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          color: '#38bdf8',
          size: 2.2,
          alpha: 0.75,
          life: 0,
          maxLife: 10
        });
      }

      // 3. Real Tire Smoke & Dual Rear-Wheel Skidmarks along true chassis orientation
      if (isDriftingNow) {
        const cosA = Math.cos(car.angle);
        const sinA = Math.sin(car.angle);
        if (Math.random() < (isOverspeedWide ? 0.85 : 0.6)) {
          active_particles.push({
            x: car.x - cosA * 6.5,
            y: car.y - sinA * 6.5,
            vx: (Math.random() - 0.5) * 0.8 - car.vx * 0.08,
            vy: (Math.random() - 0.5) * 0.8 - car.vy * 0.08,
            color: car.offTrack ? '#d6c7a1' : 'rgba(226, 232, 240, 0.58)',
            size: Math.random() * 4.2 + 3.0,
            alpha: 0.74,
            life: 0,
            maxLife: Math.random() * 18 + 12
          });
        }

        const rearX = car.x - cosA * 4.0;
        const rearY = car.y - sinA * 4.0;
        active_skidmarks.push({
          x: rearX,
          y: rearY,
          z: phys.surfaceElevationZ,
          angle: car.angle,
          color: car.offTrack ? '#78350f' : '#080a0f',
          alpha: 0.48
        });

        audio.updateScreech(
          car.playerId,
          Math.min(1, isOverspeedWide ? 0.88 : Math.min(1, Math.abs(car.slipAngle ?? 0) * 3.8))
        );
      } else {
        audio.updateScreech(car.playerId, 0);
      }

      // 4. Authentic Formula 1 Titanium Skid-Block Floor Sparks at >265 km/h or riding kerbs!
      if (!car.offTrack && newSpeed > 5.75 && Math.random() < (phys.onCurbOrGrass ? 0.65 : 0.34)) {
        const sparkX = car.x - Math.cos(car.angle) * 6.2 + (Math.random() - 0.5) * 2.2;
        const sparkY = car.y - Math.sin(car.angle) * 6.2 + (Math.random() - 0.5) * 2.2;
        active_particles.push({
          x: sparkX,
          y: sparkY,
          vx: -car.vx * 0.32 + (Math.random() - 0.5) * 1.4,
          vy: -car.vy * 0.32 + (Math.random() - 0.5) * 1.4,
          color: '#fbbf24',
          size: 2.6,
          alpha: 1.0,
          life: 0,
          maxLife: 7 + Math.random() * 6
        });
      }

      // 5. Kick up warm FIA limestone gravel dust clouds whenever off-track!
      if (car.offTrack && newSpeed > 0.5 && Math.random() < 0.78) {
        active_particles.push({
          x: car.x - Math.cos(car.angle) * 5.5 + (Math.random() - 0.5) * 3.0,
          y: car.y - Math.sin(car.angle) * 5.5 + (Math.random() - 0.5) * 3.0,
          vx: (Math.random() - 0.5) * 1.4 - car.vx * 0.12,
          vy: (Math.random() - 0.5) * 1.4 - car.vy * 0.12,
          color: '#d6c7a1',
          size: Math.random() * 4.5 + 3.2,
          alpha: 0.85,
          life: 0,
          maxLife: 18 + Math.random() * 8
        });
      }

      const isFocusedCar = car.playerId === (focusedPlayerId || players[0]?.id);
      audio.updateEngine(car.playerId, newSpeed / 5.0, car.offTrack, phys.isBraking, isFocusedCar);

      // 9. Checkpoint & Finish Line Crossing Detection (Silent, no intrusive checkpoint beeps!)
      const nextCpIdx = car.checkpointPassed + 1;
      if (nextCpIdx < track.checkpoints.length) {
        const targetCp = track.checkpoints[nextCpIdx];
        const cpDist = distToSegment({ x: car.x, y: car.y }, targetCp.p1, targetCp.p2).dist;
        if (
          checkSegmentCrossing({ x: oldX, y: oldY }, { x: car.x, y: car.y }, targetCp) ||
          cpDist < 12
        ) {
          car.checkpointPassed = nextCpIdx;
        }
      }

      const lapProgress = path.length > 1 ? car.targetIndex / (path.length - 1) : 0;

      const crossedFinish = checkSegmentCrossing(
        { x: oldX, y: oldY },
        { x: car.x, y: car.y },
        track.startLine
      );
      if (
        (crossedFinish && (car.checkpointPassed >= track.checkpoints.length - 1 || lapProgress > 0.72)) ||
        car.targetIndex >= path.length - 2
      ) {
        const activeTotalLaps = Math.max(1, useGameStore.getState().totalLaps);
        const lapStart = car.lapStartTime || raceStartTimeRef.current;
        const completedLapMs = Math.max(1500, now - lapStart);
        car.lapTimes = [...(car.lapTimes || []), completedLapMs];
        car.bestLapTime = car.bestLapTime
          ? Math.min(car.bestLapTime, completedLapMs)
          : completedLapMs;
        car.lapStartTime = now;

        if (car.lap < activeTotalLaps) {
          // Advance to Next Flying Lap seamlessly!
          const finishedLapNum = car.lap;
          car.lap += 1;
          car.checkpointPassed = -1;

          // If AI driver, subtly vary its racing line on subsequent laps for realistic wheel-to-wheel battles
          if (player.isAI) {
            const rawAiNext = generateAIPath(
              track,
              320,
              player.aiArchetype || 'apex_master',
              (carIdx + car.lap) % 4
            );
            const smoothedAiNext = resampleAndSmoothPath(rawAiNext, 5);
            const exitSpd = Math.max(6.2, smoothedAiNext[smoothedAiNext.length - 3]?.speed || 6.5);
            flyingPathsRef.current[car.playerId] = smoothedAiNext.map((pt, ptIdx) =>
              ptIdx < 20
                ? { ...pt, speed: Math.max(pt.speed, exitSpd * (1 - ptIdx / 28) + pt.speed * (ptIdx / 28)) }
                : pt
            );
          }

          const nextFlyingPath = flyingPathsRef.current[car.playerId] || path;
          racePathsRef.current[car.playerId] = nextFlyingPath;

          // Find closest continuation waypoint on the main straight in the first 28% of the flying lap path
          const searchLimit = Math.max(6, Math.floor(nextFlyingPath.length * 0.28));
          let bestResumeIdx = 2;
          let minResumeDist = Infinity;
          for (let r = 1; r <= searchLimit; r++) {
            const d = Math.hypot(nextFlyingPath[r].x - car.x, nextFlyingPath[r].y - car.y);
            if (d < minResumeDist) {
              minResumeDist = d;
              bestResumeIdx = r;
            }
          }
          car.targetIndex = Math.min(nextFlyingPath.length - 3, bestResumeIdx + 2);

          if (car.playerId === (focusedPlayerId || players[0]?.id)) {
            const isFinalLap = car.lap === activeTotalLaps;
            const splitStr = `${(completedLapMs / 1000).toFixed(2)}s`;
            setLapBannerText(
              isFinalLap
                ? `🔔 ¡ÚLTIMA VUELTA! (V${car.lap}/${activeTotalLaps}) · V${finishedLapNum}: ${splitStr}`
                : `🏁 VUELTA ${finishedLapNum}: ${splitStr} · VUELTA ${car.lap} / ${activeTotalLaps}`
            );
            if (lapBannerTimerRef.current) clearTimeout(lapBannerTimerRef.current);
            lapBannerTimerRef.current = setTimeout(() => setLapBannerText(null), 2600);
          }
        } else {
          // Completed Final Lap of the Grand Prix!
          car.finished = true;
          car.timeFinished = now - raceStartTimeRef.current;
          audio.stopEngine(car.playerId);
          audio.stopScreech(car.playerId);
          audio.playBeep(1046.5, 0.22, 'sine');
        }
      }

      // 10. Real Rigid-Body Telemetry sampling
      if (tick % 4 === 0) {
        if (!telemetrySamplesRef.current[car.playerId]) {
          telemetrySamplesRef.current[car.playerId] = [];
        }
        const latG = Math.min(4.8, Math.abs(car.lateralG ?? centrifugalForce * 2.2));
        telemetrySamplesRef.current[car.playerId].push({
          timestamp: Math.round(now - raceStartTimeRef.current),
          x: Math.round(car.x),
          y: Math.round(car.y),
          speed: Number(newSpeed.toFixed(2)),
          lateralG: Number(latG.toFixed(2)),
          longitudinalG: Number((car.longitudinalG ?? 0).toFixed(2)),
          isDrifting: isDriftingNow,
          slipstreamActive,
          distToCenterline: Math.round(phys.distFromCenter),
          lapProgress: Number(Math.min(1, lapProgress).toFixed(3))
        });
      }
    });

    // Symmetric Momentum-Conserving Car-to-Car Rigid-Body Collisions
    resolveCarCollisions(cars, (sx, sy) => {
      for (let sp = 0; sp < 3; sp++) {
        active_particles.push({
          x: sx,
          y: sy,
          vx: (Math.random() - 0.5) * 2.8,
          vy: (Math.random() - 0.5) * 2.8,
          color: '#fbbf24',
          size: 2.4,
          alpha: 1,
          life: 0,
          maxLife: 9
        });
      }
    });

    for (let i = active_particles.length - 1; i >= 0; i--) {
      const p = active_particles[i];
      p.x += p.vx * dtFactor;
      p.y += p.vy * dtFactor;
      p.life += dtFactor;
      p.alpha = Math.max(0, 1 - p.life / p.maxLife);
      if (p.life >= p.maxLife) {
        active_particles.splice(i, 1);
      }
    }

    while (active_skidmarks.length > 580) {
      active_skidmarks.shift();
    }
  };

  // --- DRAWING GESTURE HANDLERS ---
  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (phase !== 'drawing' || !activePlayer || allPlayersReady) return;
    if (activePointerIdRef.current !== null && activePointerIdRef.current !== e.pointerId) return;

    const { x, y } = getSvgPointFromEvent(e);
    const startDist = Math.hypot(x - gridPos.x, y - gridPos.y);

    if (startDist > 75) {
      setDrawingError('Empieza a arrastrar desde tu coche parpadeante en la salida.');
      audio.playBeep(220, 0.12, 'square');
      return;
    }

    activePointerIdRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore pointer capture error
    }

    setShowGuide(false);
    setDrawingError(null);
    setIsDrawing(true);
    setDrawingSectorProgress(0);

    const now = performance.now();
    const firstPoint: Point = { x: gridPos.x, y: gridPos.y, t: now, speed: 2.2 };
    const initialList: Point[] = [firstPoint];
    if (startDist > 6) {
      initialList.push({ x, y, t: now + 8, speed: 2.4 });
    }

    drawnPointsRef.current = initialList;
    setDrawnPoints([...initialList]);
    setHasDrawnPoints(true);
    setActiveSpeed(2.2);
    setActiveMaxSafeSpeed(6.8);
    setActiveSafetyStatus('safe_corner');

    audio.playBeep(523.25, 0.07, 'sine');
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawing || phase !== 'drawing' || !activePlayer) return;
    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;

    const { x, y } = getSvgPointFromEvent(e);
    const now = performance.now();
    const activePath = drawnPointsRef.current;
    if (activePath.length === 0) return;

    const lastPt = activePath[activePath.length - 1];
    const dist = Math.hypot(x - lastPt.x, y - lastPt.y);
    if (dist < 3.5) return;

    const dt = Math.max(4, now - lastPt.t);
    const rawSpeed = (dist / dt) * 15.5;

    const alpha = 0.28;
    const smoothedSpeed = lastPt.speed * (1 - alpha) + rawSpeed * alpha;
    const clampedSpeed = Math.max(1.2, Math.min(7.2, smoothedSpeed));

    const newPoint: Point = { x, y, t: now, speed: clampedSpeed };
    activePath.push(newPoint);
    setDrawnPoints([...activePath]);

    // Real-time corner vs straightaway evaluation
    const surface = getTrackSurfaceInfo(newPoint, track);
    let pathCurv = 0;
    if (activePath.length >= 3) {
      const pPrev = activePath[Math.max(0, activePath.length - 3)];
      const pMid = activePath[activePath.length - 2];
      const a1 = Math.atan2(pMid.y - pPrev.y, pMid.x - pPrev.x);
      const a2 = Math.atan2(newPoint.y - pMid.y, newPoint.x - pMid.x);
      let diff = Math.abs(a2 - a1);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      const span = Math.max(8, Math.hypot(newPoint.x - pPrev.x, newPoint.y - pPrev.y));
      pathCurv = diff / span;
    }

    const carGrip = carStats[activePlayer.carType]?.grip || 0.2;
    const maxSafe = getMaxSafeCornerSpeed(
      pathCurv,
      surface.trackCurvature,
      carGrip,
      surface.onAsphalt
    );
    const ratio = clampedSpeed / maxSafe;
    const isCornerSection = surface.trackCurvature > 0.0055 || pathCurv > 0.007;

    let liveStatus: SegmentSafetyInfo['status'] = 'safe_corner';
    if (ratio > 1.15) {
      liveStatus = 'danger_overspeed';
    } else if (ratio > 0.92 && isCornerSection) {
      liveStatus = 'warning_drift';
    } else if (!isCornerSection) {
      liveStatus = clampedSpeed >= 3.8 ? 'optimal_straight' : 'slow_straight';
    } else {
      liveStatus = 'safe_corner';
    }

    // Smooth F1 engine intake preview tone while drawing (varies smoothly with your finger speed, zero beeps!)
    audio.updateDrawingEngine(clampedSpeed, liveStatus === 'danger_overspeed');

    setActiveMaxSafeSpeed(maxSafe);
    setActiveSafetyStatus(liveStatus);

    let currentSector = drawingSectorProgress;
    while (currentSector < track.checkpoints.length) {
      const targetCp = track.checkpoints[currentSector];
      if (
        checkSegmentCrossing(lastPt, newPoint, targetCp) ||
        distToSegment(newPoint, targetCp.p1, targetCp.p2).dist < 10
      ) {
        currentSector++;
        setDrawingSectorProgress(currentSector);
      } else {
        break;
      }
    }

    setActiveSpeed(clampedSpeed);
  };

  const handlePointerUp = (e?: React.PointerEvent<SVGSVGElement>) => {
    if (e && activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) {
      return;
    }
    activePointerIdRef.current = null;
    audio.stopDrawingEngine();
    if (!isDrawing) return;
    setIsDrawing(false);

    const activePath = [...drawnPointsRef.current];

    if (activePath.length < 12) {
      setDrawingError('La trazada es demasiado corta. Da una vuelta completa al circuito hasta cruzar la meta.');
      drawnPointsRef.current = [];
      setDrawnPoints([]);
      setHasDrawnPoints(false);
      setActiveSpeed(null);
      setActiveMaxSafeSpeed(null);
      setDrawingSectorProgress(0);
      return;
    }

    let cpProgress = 0;
    let lastCpIdx = 0;

    for (let i = 1; i < activePath.length; i++) {
      const p1 = activePath[i - 1];
      const p2 = activePath[i];

      while (cpProgress < track.checkpoints.length) {
        const currentCp = track.checkpoints[cpProgress];
        if (
          checkSegmentCrossing(p1, p2, currentCp) ||
          distToSegment(p2, currentCp.p1, currentCp.p2).dist < 12
        ) {
          cpProgress++;
          lastCpIdx = i;
        } else {
          break;
        }
      }
    }

    const requiredCps = track.checkpoints.length;

    if (cpProgress < requiredCps) {
      setDrawingError(
        `Faltan sectores (${cpProgress}/${requiredCps}). Sigue el circuito pasando por S1 → S2 → S3 antes de cruzar la meta.`
      );
      audio.playBeep(180, 0.2, 'triangle');
      drawnPointsRef.current = [];
      setDrawnPoints([]);
      setHasDrawnPoints(false);
      setActiveSpeed(null);
      setActiveMaxSafeSpeed(null);
      setDrawingSectorProgress(0);
      return;
    }

    let finishCrossIdx = -1;
    for (let i = Math.max(1, lastCpIdx); i < activePath.length; i++) {
      if (checkSegmentCrossing(activePath[i - 1], activePath[i], track.startLine)) {
        finishCrossIdx = i;
        break;
      }
    }

    // Forgiving auto-complete if the user passed all checkpoints and released near the finish line
    if (finishCrossIdx === -1) {
      const endPt = activePath[activePath.length - 1];
      const distToStartLine = distToSegment(endPt, track.startLine.p1, track.startLine.p2).dist;
      if (distToStartLine <= 65) {
        const gridAngle = track.startGrid[0].angle;
        const midStart = {
          x: (track.startLine.p1.x + track.startLine.p2.x) * 0.5,
          y: (track.startLine.p1.y + track.startLine.p2.y) * 0.5
        };
        const acrossPt: Point = {
          x: midStart.x + Math.cos(gridAngle) * 28,
          y: midStart.y + Math.sin(gridAngle) * 28,
          t: endPt.t + 25,
          speed: Math.max(3.5, endPt.speed)
        };
        activePath.push(acrossPt);
        finishCrossIdx = activePath.length - 1;
      }
    }

    if (finishCrossIdx === -1) {
      setDrawingError('¡Casi! Cruza la línea blanca de META para cerrar la vuelta.');
      audio.playBeep(180, 0.2, 'triangle');
      drawnPointsRef.current = [];
      setDrawnPoints([]);
      setHasDrawnPoints(false);
      setActiveSpeed(null);
      setActiveMaxSafeSpeed(null);
      setDrawingSectorProgress(0);
      return;
    }

    const fP1 = activePath[finishCrossIdx - 1];
    const fP2 = activePath[finishCrossIdx];
    const gridAngle = track.startGrid[0].angle;
    const drawVec = { x: fP2.x - fP1.x, y: fP2.y - fP1.y };
    const gridVec = { x: Math.cos(gridAngle), y: Math.sin(gridAngle) };
    const dot = drawVec.x * gridVec.x + drawVec.y * gridVec.y;

    if (dot < -0.2) {
      setDrawingError('Estás cruzando la meta en sentido contrario.');
      audio.playBeep(180, 0.2, 'triangle');
      drawnPointsRef.current = [];
      setDrawnPoints([]);
      setHasDrawnPoints(false);
      setActiveSpeed(null);
      setActiveMaxSafeSpeed(null);
      setDrawingSectorProgress(0);
      return;
    }

    const trimmedPath = activePath.slice(0, finishCrossIdx + 1);
    const lastFinishPt = trimmedPath[trimmedPath.length - 1];
    const dirLen = Math.hypot(drawVec.x, drawVec.y) || 1;
    const ux = drawVec.x / dirLen;
    const uy = drawVec.y / dirLen;

    trimmedPath.push({
      x: lastFinishPt.x + ux * 32,
      y: lastFinishPt.y + uy * 32,
      t: lastFinishPt.t + 20,
      speed: Math.max(4.0, lastFinishPt.speed)
    });

    const finalSmoothPath = resampleAndSmoothPath(trimmedPath, 5);

    audio.playBeep(587.33, 0.09, 'sine');
    audio.playBeep(880.0, 0.18, 'sine');

    onPathDrawn(activePlayer.id, finalSmoothPath);

    drawnPointsRef.current = [];
    setDrawnPoints([]);
    setHasDrawnPoints(false);
    setActiveSpeed(null);
    setActiveMaxSafeSpeed(null);
    setDrawingSectorProgress(0);
    setDrawingError(null);
  };

  const handleClear = () => {
    activePointerIdRef.current = null;
    drawnPointsRef.current = [];
    setDrawnPoints([]);
    setHasDrawnPoints(false);
    setActiveSpeed(null);
    setActiveMaxSafeSpeed(null);
    setDrawingSectorProgress(0);
    setDrawingError(null);
    audio.playBeep(330, 0.12, 'sawtooth');
  };

  const handleRedrawCompleted = () => {
    activePointerIdRef.current = null;
    drawnPointsRef.current = [];
    setDrawnPoints([]);
    setHasDrawnPoints(false);
    setActiveSpeed(null);
    setActiveMaxSafeSpeed(null);
    setDrawingSectorProgress(0);
    setDrawingError(null);
    audio.playBeep(330, 0.1, 'sine');
    useGameStore.getState().clearDrawnPaths();
  };

  const handleExitToMenu = () => {
    raceSessionIdRef.current++;
    isRacingRef.current = false;
    activePointerIdRef.current = null;
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (finishCountdownTimerRef.current) clearTimeout(finishCountdownTimerRef.current);
    if (lapBannerTimerRef.current) clearTimeout(lapBannerTimerRef.current);
    audio.stopAll();
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    useGameStore.getState().goToMenu();
  };

  const cycleCameraMode = () => {
    setCameraMode((prev) =>
      prev === 'helicopter'
        ? 'onboard'
        : prev === 'onboard'
          ? 'chase'
          : prev === 'chase'
            ? 'circuit'
            : 'helicopter'
    );
  };

  const targetCarId = focusedPlayerId || players[activePlayerIndex]?.id || players[0]?.id;
  const activeCarObj =
    activeCars.find((c) => c.playerId === targetCarId) ||
    activeCars.find((c) => !c.finished && !c.disqualified) ||
    activeCars[0];
  const activeDrawnTipObj = drawnPoints.length > 0 ? drawnPoints[drawnPoints.length - 1] : null;

  const focusedSpeedKmh = activeCarObj ? Math.round(Math.hypot(activeCarObj.vx, activeCarObj.vy) * F1_KMH_FACTOR) : 0;
  const focusedGear = Math.min(8, Math.max(1, Math.ceil(focusedSpeedKmh / 43)));

  // Analyze active drawing or completed human player path for tactical corner speed feedback
  const activeDrawingSafety = React.useMemo(() => {
    if (drawnPoints.length < 2 || !activePlayer) return null;
    const grip = carStats[activePlayer.carType]?.grip || 0.2;
    return analyzeDrawnPathSafety(drawnPoints, track, grip);
  }, [drawnPoints, activePlayer, carStats, track]);

  const completedHumanPlayer = players.find((p) => !p.isAI && p.drawnPath.length > 1);
  const completedSafetyReport = React.useMemo(() => {
    if (!completedHumanPlayer) return null;
    const grip = carStats[completedHumanPlayer.carType]?.grip || 0.2;
    return analyzeDrawnPathSafety(completedHumanPlayer.drawnPath, track, grip);
  }, [completedHumanPlayer, carStats, track]);

  // Precompute the Perfect Lap Guide & Speed Callouts for the active player's car grip
  const activeCarGrip = activePlayer ? carStats[activePlayer.carType]?.grip || 0.2 : 0.2;
  const perfectLapGuide = React.useMemo(() => {
    return getPerfectLapGuide(track, activeCarGrip, activePlayerIndex);
  }, [track, activeCarGrip, activePlayerIndex]);

  // Animate the Ghost Car along the Perfect Lap path at the exact ideal speed when enabled
  useEffect(() => {
    if (phase !== 'drawing' || !showPerfectLap || perfectLapGuide.perfectPath.length < 2) {
      return;
    }
    let rafId: number;
    let lastTime = performance.now();
    const animateGhost = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      setGhostFloatIdx((prev) => {
        const len = perfectLapGuide.perfectPath.length;
        const currIdx = Math.min(len - 1, Math.floor(prev));
        const ptSpeed = perfectLapGuide.perfectPath[currIdx]?.speed || 6.5;
        // Fast F1 qualifying pace along the Perfect Lap line
        const next = prev + ptSpeed * dt * 5.2;
        return next >= len - 1 ? 0 : next;
      });
      rafId = requestAnimationFrame(animateGhost);
    };
    rafId = requestAnimationFrame(animateGhost);
    return () => cancelAnimationFrame(rafId);
  }, [phase, showPerfectLap, perfectLapGuide]);

  const ghostCursorData = React.useMemo(() => {
    if (!showPerfectLap || perfectLapGuide.perfectPath.length < 2) return null;
    const path = perfectLapGuide.perfectPath;
    const idx = Math.min(path.length - 2, Math.max(0, Math.floor(ghostFloatIdx)));
    const frac = ghostFloatIdx - idx;
    const p1 = path[idx];
    const p2 = path[idx + 1] || p1;
    const x = p1.x + (p2.x - p1.x) * frac;
    const y = p1.y + (p2.y - p1.y) * frac;
    const speed = p1.speed + (p2.speed - p1.speed) * frac;
    const kmh = Math.round(speed * F1_KMH_FACTOR);
    const angleDeg = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
    const isCornerSlow = speed < 5.6;
    return { x, y, kmh, angleDeg, isCornerSlow };
  }, [showPerfectLap, perfectLapGuide, ghostFloatIdx]);

  return (
    <div
      className={`${
        isVirtualFullscreen
          ? 'fixed inset-0 z-50 bg-slate-950 p-1.5 sm:p-3 flex flex-col items-center justify-between w-screen h-dvh overflow-hidden'
          : 'flex flex-col items-center w-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl p-2 sm:p-4'
      } transition-all duration-300`}
      id="game-canvas-container"
    >
      {/* 3D R3F Viewport Wrapper — automatically adapts to 5:8 vertical on portrait phones or 8:5 horizontal on landscape! */}
      <div
        className={`relative border border-slate-800 rounded-xl shadow-inner overflow-hidden bg-slate-950 ${
          isVirtualFullscreen ? 'flex-1 w-full flex items-center justify-center' : 'w-full'
        }`}
        style={
          isVirtualFullscreen
            ? {
                aspectRatio: usePortraitLayout ? '5 / 8' : '8 / 5',
                maxHeight: 'calc(100dvh - 76px)',
                maxWidth: '100%'
              }
            : {
                aspectRatio: '8 / 5'
              }
        }
      >
        {/* Top-left Quick Controls: Menu Exit, Fullscreen, Rotate 90°, Perfect Lap Demo & Camera Selector */}
        <div className="absolute top-2.5 left-2.5 flex flex-wrap items-center gap-1.5 z-30">
          {isVirtualFullscreen && (
            <button
              onClick={handleExitToMenu}
              className="bg-slate-950/90 hover:bg-rose-950/90 border border-slate-800 hover:border-rose-500/60 text-slate-200 hover:text-white px-2.5 py-1.5 rounded-lg shadow-lg flex items-center gap-1.5 transition-colors cursor-pointer text-[10px] sm:text-xs font-mono font-bold"
              title="Volver al menú principal"
            >
              <Home className="w-3.5 h-3.5 text-rose-400" />
              <span>MENÚ</span>
            </button>
          )}

          <button
            onClick={() => {
              audio.playBeep(600, 0.07, 'sine');
              const container = document.getElementById('game-canvas-container');
              if (!isVirtualFullscreen) {
                container?.requestFullscreen?.().catch(() => {});
                setIsVirtualFullscreen(true);
              } else {
                if (document.fullscreenElement) {
                  document.exitFullscreen?.().catch(() => {});
                }
                setIsVirtualFullscreen(false);
              }
            }}
            className="bg-slate-950/90 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-white px-2.5 py-1.5 rounded-lg shadow-lg flex items-center gap-1.5 transition-colors cursor-pointer text-[10px] sm:text-xs font-mono font-bold"
            title={isVirtualFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            {isVirtualFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-amber-400">VENTANA</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">PANTALLA COMPLETA</span>
              </>
            )}
          </button>

          {isVirtualFullscreen && (
            <button
              onClick={() => {
                audio.playBeep(520, 0.06, 'sine');
                setManualOrientationOverride(!usePortraitLayout);
              }}
              className="bg-slate-950/90 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg shadow-lg flex items-center gap-1.5 transition-colors cursor-pointer text-[10px] sm:text-xs font-mono font-bold"
              title="Girar orientación del circuito 90°"
            >
              <Smartphone
                className={`w-3.5 h-3.5 text-cyan-400 transition-transform ${
                  usePortraitLayout ? 'rotate-0' : 'rotate-90'
                }`}
              />
              <span>{usePortraitLayout ? 'VISTA VERTICAL' : 'VISTA HORIZONTAL'}</span>
            </button>
          )}

          {/* Botón de Vuelta Perfecta interactiva en fase de trazado */}
          {phase === 'drawing' && (
            <>
              <button
                onClick={() => {
                  setShowPerfectLap((prev) => !prev);
                  setGhostFloatIdx(0);
                }}
                className={`px-2.5 py-1.5 rounded-lg shadow-lg flex items-center gap-1.5 transition-all cursor-pointer text-[10px] sm:text-xs font-mono font-bold border ${
                  showPerfectLap
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-emerald-500/20'
                    : 'bg-slate-950/90 hover:bg-slate-900 border-slate-800 hover:border-emerald-500/50 text-slate-200'
                }`}
                title="Ver demostración de la Vuelta Perfecta con velocidades ideales"
              >
                <Sparkles className={`w-3.5 h-3.5 ${showPerfectLap ? 'text-emerald-300' : 'text-amber-400'}`} />
                <span>{showPerfectLap ? 'OCULTAR VUELTA PERFECTA' : 'VER VUELTA PERFECTA'}</span>
              </button>

              {showPerfectLap && activePlayer && !allPlayersReady && (
                <button
                  onClick={() => {
                    onPathDrawn(activePlayer.id, perfectLapGuide.perfectPath);
                    drawnPointsRef.current = [];
                    setDrawnPoints([]);
                    setHasDrawnPoints(false);
                    setActiveSpeed(null);
                    setActiveMaxSafeSpeed(null);
                    setDrawingError(null);
                    setDrawingSectorProgress(track.checkpoints.length);
                  }}
                  className="bg-amber-400 hover:bg-amber-300 text-slate-950 px-2.5 py-1.5 rounded-lg shadow-lg flex items-center gap-1.5 transition-transform hover:scale-[1.02] cursor-pointer text-[10px] sm:text-xs font-mono font-extrabold"
                  title="Cargar esta Vuelta Perfecta para comprobar su velocidad real en carrera"
                >
                  <span>⚡ USAR ESTA VUELTA PERFECTA</span>
                </button>
              )}
            </>
          )}

          {phase === 'racing' && (
            <button
              onClick={cycleCameraMode}
              className="bg-slate-950/90 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/50 text-white px-2.5 py-1.5 rounded-lg shadow-lg flex items-center gap-1.5 transition-colors cursor-pointer text-[10px] sm:text-xs font-mono font-bold"
              title="Alternar cámara de carrera (TV, Onboard F1, Persecución, Circuito)"
            >
              {cameraMode === 'helicopter' ? (
                <>
                  <Camera className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-amber-400">TV DINÁMICA</span>
                </>
              ) : cameraMode === 'onboard' ? (
                <>
                  <Video className="w-3.5 h-3.5 text-rose-400" />
                  <span className="text-rose-400">ONBOARD T-CAM F1</span>
                </>
              ) : cameraMode === 'chase' ? (
                <>
                  <Video className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-cyan-400">PERSECUCIÓN 3D</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">CIRCUITO COMPLETO</span>
                </>
              )}
            </button>
          )}

          {/* Time-of-Day & Weather Graphics Switcher (Daylight GP / Golden Sunset / Wet Night GP) */}
          <button
            onClick={() => {
              setLightingPreset((prev) =>
                prev === 'day' ? 'sunset' : prev === 'sunset' ? 'night' : 'day'
              );
            }}
            className="bg-slate-950/90 hover:bg-slate-900 border border-slate-800 hover:border-amber-500/50 text-white px-2.5 py-1.5 rounded-lg shadow-lg flex items-center gap-1.5 transition-colors cursor-pointer text-[10px] sm:text-xs font-mono font-bold"
            title="Cambiar iluminación y clima del circuito (Día Real GP / Tarde Dorada / Noche Asfalto Mojado)"
          >
            {lightingPreset === 'day' ? (
              <span className="text-emerald-300">☀️ DÍA REAL GP</span>
            ) : lightingPreset === 'sunset' ? (
              <span className="text-amber-300">🌅 TARDE DORADA</span>
            ) : (
              <span className="text-cyan-300">🌃 NOCHE WET GP</span>
            )}
          </button>

          {/* Interactive Lap Count Selector Pill during Drawing */}
          {phase === 'drawing' && (
            <button
              type="button"
              onClick={() => {
                const cycle = [1, 2, 3, 5];
                const nextLaps = cycle[(cycle.indexOf(totalLaps) + 1) % cycle.length];
                setTotalLaps(nextLaps);
                audio.playBeep(420 + nextLaps * 35, 0.06, 'sine');
              }}
              className="bg-slate-950/90 hover:bg-slate-900 border border-amber-500/40 hover:border-amber-400 text-amber-300 text-[10px] sm:text-xs font-mono font-extrabold px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-lg transition-colors"
              title="Clic para cambiar el número de vueltas del Gran Premio (1, 2, 3 o 5 vueltas)"
            >
              <Flag className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {totalLaps} {totalLaps === 1 ? 'VUELTA' : 'VUELTAS'}
              </span>
            </button>
          )}

          {/* Live Lap Counter Pill during Racing */}
          {phase === 'racing' && (
            <div className="bg-slate-950/95 border border-amber-500/50 text-white text-[10px] sm:text-xs font-mono px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 pointer-events-none shadow-lg">
              <Flag className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-extrabold text-amber-300">
                VUELTA {Math.min(totalLaps, activeCarObj?.lap || 1)} / {totalLaps}
              </span>
            </div>
          )}

          {/* Sector Counter Pill during Drawing */}
          {phase === 'drawing' && !allPlayersReady && (
            <div className="bg-slate-950/90 border border-slate-800 text-white text-[10px] sm:text-xs font-mono px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 pointer-events-none shadow-lg">
              <span className="font-bold text-cyan-400">
                S{drawingSectorProgress}/{track.checkpoints.length}
              </span>
            </div>
          )}
        </div>

        <CanvasErrorBoundary onReset={() => setCanvasResetKey((k) => k + 1)}>
        <Canvas
          key={canvasResetKey}
          shadows
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener(
              'webglcontextlost',
              (e) => {
                e.preventDefault();
                setCanvasResetKey((k) => k + 1);
              },
              false
            );
          }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <PerspectiveCamera
            makeDefault
            position={[400, 250, 536.7]}
            fov={50}
            near={0.6}
            far={2800}
          />

          <SceneAtmosphere
            preset={lightingPreset}
            shadowFocus={
              activeCarObj ? [activeCarObj.x, 500 - activeCarObj.y] : [400, 250]
            }
            tightShadows={phase === 'racing' && cameraMode !== 'circuit'}
          />

          <TrackMesh
            track={track}
            countdownValue={countdownValue}
            lightingPreset={lightingPreset}
          />
          <Environment3D track={track} lightingPreset={lightingPreset} />
          <Skidmarks3D skidmarks={skidmarks} />

          {phase === 'racing'
            ? activeCars.map((car) => {
                const p = players.find((player) => player.id === car.playerId)!;
                const stats = carStats[p.carType];
                const speed = Math.hypot(car.vx, car.vy);
                const isBraking = (car.brake ?? 0) > 0.18 && speed > 1.4;
                const carSurf = getTrackSurfaceInfo({ x: car.x, y: car.y }, track);

                return (
                  <Car3D
                    key={car.playerId}
                    color={p.color || stats.color}
                    position={[car.x, 500 - car.y, carSurf.elevationZ + 0.15]}
                    angle={car.angle}
                    driftAngle={car.driftAngle}
                    steerAngle={car.steerAngle ?? 0}
                    slipAngle={car.slipAngle ?? 0}
                    longitudinalG={car.longitudinalG ?? 0}
                    lateralG={car.lateralG ?? 0}
                    bankAngle={carSurf.bankAngleRad}
                    isDrifting={car.isDrifting}
                    isBraking={isBraking}
                    drsActive={Boolean(car.drsActive)}
                    throttle={car.throttle ?? 0}
                    name={p.name}
                    active={p.id === activeCarObj?.playerId}
                    speed={speed}
                    showLabel={false}
                  />
                );
              })
            : players.map((p, idx) => {
                const grid = track.startGrid[idx] || track.startGrid[0];
                const stats = carStats[p.carType];
                const isCurrent = p.id === activePlayer?.id;
                const gridSurf = getTrackSurfaceInfo({ x: grid.x, y: grid.y }, track);

                return (
                  <Car3D
                    key={p.id}
                    color={p.color || stats.color}
                    position={[grid.x, 500 - grid.y, gridSurf.elevationZ + 0.15]}
                    angle={grid.angle}
                    bankAngle={gridSurf.bankAngleRad}
                    isDrifting={false}
                    isBraking={false}
                    name={p.name}
                    active={isCurrent}
                    speed={0}
                    showLabel={false}
                  />
                );
              })}

          {phase === 'racing' &&
            cameraMode !== 'onboard' &&
            players.map((p) => {
              const rPath = racePathsRef.current[p.id] || p.drawnPath;
              if (rPath.length > 0) {
                return (
                  <GlowingSpline
                    key={`static-path-${p.id}`}
                    path={rPath}
                    track={track}
                    colorOverride={p.color}
                    isCompleted={true}
                  />
                );
              }
              return null;
            })}

          <SmokeParticles particles={particles} />

          <CameraDirector
            phase={phase}
            activeCar={activeCarObj}
            allCars={activeCars}
            activePlayerGrid={gridPos}
            activeDrawingTip={activeDrawnTipObj}
            track={track}
            cameraMode={cameraMode}
            isPortrait={usePortraitLayout}
            countdownValue={countdownValue}
          />

          <PostProcessingEffects
            preset={lightingPreset}
            focusSpeed={activeCarObj ? Math.hypot(activeCarObj.vx, activeCarObj.vy) : 0}
          />
        </Canvas>
        </CanvasErrorBoundary>

        {/* 3D TV Broadcast Replay Control Dock (Pause, Slow-Mo 0.25x/0.5x/1x/2x, Restart & Return to Podium) */}
        {phase === 'racing' && isReplaying && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 bg-slate-950/95 border border-rose-500/50 px-3 py-2 rounded-2xl shadow-2xl max-w-[96%]">
            <div className="flex items-center gap-1.5 pr-1.5 border-r border-slate-800">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
              <span className="text-[10px] sm:text-xs font-mono font-extrabold text-rose-400 tracking-wider uppercase whitespace-nowrap">
                REPETICIÓN TV 3D
              </span>
            </div>

            <button
              onClick={() => {
                const nextPaused = !isReplayPaused;
                setIsReplayPaused(nextPaused);
                isReplayPausedRef.current = nextPaused;
                if (nextPaused) {
                  audio.stopAll();
                }
              }}
              className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-white px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-mono font-bold cursor-pointer transition-colors"
              title={isReplayPaused ? 'Reanudar repetición' : 'Congelar imagen 3D'}
            >
              {isReplayPaused ? (
                <>
                  <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
                  <span>PLAY</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5 text-amber-400" />
                  <span>PAUSA</span>
                </>
              )}
            </button>

            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-0.5 rounded-lg">
              {[
                { val: 0.25, label: '0.25x' },
                { val: 0.5, label: '0.5x' },
                { val: 1, label: '1x' },
                { val: 2, label: '2x' }
              ].map((spd) => (
                <button
                  key={spd.val}
                  onClick={() => {
                    setReplaySpeed(spd.val);
                    replaySpeedRef.current = spd.val;
                    audio.playBeep(500 + spd.val * 120, 0.05, 'sine');
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                    replaySpeed === spd.val
                      ? 'bg-cyan-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title={`Velocidad ${spd.label}`}
                >
                  {spd.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                setIsReplayPaused(false);
                isReplayPausedRef.current = false;
                startRaceCountdown();
              }}
              className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-mono font-bold cursor-pointer transition-colors"
              title="Reiniciar repetición desde la salida"
            >
              <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Reiniciar</span>
            </button>

            <button
              onClick={() => {
                raceSessionIdRef.current++;
                isRacingRef.current = false;
                audio.stopAll();
                useGameStore.getState().stopReplay();
              }}
              className="flex items-center gap-1 bg-amber-400 hover:bg-amber-300 text-slate-950 px-3 py-1 rounded-lg text-[10px] sm:text-xs font-mono font-extrabold cursor-pointer transition-transform hover:scale-[1.02] whitespace-nowrap"
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>Volver al Podio</span>
            </button>
          </div>
        )}

        {/* Overhead FIA 5-Light Race Countdown Gantry (Elevated at top so it NEVER blocks the cars or track!) */}
        {phase === 'racing' && countdownValue && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
            <div className="flex items-center gap-3 bg-slate-950/90 border border-slate-700/90 px-4 py-2 rounded-xl shadow-2xl">
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((lightIdx) => {
                  const isGo = countdownValue === '¡YA!';
                  const countNum = parseInt(countdownValue, 10);
                  const litRed =
                    !isGo &&
                    ((countNum === 3 && lightIdx <= 2) ||
                      (countNum === 2 && lightIdx <= 4) ||
                      countNum === 1);
                  return (
                    <div
                      key={lightIdx}
                      className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full border transition-all duration-150 ${
                        isGo
                          ? 'bg-emerald-400 border-emerald-200 shadow-[0_0_12px_#34d399]'
                          : litRed
                            ? 'bg-rose-500 border-rose-300 shadow-[0_0_12px_#f43f5e]'
                            : 'bg-slate-900 border-slate-700'
                      }`}
                    />
                  );
                })}
              </div>
              <div className="h-5 w-px bg-slate-800" />
              <span
                className={`text-lg sm:text-xl font-black font-mono tracking-tight ${
                  countdownValue === '¡YA!' ? 'text-emerald-400' : 'text-white'
                }`}
              >
                {countdownValue}
              </span>
            </div>
          </div>
        )}

        {/* Live Lap Split Notification Banner at Top Center during Multi-Lap Races */}
        {phase === 'racing' && !countdownValue && lapBannerText && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 pointer-events-none animate-fadeIn">
            <div className="bg-slate-950/95 border border-amber-400/60 text-amber-300 font-mono font-extrabold text-xs sm:text-sm px-4 py-1.5 rounded-xl shadow-2xl whitespace-nowrap">
              {lapBannerText}
            </div>
          </div>
        )}

        {/* Interactive Live Racing Leaderboard HUD */}
        {phase === 'racing' && !countdownValue && (
          <div className="absolute top-2.5 right-2.5 bg-slate-950/90 border border-slate-800 rounded-xl p-2 shadow-xl z-20 min-w-[180px] max-w-[245px]">
            <div className="flex items-center justify-between gap-1.5 pb-1 mb-1 border-b border-slate-800 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
              <span className="flex items-center gap-1">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                GP · V{Math.min(totalLaps, activeCarObj?.lap || 1)}/{totalLaps}
              </span>
              <span className="text-[9px] text-slate-500">Clic = Seguir</span>
            </div>
            <div className="space-y-1">
              {[...activeCars]
                .sort((a, b) => {
                  if (a.finished && !b.finished) return -1;
                  if (!a.finished && b.finished) return 1;
                  if (a.finished && b.finished) return (a.timeFinished || 0) - (b.timeFinished || 0);
                  const pathA = racePathsRef.current[a.playerId]?.length || 1;
                  const pathB = racePathsRef.current[b.playerId]?.length || 1;
                  const progA = a.lap - 1 + a.targetIndex / pathA;
                  const progB = b.lap - 1 + b.targetIndex / pathB;
                  return progB - progA;
                })
                .map((car, rank) => {
                  const p = players.find((player) => player.id === car.playerId);
                  const pColor = p ? p.color || carStats[p.carType]?.color || '#3b82f6' : '#3b82f6';
                  const speed = Math.round(Math.hypot(car.vx, car.vy) * F1_KMH_FACTOR);
                  const isFocused = activeCarObj?.playerId === car.playerId;

                  return (
                    <button
                      key={car.playerId}
                      type="button"
                      onClick={() => setFocusedPlayerId(car.playerId)}
                      className={`w-full flex items-center justify-between gap-2 px-1.5 py-1 rounded-md text-xs font-mono transition-colors cursor-pointer ${
                        isFocused
                          ? 'bg-slate-800/90 ring-1 ring-cyan-500/50'
                          : 'hover:bg-slate-900/80'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span
                          className={`w-4 h-4 rounded text-[10px] font-bold flex items-center justify-center shrink-0 ${
                            rank === 0
                              ? 'bg-amber-400 text-slate-950'
                              : rank === 1
                                ? 'bg-slate-300 text-slate-950'
                                : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {rank + 1}
                        </span>
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: pColor }}
                        />
                        <span className="text-white font-medium truncate text-[11px]">
                          {p?.name || 'Piloto'}
                        </span>
                        {totalLaps > 1 && !car.finished && (
                          <span className="text-[9px] text-slate-400 font-bold">
                            V{car.lap}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-bold shrink-0 tabular-nums">
                        {car.finished ? (
                          <span className="text-emerald-400 flex items-center gap-0.5">
                            <CheckCircle2 className="w-3 h-3" />{' '}
                            {((car.timeFinished || 0) / 1000).toFixed(1)}s
                          </span>
                        ) : car.disqualified ? (
                          <span className="text-rose-400">Desc.</span>
                        ) : car.offTrack ? (
                          <span className="text-amber-400 font-extrabold">GRAVA {speed}</span>
                        ) : (car.overspeedTimer || 0) > 0 ? (
                          <span className="text-rose-400 font-extrabold">¡SUBVIRAJE! {speed}</span>
                        ) : (
                          <span className="text-cyan-400">{speed} km/h</span>
                        )}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        {/* High-Precision SVG Drawing Overlay */}
        {phase === 'drawing' ? (
          <svg
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              cursor: allPlayersReady ? 'default' : 'crosshair',
              touchAction: 'none',
              pointerEvents: 'auto',
              zIndex: 10
            }}
            viewBox={usePortraitLayout ? '0 0 500 800' : '0 0 800 500'}
            preserveAspectRatio="xMidYMid meet"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            id="race-viewport"
          >
            <g
              ref={svgTrackGroupRef}
              transform={usePortraitLayout ? 'translate(500, 0) rotate(90)' : undefined}
            >
              {/* Visual Checkpoint Gates in Drawing Mode */}
              {track.checkpoints.map((cp, idx) => {
                const isCompleted = drawingSectorProgress > idx;
                const isNext = drawingSectorProgress === idx;
                const midX = (cp.p1.x + cp.p2.x) * 0.5;
                const midY = (cp.p1.y + cp.p2.y) * 0.5;
                return (
                  <g key={`cp-gate-${idx}`}>
                    <line
                      x1={cp.p1.x}
                      y1={cp.p1.y}
                      x2={cp.p2.x}
                      y2={cp.p2.y}
                      stroke={isCompleted ? '#10b981' : isNext ? '#fbbf24' : '#64748b'}
                      strokeWidth={isNext ? '3.2' : '2'}
                      strokeDasharray="5,5"
                      opacity={isCompleted ? 0.55 : isNext ? 0.9 : 0.45}
                    />
                    <g transform={usePortraitLayout ? `rotate(-90, ${midX}, ${midY})` : undefined}>
                      <circle
                        cx={midX}
                        cy={midY}
                        r="9.5"
                        fill={isCompleted ? '#065f46' : isNext ? '#f59e0b' : '#1e293b'}
                        stroke={isCompleted ? '#10b981' : '#f8fafc'}
                        strokeWidth="1.5"
                        opacity="0.95"
                      />
                      <text
                        x={midX}
                        y={midY + 3.5}
                        textAnchor="middle"
                        fill={isNext && !isCompleted ? '#090d16' : '#ffffff'}
                        fontSize="9.5"
                        fontWeight="bold"
                        fontFamily="monospace"
                      >
                        S{idx + 1}
                      </text>
                    </g>
                  </g>
                );
              })}

              {/* Always-visible Target Speed Callouts on Corners & Straights so player knows from the start how fast to draw! */}
              {!allPlayersReady &&
                perfectLapGuide.callouts.map((callout, idx) => {
                  const isStraight = callout.type === 'straight';
                  const badgeColor = isStraight ? '#0891b2' : '#059669';
                  const borderColor = isStraight ? '#22d3ee' : '#34d399';
                  return (
                    <g
                      key={`speed-callout-${idx}`}
                      transform={
                        usePortraitLayout
                          ? `rotate(-90, ${callout.x}, ${callout.y})`
                          : undefined
                      }
                      opacity={isDrawing ? 0.55 : 0.92}
                    >
                      <rect
                        x={callout.x - 36}
                        y={callout.y - 9}
                        width="72"
                        height="18"
                        rx="5"
                        fill="#090d16"
                        fillOpacity="0.88"
                        stroke={borderColor}
                        strokeWidth="1.2"
                      />
                      <circle
                        cx={callout.x - 27}
                        cy={callout.y}
                        r="3"
                        fill={badgeColor}
                      />
                      <text
                        x={callout.x + 3}
                        y={callout.y + 3.2}
                        textAnchor="middle"
                        fill="#f8fafc"
                        fontSize="8"
                        fontWeight="bold"
                        fontFamily="monospace"
                      >
                        {callout.label}
                      </text>
                    </g>
                  );
                })}

              {/* Interactive Perfect Lap Demonstration Overlay + Animated Ghost Car */}
              {showPerfectLap && perfectLapGuide.perfectPath.length > 1 && (
                <g opacity={isDrawing ? 0.55 : 0.95}>
                  {perfectLapGuide.perfectPath.slice(1).map((pt, idx) => {
                    const p1 = perfectLapGuide.perfectPath[idx];
                    const isFast = pt.speed >= 7.2;
                    const isMed = pt.speed >= 5.6 && pt.speed < 7.2;
                    const segColor = isFast ? '#22d3ee' : isMed ? '#10b981' : '#f59e0b';
                    return (
                      <line
                        key={`perf-lap-seg-${idx}`}
                        x1={p1.x}
                        y1={p1.y}
                        x2={pt.x}
                        y2={pt.y}
                        stroke={segColor}
                        strokeWidth="3.8"
                        strokeDasharray="6,4"
                        strokeLinecap="round"
                      />
                    );
                  })}

                  {/* Animated Ghost Cursor showing real-time ideal drawing speed */}
                  {ghostCursorData && (
                    <g>
                      <circle
                        cx={ghostCursorData.x}
                        cy={ghostCursorData.y}
                        r="12"
                        fill={ghostCursorData.isCornerSlow ? '#10b981' : '#22d3ee'}
                        opacity="0.28"
                      />
                      <g
                        transform={`translate(${ghostCursorData.x}, ${ghostCursorData.y}) rotate(${ghostCursorData.angleDeg})`}
                      >
                        <rect
                          x="-8"
                          y="-4.5"
                          width="16"
                          height="9"
                          rx="3"
                          fill={ghostCursorData.isCornerSlow ? '#10b981' : '#06b6d4'}
                          stroke="#ffffff"
                          strokeWidth="1.5"
                        />
                      </g>
                      <g
                        transform={
                          usePortraitLayout
                            ? `rotate(-90, ${ghostCursorData.x}, ${ghostCursorData.y})`
                            : undefined
                        }
                      >
                        <rect
                          x={ghostCursorData.x - 35}
                          y={ghostCursorData.y - 26}
                          width="70"
                          height="15"
                          rx="4"
                          fill="#090d16"
                          stroke={ghostCursorData.isCornerSlow ? '#34d399' : '#22d3ee'}
                          strokeWidth="1.2"
                        />
                        <text
                          x={ghostCursorData.x}
                          y={ghostCursorData.y - 16}
                          textAnchor="middle"
                          fill={ghostCursorData.isCornerSlow ? '#6ee7b7' : '#67e8f9'}
                          fontSize="8.5"
                          fontWeight="bold"
                          fontFamily="monospace"
                        >
                          👻 {ghostCursorData.kmh} km/h
                        </text>
                      </g>
                    </g>
                  )}
                </g>
              )}

              {/* Start/Finish Line in SVG */}
              <line
                x1={track.startLine.p1.x}
                y1={track.startLine.p1.y}
                x2={track.startLine.p2.x}
                y2={track.startLine.p2.y}
                stroke={drawingSectorProgress >= track.checkpoints.length ? '#10b981' : '#ffffff'}
                strokeWidth={drawingSectorProgress >= track.checkpoints.length ? '5' : '3.5'}
                strokeDasharray="6,4"
                opacity="0.9"
              />

              {/* Direction Arrow at Start Grid */}
              {activePlayer && !hasDrawnPoints && !allPlayersReady && (
                <g
                  transform={`translate(${gridPos.x + Math.cos(gridPos.angle) * 34}, ${
                    gridPos.y + Math.sin(gridPos.angle) * 34
                  }) rotate(${(gridPos.angle * 180) / Math.PI})`}
                  opacity="0.85"
                >
                  <path d="M -8 -5 L 6 0 L -8 5 Z" fill="#fbbf24" />
                </g>
              )}

              {/* Completed paths of players with tactical segment coloring for human player */}
              {players.map((p) => {
                if (p.drawnPath.length > 1) {
                  const isOwnCompleted = allPlayersReady && !p.isAI;
                  if (isOwnCompleted && completedSafetyReport) {
                    return (
                      <g key={`completed-tactical-${p.id}`}>
                        {p.drawnPath.slice(1).map((pt, idx) => {
                          const p1 = p.drawnPath[idx];
                          const segInfo = completedSafetyReport.segments[idx];
                          const segColor = segInfo
                            ? getSegmentSafetyColor(segInfo.status)
                            : carStats[p.carType].color;
                          return (
                            <line
                              key={`comp-seg-${idx}`}
                              x1={p1.x}
                              y1={p1.y}
                              x2={pt.x}
                              y2={pt.y}
                              stroke={segColor}
                              strokeWidth={
                                segInfo?.status === 'danger_overspeed' ? '6' : '4.5'
                              }
                              strokeLinecap="round"
                              opacity="0.9"
                            />
                          );
                        })}
                        {/* Danger Zone Badges on completed path */}
                        {completedSafetyReport.dangerZones.map((dz, dzIdx) => (
                          <g
                            key={`comp-dz-${dzIdx}`}
                            transform={
                              usePortraitLayout ? `rotate(-90, ${dz.x}, ${dz.y})` : undefined
                            }
                          >
                            <circle
                              cx={dz.x}
                              cy={dz.y}
                              r="11"
                              fill="#881337"
                              stroke="#f43f5e"
                              strokeWidth="2"
                            />
                            <text
                              x={dz.x}
                              y={dz.y + 4}
                              textAnchor="middle"
                              fill="#ffffff"
                              fontSize="11"
                              fontWeight="bold"
                              fontFamily="monospace"
                            >
                              !
                            </text>
                          </g>
                        ))}
                      </g>
                    );
                  }
                  return (
                    <path
                      key={`completed-guide-${p.id}`}
                      d={`M ${p.drawnPath.map((pt) => `${pt.x} ${pt.y}`).join(' L ')}`}
                      fill="none"
                      stroke={carStats[p.carType].color}
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.35"
                      strokeDasharray="5,6"
                    />
                  );
                }
                return null;
              })}

              {/* Starting Anchor Beacon centered on active player's car */}
              {activePlayer && !hasDrawnPoints && !allPlayersReady && (
                <g>
                  <circle
                    cx={gridPos.x}
                    cy={gridPos.y}
                    r="24"
                    fill={carStats[activePlayer.carType].color}
                    opacity="0.25"
                  />
                  <circle
                    cx={gridPos.x}
                    cy={gridPos.y}
                    r="15"
                    fill="none"
                    stroke={carStats[activePlayer.carType].color}
                    strokeWidth="2.5"
                  />
                  <circle
                    cx={gridPos.x}
                    cy={gridPos.y}
                    r="5.5"
                    fill="#ffffff"
                    stroke={carStats[activePlayer.carType].color}
                    strokeWidth="2"
                  />
                </g>
              )}

              {/* Active drawing-in-progress lines colored by Tactical Corner vs Straightaway Safety */}
              {drawnPoints.slice(1).map((pt, idx) => {
                const p1 = drawnPoints[idx];
                const p2 = pt;
                const segInfo = activeDrawingSafety?.segments[idx];
                const color = segInfo
                  ? getSegmentSafetyColor(segInfo.status)
                  : '#10b981';
                const isDanger = segInfo?.status === 'danger_overspeed';
                return (
                  <line
                    key={`draw-seg-${idx}`}
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke={color}
                    strokeWidth={isDanger ? 6.5 : 4.2 + p2.speed * 0.35}
                    strokeLinecap="round"
                  />
                );
              })}

              {/* Live Danger Markers while drawing if the player entered a curve too fast */}
              {activeDrawingSafety?.dangerZones.map((dz, dzIdx) => (
                <g
                  key={`live-dz-${dzIdx}`}
                  transform={usePortraitLayout ? `rotate(-90, ${dz.x}, ${dz.y})` : undefined}
                >
                  <circle
                    cx={dz.x}
                    cy={dz.y}
                    r="10"
                    fill="#be123c"
                    stroke="#fda4af"
                    strokeWidth="2"
                  />
                  <text
                    x={dz.x}
                    y={dz.y + 3.8}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="10.5"
                    fontWeight="bold"
                    fontFamily="monospace"
                  >
                    !
                  </text>
                </g>
              ))}
            </g>
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

        {/* Ready-to-Race Fullscreen Launch Banner with Tactical Corner Analysis! */}
        {phase === 'drawing' && allPlayersReady && (
          <div className="absolute inset-x-3 bottom-4 flex flex-col gap-2.5 bg-slate-950/95 border border-emerald-500/40 p-3.5 rounded-2xl shadow-2xl z-30 max-w-md mx-auto">
            {completedSafetyReport && (
              <div
                className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl border text-[11px] font-mono ${
                  completedSafetyReport.dangerZones.length > 0
                    ? 'bg-rose-950/70 border-rose-500/40 text-rose-200'
                    : 'bg-emerald-950/60 border-emerald-500/30 text-emerald-200'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {completedSafetyReport.dangerZones.length > 0 ? (
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                  <span className="font-bold">
                    {completedSafetyReport.dangerZones.length > 0
                      ? `${completedSafetyReport.dangerZones.length} curva(s) rápidas: riesgo de salir a la grava`
                      : 'Frenada en curvas óptima · Trazada limpia'}
                  </span>
                </div>
                <span className="font-extrabold shrink-0">
                  Control: {completedSafetyReport.safetyScore}%
                </span>
              </div>
            )}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
              <button
                onClick={() => {
                  audio.playBeep(880, 0.15, 'sine');
                  if (onStartRace) {
                    onStartRace();
                  } else {
                    useGameStore.getState().setPhase('racing');
                  }
                }}
                className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-extrabold py-2.5 px-5 rounded-xl shadow-lg transition-transform hover:scale-[1.02] text-sm cursor-pointer whitespace-nowrap"
              >
                <Play className="w-4 h-4 fill-slate-950" />
                ¡COMENZAR LA CARRERA!
              </button>
              <button
                onClick={handleRedrawCompleted}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2.5 px-4 rounded-xl text-xs cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Repetir Trazada
              </button>
            </div>
          </div>
        )}

        {/* Optional Help Modal */}
        {phase === 'drawing' && showGuide && !isDrawing && (
          <div className="absolute top-14 left-3 right-3 max-w-lg mx-auto bg-slate-950/95 text-white text-xs p-3.5 rounded-xl flex items-start gap-2.5 shadow-2xl border border-slate-700 z-30">
            <HelpCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-amber-300">Física Realista: F1 / NASCAR / Rally</p>
              <p className="text-slate-200 mt-0.5 text-[11px]">
                • <strong>Indicadores en pista:</strong> Verás carteles con la velocidad óptima (<span className="text-cyan-400 font-bold">RECTA km/h</span> y <span className="text-emerald-400 font-bold">CURVA km/h</span>) desde el principio.
              </p>
              <p className="text-slate-200 mt-0.5 text-[11px]">
                • <strong>Botón «Vuelta Perfecta»:</strong> Actívalo arriba para ver la línea ideal y un coche fantasma moviéndose a la velocidad exacta a la que debes dibujar.
              </p>
              <p className="text-rose-300 text-[10px] mt-1 font-semibold">
                ⚠️ Si entras pasado de velocidad en una curva, la fuerza centrífuga abrirá tu trayectoria hacia el piano o la escapatoria de grava/hierba, frenándote de forma natural sin rebotes artificiales.
              </p>
            </div>
            <button
              onClick={() => setShowGuide(false)}
              className="text-[10px] bg-slate-800 hover:bg-slate-700 text-white font-bold px-2.5 py-1 rounded-md cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Non-blocking Top Toast for Drawing Feedback */}
        {drawingError && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-rose-950/95 border border-rose-700 text-rose-100 px-3.5 py-2 rounded-lg text-[11px] sm:text-xs max-w-[92%] shadow-xl z-30 pointer-events-none">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <p className="font-sans font-semibold leading-tight">{drawingError}</p>
          </div>
        )}
      </div>

      {/* Unified Bottom Telemetry & Controls Dock */}
      <div className="w-full mt-1.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs z-10 shadow-xl shrink-0">
        {/* Left side: Turn / Focused Car status */}
        <div className="flex items-center gap-2">
          <span
            className="inline-flex rounded-full h-2.5 w-2.5 shrink-0"
            style={{
              backgroundColor:
                phase === 'drawing'
                  ? activePlayer
                    ? carStats[activePlayer.carType].color
                    : '#10b981'
                  : activeCarObj
                    ? carStats[
                        players.find((p) => p.id === activeCarObj.playerId)?.carType || 'balanced'
                      ].color
                    : '#10b981'
            }}
          />
          <span className="font-bold text-white text-xs whitespace-nowrap">
            {phase === 'drawing'
              ? allPlayersReady
                ? '¡Trazada Lista!'
                : `Turno: ${activePlayer?.name || 'Piloto'}`
              : `${players.find((p) => p.id === activeCarObj?.playerId)?.name || 'Carrera'}`}
          </span>
        </div>

        {/* Middle: Live Speedometer / Tactical Corner Coaching */}
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1 rounded-lg flex-1 max-w-lg justify-center min-w-[180px]">
          {phase === 'drawing' ? (
            hasDrawnPoints && activeSpeed !== null ? (
              <span
                className="text-[11px] sm:text-xs font-extrabold font-mono transition-colors truncate"
                style={{ color: getSegmentSafetyColor(activeSafetyStatus) }}
              >
                {getLiveTacticalMessage(activeSafetyStatus, activeSpeed, activeMaxSafeSpeed)}
              </span>
            ) : allPlayersReady ? (
              <span className="text-[11px] text-emerald-400 font-bold">
                Pulsa ¡COMENZAR LA CARRERA! para competir
              </span>
            ) : (
              <p className="text-[11px] text-amber-400 font-semibold text-center truncate">
                Mira las velocidades en pista o pulsa «Vuelta Perfecta»
              </p>
            )
          ) : (
            <div className="flex items-center gap-2.5 sm:gap-3 font-mono text-xs tabular-nums">
              {/* Pro F1 10-LED RPM Shift Light Bar */}
              <div className="hidden xs:flex items-center gap-0.5 bg-slate-950 px-1.5 py-1 rounded border border-slate-800">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((led) => {
                  const gearFloor = (focusedGear - 1) * 43;
                  const rpmRatio =
                    focusedSpeedKmh > 10
                      ? Math.min(1, Math.max(0.2, (focusedSpeedKmh - gearFloor) / 43))
                      : 0;
                  const isLit = focusedSpeedKmh > 15 && led <= Math.ceil(rpmRatio * 10);
                  const ledColor =
                    led <= 4
                      ? 'bg-emerald-400 shadow-[0_0_5px_#34d399]'
                      : led <= 7
                        ? 'bg-rose-500 shadow-[0_0_5px_#f43f5e]'
                        : 'bg-cyan-400 shadow-[0_0_6px_#22d3ee]';
                  return (
                    <span
                      key={led}
                      className={`w-1.5 h-2.5 rounded-[1px] transition-colors ${
                        isLit ? ledColor : 'bg-slate-800'
                      }`}
                    />
                  );
                })}
              </div>

              <span className="text-cyan-400 font-extrabold">{focusedSpeedKmh} km/h</span>
              <span className="text-slate-700">·</span>
              <span className="bg-slate-950 border border-amber-500/40 text-amber-400 font-black px-1.5 py-0.5 rounded text-[11px]">
                {focusedGear}ª
              </span>
              <span className="bg-slate-950 border border-slate-800 text-slate-300 font-bold px-1.5 py-0.5 rounded text-[10px]">
                V{Math.min(totalLaps, activeCarObj?.lap || 1)}/{totalLaps}
              </span>
              <span
                className="bg-slate-950 border border-slate-800 text-emerald-400 font-bold px-1.5 py-0.5 rounded text-[10px] hidden sm:inline"
                title="Salud y agarre de los neumáticos Pirelli"
              >
                🛞 {Math.round(activeCarObj?.tireHealth ?? 100)}%
              </span>
              <span
                className="bg-slate-950 border border-slate-800 text-cyan-300 font-bold px-1.5 py-0.5 rounded text-[10px] hidden sm:inline"
                title="Batería Híbrida ERS MGU-K"
              >
                🔋 {Math.round(activeCarObj?.ersBattery ?? 100)}%
              </span>
              <span className="text-slate-700 hidden md:inline">·</span>
              <span
                className={`hidden md:inline font-bold text-[11px] ${
                  activeCarObj?.offTrack
                    ? 'text-rose-400'
                    : (activeCarObj?.overspeedTimer || 0) > 0
                      ? 'text-amber-400'
                      : activeCarObj?.isDrifting
                        ? 'text-amber-300'
                        : activeCarObj?.slipstreamActive || activeCarObj?.drsActive
                          ? 'text-cyan-400'
                          : 'text-emerald-400'
                }`}
              >
                {activeCarObj?.offTrack
                  ? '⚠️ GRAVA (-56%)'
                  : (activeCarObj?.overspeedTimer || 0) > 0
                    ? '⚠️ SUBVIRAJE'
                    : activeCarObj?.slipstreamActive
                      ? '⚡ DRS + REBUFO'
                      : activeCarObj?.drsActive
                        ? '⚡ DRS ABIERTO'
                        : 'AGARRE ÓPTIMO'}
              </span>
            </div>
          )}
        </div>

        {/* Right side: Action Buttons & Live F1 Pit-Wall Strategy Modes */}
        <div className="flex gap-1.5 items-center justify-end shrink-0">
          {phase === 'racing' && !isReplaying && (
            <div
              className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-0.5 rounded-lg"
              title="Estrategia en tiempo real: Ataque ERS (+potencia), Ritmo GP (equilibrado) o Cuidar Gomas (+agarre en curva)"
            >
              {[
                { id: 'attack' as PaceStrategyMode, label: '⚡ ATAQUE', activeCls: 'bg-rose-500 text-white' },
                { id: 'balanced' as PaceStrategyMode, label: '⚖️ RITMO', activeCls: 'bg-cyan-500 text-slate-950' },
                { id: 'conserve' as PaceStrategyMode, label: '🛞 GOMAS', activeCls: 'bg-emerald-500 text-slate-950' }
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setPaceMode(m.id);
                    paceModeRef.current = m.id;
                    audio.playBeep(m.id === 'attack' ? 780 : m.id === 'conserve' ? 460 : 600, 0.05, 'sine');
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-extrabold transition-colors cursor-pointer whitespace-nowrap ${
                    paceMode === m.id ? m.activeCls : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}

          {phase === 'drawing' && (
            <button
              onClick={() => {
                audio.playBeep(showPerfectLap ? 480 : 760, 0.07, 'sine');
                setShowPerfectLap((prev) => !prev);
                setGhostFloatIdx(0);
              }}
              className={`flex items-center gap-1 border text-[11px] font-bold px-2.5 py-1 rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
                showPerfectLap
                  ? 'bg-emerald-950/90 border-emerald-500 text-emerald-300'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-emerald-400'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Vuelta Perfecta
            </button>
          )}

          {phase === 'drawing' && (
            <button
              onClick={() => {
                audio.playBeep(550, 0.07, 'sine');
                setShowGuide(!showGuide);
              }}
              className="flex items-center gap-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px] font-bold px-2.5 py-1 rounded-lg cursor-pointer transition-colors whitespace-nowrap"
            >
              <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
              Guía
            </button>
          )}

          {phase === 'drawing' && hasDrawnPoints && (
            <button
              onClick={handleClear}
              className="flex items-center gap-1 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold px-3 py-1 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Borrar
            </button>
          )}

          {phase === 'racing' && (
            <button
              onClick={cycleCameraMode}
              className="flex items-center gap-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-400 text-[11px] font-bold px-2.5 py-1 rounded-lg cursor-pointer transition-colors whitespace-nowrap"
            >
              <Camera className="w-3.5 h-3.5" />
              Vista
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
