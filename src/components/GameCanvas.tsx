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
  RaceResultItem
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
import { useGameStore } from '../store/gameStore';
import { audio } from '../utils/audio';
import {
  Play,
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
  Sparkles
} from 'lucide-react';

import { TrackMesh } from './ThreeGame/TrackMesh';
import { Environment3D } from './ThreeGame/Environment3D';
import { Car3D } from './ThreeGame/Car3D';
import { GlowingSpline } from './ThreeGame/GlowingSpline';
import { SmokeParticles } from './ThreeGame/SmokeParticles';
import { Skidmarks3D } from './ThreeGame/Skidmarks3D';
import { CameraDirector, RaceCameraMode } from './ThreeGame/CameraDirector';

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

// Orbiting Daylight Sun component for crisp stadium shadows
const OrbitingDaylightSun = () => {
  const sunRef = useRef<THREE.DirectionalLight>(null);

  React.useEffect(() => {
    let frameId = 0;
    const tick = () => {
      if (sunRef.current) {
        const elapsed = Date.now() * 0.0002;
        const radius = 320;
        const x = 400 + Math.cos(elapsed) * radius;
        const y = 250 + Math.sin(elapsed) * radius;
        sunRef.current.position.set(x, y, 360);
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
      intensity={1.55}
      color="#fffbeb"
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-440}
      shadow-camera-right={440}
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
  const [focusedPlayerId, setFocusedPlayerId] = useState<string | null>(null);

  const svgTrackGroupRef = useRef<SVGGElement>(null);

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

  // Core drawing vectors
  const [drawnPoints, setDrawnPoints] = useState<Point[]>([]);
  const drawnPointsRef = useRef<Point[]>([]);

  // Simulation physics reactive states
  const [activeCars, setActiveCars] = useState<RaceCarState[]>([]);
  const [skidmarks, setSkidmarks] = useState<{ x: number; y: number; color: string; alpha: number }[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);

  // Simulation refs for loop synchronization
  const carsStateRef = useRef<RaceCarState[]>([]);
  const racePathsRef = useRef<Record<string, Point[]>>({});
  const particlesRef = useRef<Particle[]>([]);
  const skidmarksRef = useRef<{ x: number; y: number; color: string; alpha: number }[]>([]);
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
    racePathsRef.current = {};
    if (finishCountdownTimerRef.current) clearTimeout(finishCountdownTimerRef.current);

    players.forEach((p, idx) => {
      if (p.isAI && p.drawnPath.length === 0) {
        p.drawnPath = generateAIPath(track, 320, p.aiArchetype || 'apex_master', idx);
      }
      racePathsRef.current[p.id] = resampleAndSmoothPath(p.drawnPath, 5);
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
        slipstreamActive: false
      };
    });

    carsStateRef.current = initialCars;
    particlesRef.current = [];
    skidmarksRef.current = [];
    setActiveCars([...initialCars]);
    setParticles([]);
    setSkidmarks([]);

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    for (let count = 3; count > 0; count--) {
      setCountdownValue(count.toString());
      audio.playCountdownTick();
      await delay(750);
    }

    setCountdownValue('¡YA!');
    audio.playCountdownGo();
    const now = performance.now();
    raceStartTimeRef.current = now;
    lastFrameTimeRef.current = now;
    isRacingRef.current = true;

    players.forEach((p) => {
      audio.startEngine(p.id);
    });

    setTimeout(() => {
      setCountdownValue(null);
    }, 650);

    runSimulationLoop();
  };

  const runSimulationLoop = () => {
    if (!isRacingRef.current) return;

    const now = performance.now();
    const dtMs = now - lastFrameTimeRef.current;
    lastFrameTimeRef.current = now;
    const dtFactor = Math.max(0.4, Math.min(2.2, dtMs / 16.667));

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

    if (elapsed > 32000) {
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
      audio.playVictoryJingle();

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
          avgSpeed: evalMetrics.apexScore ? evalMetrics.avgSpeed : 4.2,
          maxSpeed: evalMetrics.maxSpeed,
          maxLateralG: evalMetrics.maxLateralG
        };
      });

      useGameStore.getState().setTelemetries(telemetryMap);

      const finalResults: RaceResultItem[] = carsStateRef.current.map((c) => {
        const pTel = telemetryMap[c.playerId];
        return {
          playerId: c.playerId,
          finished: c.finished,
          time: Math.round(c.timeFinished || 999999),
          disqualified: c.disqualified,
          telemetry: pTel?.samples,
          performanceScore: pTel ? Math.round((pTel.apexScore + pTel.smoothnessScore) / 2) : 82
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

      // 1. Forward-Projecting Waypoint Follower (Never gets stuck if car slides wide onto gravel/grass!)
      let idx = car.targetIndex;
      const searchWindow = Math.min(path.length - 1, idx + 22);
      let bestIdx = idx;
      let bestDist = Math.hypot(path[idx].x - car.x, path[idx].y - car.y);

      for (let k = idx + 1; k <= searchWindow; k++) {
        const d = Math.hypot(path[k].x - car.x, path[k].y - car.y);
        if (d < bestDist + 2.5 || d < 16) {
          bestDist = d;
          bestIdx = k;
        }
      }
      if (bestIdx === idx && bestDist < 48 && idx < path.length - 1) {
        bestIdx = idx + 1;
      }
      car.targetIndex = bestIdx;
      idx = bestIdx;

      const currentSpeed = Math.hypot(car.vx, car.vy);
      const lookAheadSteps = Math.max(5, Math.min(11, Math.round(4.5 + currentSpeed * 0.9)));
      const steerIdx = Math.min(path.length - 1, idx + lookAheadSteps);
      const baseTargetPt = path[steerIdx];

      // 2. Compute local corner curvature
      const prevW = path[Math.max(0, idx - 2)];
      const currW = path[idx];
      const nextW = path[Math.min(path.length - 1, idx + 4)];
      const a1 = Math.atan2(currW.y - prevW.y, currW.x - prevW.x);
      const a2 = Math.atan2(nextW.y - currW.y, nextW.x - currW.x);
      let signedTurn = a2 - a1;
      while (signedTurn > Math.PI) signedTurn -= Math.PI * 2;
      while (signedTurn < -Math.PI) signedTurn += Math.PI * 2;
      const absCurvature = Math.abs(signedTurn);
      const spanDist = Math.max(12, Math.hypot(nextW.x - prevW.x, nextW.y - prevW.y));
      const pathCurvatureRadPerPx = absCurvature / spanDist;

      // 3. Target speed from drawn path + braking look-ahead
      const lookBrakeIdx = Math.min(path.length - 1, idx + 6);
      const rawDrawnSpeed = path[idx].speed * 0.65 + path[lookBrakeIdx].speed * 0.35;
      let targetSpeed = rawDrawnSpeed;

      // 4. Aerodynamic Slipstream (Rebufo)
      let slipstreamActive = false;
      cars.forEach((otherCar, oIdx) => {
        if (carIdx !== oIdx && !otherCar.finished && !otherCar.disqualified) {
          const dX = otherCar.x - car.x;
          const dY = otherCar.y - car.y;
          const dist = Math.hypot(dX, dY);
          if (dist > 13 && dist < 54) {
            const headingToOther = Math.atan2(dY, dX);
            let diffHead = Math.abs(headingToOther - car.angle);
            if (diffHead > Math.PI) diffHead = Math.PI * 2 - diffHead;
            if (diffHead < 0.55) {
              slipstreamActive = true;
            }
          }
        }
      });
      car.slipstreamActive = slipstreamActive;

      if (slipstreamActive) {
        targetSpeed *= 1.14;
        if (Math.random() < 0.25) {
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
      }

      // 5. Surface check & physical corner speed limit
      const surface = getTrackSurfaceInfo({ x: car.x, y: car.y }, track);
      car.offTrack = !surface.onAsphalt;

      const maxSafeSpeed = getMaxSafeCornerSpeed(
        pathCurvatureRadPerPx,
        surface.trackCurvature,
        stats.grip,
         true
      );

      // 6. Realistic F1 / NASCAR / Rally Centrifugal Excursion:
      // Entering a corner too fast pushes your racing line WIDE toward the outside kerb/gravel/grass!
      const overspeedRatio = rawDrawnSpeed / Math.max(1.2, maxSafeSpeed);
      const isCornerZone = absCurvature > 0.045 || surface.trackCurvature > 0.004;

      if (overspeedRatio > 1.12 && isCornerZone) {
        const addedFrames = Math.min(34, Math.round((overspeedRatio - 1.08) * 38));
        car.overspeedTimer = Math.max(car.overspeedTimer || 0, addedFrames);
      } else if ((car.overspeedTimer || 0) > 0) {
        car.overspeedTimer = Math.max(0, (car.overspeedTimer || 0) - dtFactor);
      }

      const isOverspeedWide = (car.overspeedTimer || 0) > 0;
      const wideExcursionPx = isOverspeedWide
        ? Math.min(30, 10 + (car.overspeedTimer || 0) * 0.65)
        : 0;

      const targetPt = {
        x: baseTargetPt.x + surface.outwardEdgeVec.x * wideExcursionPx,
        y: baseTargetPt.y + surface.outwardEdgeVec.y * wideExcursionPx
      };

      const dx = targetPt.x - car.x;
      const dy = targetPt.y - car.y;
      const targetAngle = Math.atan2(dy, dx);

      // Natural terrain drag: Asphalt = 100%, Kerb/Piano = 75%, Gravel/Grass Runoff = 44%
      const surfaceSpeedMult = surface.onAsphalt
        ? isOverspeedWide
          ? 0.76
          : 1.0
        : surface.onCurbOrGrass
          ? 0.68
          : 0.44;

      // Apex Mastery Bonus: Taking a corner at controlled speed on asphalt gives a crisp exit boost!
      const isApexBoost =
        surface.onAsphalt && !isOverspeedWide && isCornerZone && overspeedRatio >= 0.75 && overspeedRatio <= 1.05;
      const apexMult = isApexBoost ? 1.07 : 1.0;

      const activeMaxSpeed =
        stats.maxSpeed * surfaceSpeedMult * apexMult * (slipstreamActive ? 1.12 : 1.0);
      targetSpeed = Math.min(targetSpeed * surfaceSpeedMult * apexMult, activeMaxSpeed);

      const centrifugalForce =
        Math.max(absCurvature, surface.trackCurvature * 22) * currentSpeed * 0.4;
      const isDriftingNow =
        isOverspeedWide || (centrifugalForce > stats.grip && currentSpeed > 2.0);
      car.isDrifting = isDriftingNow;

      const targetVx = Math.cos(targetAngle) * targetSpeed;
      const targetVy = Math.sin(targetAngle) * targetSpeed;

      const baseSteerRate = isDriftingNow
        ? stats.acceleration * (0.55 + stats.driftRecovery * 0.35)
        : stats.acceleration * 1.18;
      const steerRate = Math.min(0.65, baseSteerRate * dtFactor);

      car.vx += (targetVx - car.vx) * steerRate;
      car.vy += (targetVy - car.vy) * steerRate;

      const effectiveTurnSign =
        Math.abs(signedTurn) > 0.03 ? Math.sign(signedTurn) : surface.trackTurnSign || 1;

      const newSpeed = Math.hypot(car.vx, car.vy);
      const velocityAngle = newSpeed > 0.05 ? Math.atan2(car.vy, car.vx) : car.angle;
      car.angle = velocityAngle;

      const targetDriftAngle = isDriftingNow
        ? THREE.MathUtils.clamp(
            effectiveTurnSign *
              Math.max(0.16, centrifugalForce - stats.grip) *
              (isOverspeedWide ? 3.0 : 2.4),
            -0.52,
            0.52
          )
        : 0;
      car.driftAngle += (targetDriftAngle - car.driftAngle) * Math.min(1, 0.22 * dtFactor);

      if (isDriftingNow) {
        if (Math.random() < (isOverspeedWide ? 0.8 : 0.6)) {
          active_particles.push({
            x: car.x - Math.cos(velocityAngle) * 7,
            y: car.y - Math.sin(velocityAngle) * 7,
            vx: (Math.random() - 0.5) * 0.8 - car.vx * 0.08,
            vy: (Math.random() - 0.5) * 0.8 - car.vy * 0.08,
            color: car.offTrack ? '#d97706' : isOverspeedWide ? '#fb7185' : 'rgba(226, 232, 240, 0.5)',
            size: Math.random() * 4.2 + 3,
            alpha: 0.75,
            life: 0,
            maxLife: Math.random() * 18 + 12
          });
        }

        const perpX = -Math.sin(velocityAngle) * 2.3;
        const perpY = Math.cos(velocityAngle) * 2.3;
        const rearX = car.x - Math.cos(velocityAngle) * 3.2;
        const rearY = car.y - Math.sin(velocityAngle) * 3.2;
        active_skidmarks.push(
          {
            x: rearX + perpX,
            y: rearY + perpY,
            color: car.offTrack ? '#78350f' : '#090d16',
            alpha: 0.45
          },
          {
            x: rearX - perpX,
            y: rearY - perpY,
            color: car.offTrack ? '#78350f' : '#090d16',
            alpha: 0.45
          }
        );

        audio.updateScreech(
          car.playerId,
          Math.min(1, isOverspeedWide ? 0.85 : centrifugalForce * 1.3)
        );
      } else {
        audio.updateScreech(car.playerId, 0);
      }

      // Kick up gravel & grass debris whenever off-track!
      if (car.offTrack && newSpeed > 0.5 && Math.random() < 0.65) {
        active_particles.push({
          x: car.x - Math.cos(velocityAngle) * 5,
          y: car.y - Math.sin(velocityAngle) * 5,
          vx: (Math.random() - 0.5) * 1.6 - car.vx * 0.15,
          vy: (Math.random() - 0.5) * 1.6 - car.vy * 0.15,
          color: surface.onCurbOrGrass ? '#f59e0b' : '#22c55e',
          size: Math.random() * 2.8 + 1.8,
          alpha: 0.88,
          life: 0,
          maxLife: 15
        });
      }

      audio.updateEngine(car.playerId, newSpeed / 5.2, car.offTrack);

      const oldX = car.x;
      const oldY = car.y;
      car.x = Math.max(12, Math.min(track.width - 12, car.x + car.vx * dtFactor));
      car.y = Math.max(12, Math.min(track.height - 12, car.y + car.vy * dtFactor));

      // 8. Car-to-car wheel-to-wheel elastic rub
      cars.forEach((otherCar, otherIdx) => {
        if (carIdx !== otherIdx && !otherCar.finished && !otherCar.disqualified) {
          const cDist = Math.hypot(car.x - otherCar.x, car.y - otherCar.y);
          if (cDist < 13 && cDist > 0.01) {
            const overlap = (13 - cDist) * 0.55;
            const pushX = (car.x - otherCar.x) / cDist;
            const pushY = (car.y - otherCar.y) / cDist;
            car.x += pushX * overlap;
            car.y += pushY * overlap;
            otherCar.x -= pushX * overlap;
            otherCar.y -= pushY * overlap;

            if (Math.random() < 0.3) {
              active_particles.push({
                x: (car.x + otherCar.x) * 0.5,
                y: (car.y + otherCar.y) * 0.5,
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2,
                color: '#fbbf24',
                size: 2.4,
                alpha: 1,
                life: 0,
                maxLife: 10
              });
            }
          }
        }
      });

      // 9. Checkpoint & Finish Line Crossing Detection
      const nextCpIdx = car.checkpointPassed + 1;
      if (nextCpIdx < track.checkpoints.length) {
        const targetCp = track.checkpoints[nextCpIdx];
        const cpDist = distToSegment({ x: car.x, y: car.y }, targetCp.p1, targetCp.p2).dist;
        if (
          checkSegmentCrossing({ x: oldX, y: oldY }, { x: car.x, y: car.y }, targetCp) ||
          cpDist < 12
        ) {
          car.checkpointPassed = nextCpIdx;
          audio.playBeep(659.25, 0.05, 'triangle');
        }
      }

      const lapProgress = path.length > 1 ? car.targetIndex / (path.length - 1) : 0;

      const crossedFinish = checkSegmentCrossing(
        { x: oldX, y: oldY },
        { x: car.x, y: car.y },
        track.startLine
      );
      if (
        (crossedFinish && (car.checkpointPassed >= track.checkpoints.length - 1 || lapProgress > 0.75)) ||
        car.targetIndex >= path.length - 2
      ) {
        car.finished = true;
        car.timeFinished = now - raceStartTimeRef.current;
        audio.stopEngine(car.playerId);
        audio.stopScreech(car.playerId);
        audio.playBeep(1046.5, 0.22, 'sine');
      }

      // 10. Telemetry sampling
      if (tick % 4 === 0) {
        if (!telemetrySamplesRef.current[car.playerId]) {
          telemetrySamplesRef.current[car.playerId] = [];
        }
        const latG = Math.min(3.5, centrifugalForce * 2.2);
        telemetrySamplesRef.current[car.playerId].push({
          timestamp: Math.round(now - raceStartTimeRef.current),
          x: Math.round(car.x),
          y: Math.round(car.y),
          speed: Number(newSpeed.toFixed(2)),
          lateralG: Number(latG.toFixed(2)),
          longitudinalG: Number((car.vx * 0.1).toFixed(2)),
          isDrifting: isDriftingNow,
          slipstreamActive,
          distToCenterline: Math.round(surface.distFromCenter),
          lapProgress: Number(Math.min(1, lapProgress).toFixed(3))
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

    const { x, y } = getSvgPointFromEvent(e);
    const startDist = Math.hypot(x - gridPos.x, y - gridPos.y);

    if (startDist > 75) {
      setDrawingError('Empieza a arrastrar desde tu coche parpadeante en la salida.');
      audio.playBeep(220, 0.12, 'square');
      return;
    }

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
      if (Math.random() < 0.28) {
        audio.playBeep(175, 0.035, 'sawtooth');
      }
    } else if (ratio > 0.92 && isCornerSection) {
      liveStatus = 'warning_drift';
      if (Math.random() < 0.14) {
        audio.playBeep(260 + clampedSpeed * 55, 0.02, 'triangle');
      }
    } else if (!isCornerSection) {
      liveStatus = clampedSpeed >= 3.8 ? 'optimal_straight' : 'slow_straight';
      if (Math.random() < 0.14) {
        audio.playBeep(240 + clampedSpeed * 80, 0.02, 'sine');
      }
    } else {
      liveStatus = 'safe_corner';
      if (Math.random() < 0.14) {
        audio.playBeep(220 + clampedSpeed * 65, 0.02, 'sine');
      }
    }

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
        audio.playBeep(620 + currentSector * 80, 0.07, 'triangle');
      } else {
        break;
      }
    }

    setActiveSpeed(clampedSpeed);
  };

  const handlePointerUp = () => {
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
    audio.playBeep(330, 0.1, 'sine');
    useGameStore.getState().restartGame();
  };

  const cycleCameraMode = () => {
    audio.playBeep(700, 0.07, 'sine');
    setCameraMode((prev) =>
      prev === 'helicopter' ? 'chase' : prev === 'chase' ? 'circuit' : 'helicopter'
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
        const ptSpeed = perfectLapGuide.perfectPath[currIdx]?.speed || 6;
        // Advance proportional to the ideal speed at this point so the user sees fast straights & slow corners
        const next = prev + ptSpeed * dt * 2.8;
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
        {/* Top-left Quick Controls: Fullscreen, Rotate 90°, Perfect Lap Demo & Camera Selector */}
        <div className="absolute top-2.5 left-2.5 flex flex-wrap items-center gap-1.5 z-30">
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
            <button
              onClick={() => {
                audio.playBeep(showPerfectLap ? 480 : 760, 0.08, 'sine');
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
          )}

          {phase === 'racing' && (
            <button
              onClick={cycleCameraMode}
              className="bg-slate-950/90 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/50 text-white px-2.5 py-1.5 rounded-lg shadow-lg flex items-center gap-1.5 transition-colors cursor-pointer text-[10px] sm:text-xs font-mono font-bold"
              title="Alternar cámara de carrera"
            >
              {cameraMode === 'helicopter' ? (
                <>
                  <Camera className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-amber-400">TV DINÁMICA</span>
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

          {/* Sector Counter Pill during Drawing */}
          {phase === 'drawing' && !allPlayersReady && (
            <div className="bg-slate-950/90 border border-slate-800 text-white text-[10px] sm:text-xs font-mono px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 pointer-events-none shadow-lg">
              <Flag className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-bold text-amber-400">
                {drawingSectorProgress}/{track.checkpoints.length}
              </span>
            </div>
          )}
        </div>

        <Canvas
          shadows
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <PerspectiveCamera
            makeDefault
            position={[400, 250, 536.7]}
            fov={50}
            near={1}
            far={2500}
          />

          <ambientLight intensity={0.65} />
          <hemisphereLight args={['#bae6fd', '#14532d', 0.55]} />
          <OrbitingDaylightSun />

          <TrackMesh track={track} />
          <Environment3D track={track} />
          <Skidmarks3D skidmarks={skidmarks} />

          {phase === 'racing'
            ? activeCars.map((car) => {
                const p = players.find((player) => player.id === car.playerId)!;
                const stats = carStats[p.carType];
                const speed = Math.hypot(car.vx, car.vy);
                const rPath = racePathsRef.current[car.playerId] || p.drawnPath;
                const isBraking =
                  speed > 1.8 &&
                  car.targetIndex < rPath.length &&
                  rPath[car.targetIndex].speed < speed * 0.92;
                const carSurf = getTrackSurfaceInfo({ x: car.x, y: car.y }, track);

                return (
                  <Car3D
                    key={car.playerId}
                    color={stats.color}
                    position={[car.x, 500 - car.y, carSurf.elevationZ + 0.15]}
                    angle={car.angle}
                    driftAngle={car.driftAngle}
                    bankAngle={carSurf.bankAngleRad}
                    isDrifting={car.isDrifting}
                    isBraking={isBraking}
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
                    color={stats.color}
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
            players.map((p) => {
              const rPath = racePathsRef.current[p.id] || p.drawnPath;
              if (rPath.length > 0) {
                return (
                  <GlowingSpline
                    key={`static-path-${p.id}`}
                    path={rPath}
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
          />
        </Canvas>

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

        {/* Interactive Live Racing Leaderboard HUD */}
        {phase === 'racing' && !countdownValue && (
          <div className="absolute top-2.5 right-2.5 bg-slate-950/90 border border-slate-800 rounded-xl p-2 shadow-xl z-20 min-w-[165px] max-w-[225px]">
            <div className="flex items-center justify-between gap-1.5 pb-1 mb-1 border-b border-slate-800 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
              <span className="flex items-center gap-1">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                Posiciones
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
                  return b.targetIndex / pathB - a.targetIndex / pathA;
                })
                .map((car, rank) => {
                  const p = players.find((player) => player.id === car.playerId);
                  const pColor = p ? carStats[p.carType]?.color || '#3b82f6' : '#3b82f6';
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
            <div className="flex items-center gap-3 font-mono text-xs tabular-nums">
              <span className="text-cyan-400 font-bold">{focusedSpeedKmh} km/h</span>
              <span className="text-slate-700">·</span>
              <span className="text-amber-400 font-bold">{focusedGear}ª</span>
              <span className="text-slate-700 hidden sm:inline">·</span>
              <span
                className={`hidden sm:inline font-bold text-[11px] ${
                  activeCarObj?.offTrack
                    ? 'text-rose-400'
                    : (activeCarObj?.overspeedTimer || 0) > 0
                      ? 'text-amber-400'
                      : activeCarObj?.isDrifting
                        ? 'text-amber-300'
                        : activeCarObj?.slipstreamActive
                          ? 'text-cyan-400'
                          : 'text-emerald-400'
                }`}
              >
                {activeCarObj?.offTrack
                  ? '⚠️ ESCAPATORIA DE GRAVA / HIERBA (-56% VEL)'
                  : (activeCarObj?.overspeedTimer || 0) > 0
                    ? '⚠️ SUBVIRAJE EN CURVA (ABRIÉNDOSE)'
                    : activeCarObj?.isDrifting
                      ? 'APOYO EN PERALTE AL LÍMITE'
                      : activeCarObj?.slipstreamActive
                        ? 'REBUFO +14%'
                        : 'TRACCIÓN EN ASFALTO ÓPTIMA'}
              </span>
            </div>
          )}
        </div>

        {/* Right side: Action Buttons */}
        <div className="flex gap-1.5 justify-end shrink-0">
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
