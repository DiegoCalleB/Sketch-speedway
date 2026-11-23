import React, { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Player, RaceCarState, Track } from '../../types';
import { F1_KMH_FACTOR, getTrackSurfaceInfo } from '../../utils/tracks';
import { ProjectedCarScreenPoint } from './renderLayers';
import { RaceCameraMode } from './CameraDirector';

const _projVec = new THREE.Vector3();

interface CarScreenProjectorProps {
  active: boolean;
  carsStateRef: React.MutableRefObject<RaceCarState[]>;
  players: Player[];
  track: Track;
  focusedPlayerId: string | null;
  projectedCarsRef: React.MutableRefObject<ProjectedCarScreenPoint[]>;
  onFrameProjectedRef: React.MutableRefObject<(() => void) | null>;
}

/**
 * Runs inside R3F's useFrame (strictly synced with CameraDirector & Car3D) to project
 * every racing car's exact 3D position into viewport coordinates and trigger the
 * dedicated 2D high-DPI overlay canvas buffer with ZERO React re-renders.
 */
export const CarScreenProjector: React.FC<CarScreenProjectorProps> = ({
  active,
  carsStateRef,
  players,
  track,
  focusedPlayerId,
  projectedCarsRef,
  onFrameProjectedRef
}) => {
  const { camera, size } = useThree();

  useFrame(() => {
    if (!active) {
      if (projectedCarsRef.current.length > 0) {
        projectedCarsRef.current = [];
        onFrameProjectedRef.current?.();
      }
      return;
    }

    const cars = carsStateRef.current;
    const out = projectedCarsRef.current;
    out.length = 0;

    // Ensure camera matrixWorldInverse is fresh after CameraDirector updated camera.lookAt()
    camera.updateMatrixWorld();

    const halfW = size.width * 0.5;
    const halfH = size.height * 0.5;
    const focusId = focusedPlayerId || players[0]?.id || null;

    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      if (car.disqualified) continue;
      const p = players.find((pl) => pl.id === car.playerId);
      if (!p) continue;

      const surf = getTrackSurfaceInfo({ x: car.x, y: car.y }, track);
      // Anchor slightly above the car's T-Cam / roll-hoop
      _projVec.set(car.x, 500 - car.y, surf.elevationZ + 4.8);
      _projVec.project(camera);

      const inFront = _projVec.z >= -1 && _projVec.z <= 1;
      const screenX = (_projVec.x + 1) * halfW;
      const screenY = (1 - _projVec.y) * halfH;
      const margin = 16;
      const isOnScreen =
        inFront &&
        screenX >= margin &&
        screenX <= size.width - margin &&
        screenY >= margin &&
        screenY <= size.height - margin;

      out.push({
        playerId: car.playerId,
        name: p.name,
        color: p.color,
        isHuman: !p.isAI,
        isFocused: car.playerId === focusId,
        screenX,
        screenY,
        ndcX: _projVec.x,
        ndcY: _projVec.y,
        inFront,
        isOnScreen,
        speedKmh: Math.round(Math.hypot(car.vx, car.vy) * F1_KMH_FACTOR),
        offTrack: car.offTrack,
        finished: car.finished,
        lap: car.lap
      });
    }

    onFrameProjectedRef.current?.();
  });

  return null;
};

interface RacingOverlayCanvasProps {
  active: boolean;
  cameraMode: RaceCameraMode;
  countdownValue: string | null;
  projectedCarsRef: React.MutableRefObject<ProjectedCarScreenPoint[]>;
  onFrameProjectedRef: React.MutableRefObject<(() => void) | null>;
}

/**
 * Dedicated full-DPR 2D Canvas Buffer layered cleanly over the WebGL viewport during 'racing'.
 * Renders razor-sharp vector car-identity badges (with anti-overlap spacing) and off-screen
 * directional radar pointers so BOTH/ALL racing cars remain 100% visible & readable in every mode.
 */
export const RacingOverlayCanvas: React.FC<RacingOverlayCanvasProps> = ({
  active,
  cameraMode,
  countdownValue,
  projectedCarsRef,
  onFrameProjectedRef
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraModeRef = useRef(cameraMode);
  const countdownRef = useRef(countdownValue);
  cameraModeRef.current = cameraMode;
  countdownRef.current = countdownValue;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const syncCanvasSize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const targetW = Math.max(1, Math.round(rect.width * dpr));
      const targetH = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    syncCanvasSize();
    const ro = new ResizeObserver(syncCanvasSize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const drawOverlay = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const targetW = Math.max(1, Math.round(w * dpr));
      const targetH = Math.max(1, Math.round(h * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      if (!active) return;

      const items = projectedCarsRef.current;
      if (!items || items.length === 0) return;

      const isOnboard = cameraModeRef.current === 'onboard';
      const isCountingDown = countdownRef.current !== null && countdownRef.current !== '¡YA!';

      // Compute non-overlapping label positions for on-screen cars
      const placedBoxes: { x: number; y: number; w: number; h: number }[] = [];

      for (let i = 0; i < items.length; i++) {
        const car = items[i];
        // Don't draw a floating label over our own cockpit hood in onboard T-Cam
        if (isOnboard && car.isFocused) continue;

        if (car.isOnScreen) {
          const shortName = car.name.length > 10 ? car.name.slice(0, 9) + '…' : car.name;
          const label = isCountingDown ? shortName : `${shortName} ${car.speedKmh}`;

          ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
          const textW = ctx.measureText(label).width;
          const boxW = textW + 18;
          const boxH = 18;

          let drawX = Math.max(boxW * 0.5 + 8, Math.min(w - boxW * 0.5 - 8, car.screenX));
          let drawY = Math.max(58, Math.min(h - 28, car.screenY - 22));

          // Anti-overlap bump when both cars are wheel-to-wheel
          for (let j = 0; j < placedBoxes.length; j++) {
            const b = placedBoxes[j];
            if (Math.abs(drawX - b.x) < (boxW + b.w) * 0.52 && Math.abs(drawY - b.y) < boxH + 4) {
              drawY = Math.max(54, b.y - boxH - 5);
            }
          }
          placedBoxes.push({ x: drawX, y: drawY, w: boxW, h: boxH });

          // Crisp pointer chevron pointing straight down to the car roof
          const tipY = Math.min(h - 8, Math.max(drawY + boxH * 0.5 + 4, car.screenY - 5));
          ctx.beginPath();
          ctx.moveTo(car.screenX, tipY);
          ctx.lineTo(car.screenX - 4, tipY - 5);
          ctx.lineTo(car.screenX + 4, tipY - 5);
          ctx.closePath();
          ctx.fillStyle = car.color;
          ctx.fill();

          // Rounded crisp dark pill plate (high contrast on bright tarmac or green grass)
          const bx = drawX - boxW * 0.5;
          const by = drawY - boxH * 0.5;
          const r = 5;
          ctx.beginPath();
          ctx.moveTo(bx + r, by);
          ctx.lineTo(bx + boxW - r, by);
          ctx.quadraticCurveTo(bx + boxW, by, bx + boxW, by + r);
          ctx.lineTo(bx + boxW, by + boxH - r);
          ctx.quadraticCurveTo(bx + boxW, by + boxH, bx + boxW - r, by + boxH);
          ctx.lineTo(bx + r, by + boxH);
          ctx.quadraticCurveTo(bx, by + boxH, bx, by + boxH - r);
          ctx.lineTo(bx, by + r);
          ctx.quadraticCurveTo(bx, by, bx + r, by);
          ctx.closePath();

          ctx.fillStyle = 'rgba(2, 6, 23, 0.86)';
          ctx.fill();
          ctx.lineWidth = car.isHuman ? 1.5 : 1.1;
          ctx.strokeStyle = car.offTrack ? '#fbbf24' : car.color;
          ctx.stroke();

          // Color identity dot
          ctx.beginPath();
          ctx.arc(bx + 7, drawY, 3, 0, Math.PI * 2);
          ctx.fillStyle = car.color;
          ctx.fill();

          // Sharp monospace text
          ctx.fillStyle = '#f8fafc';
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'left';
          ctx.fillText(label, bx + 13, drawY + 0.5);
        } else {
          // Off-screen car directional edge pointer (e.g., in Onboard T-Cam or Chase mode)
          let dirX = car.screenX - w * 0.5;
          let dirY = car.screenY - h * 0.5;
          if (!car.inFront) {
            dirX = -dirX;
            dirY = -dirY;
          }
          const angle = Math.atan2(dirY, dirX);
          const padX = 28;
          const padTop = 64;
          const padBottom = 30;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const rx = Math.max(1, w * 0.5 - padX);
          const ry = Math.max(1, (h - padTop - padBottom) * 0.5);
          const scale = 1 / Math.max(Math.abs(cos) / rx, Math.abs(sin) / ry, 0.0001);
          const cx = w * 0.5 + cos * scale;
          const cy = padTop + ry + sin * scale;

          ctx.save();
          ctx.translate(cx, cy);

          // Crisp outer badge ring
          ctx.beginPath();
          ctx.arc(0, 0, 12, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(2, 6, 23, 0.9)';
          ctx.fill();
          ctx.lineWidth = 1.8;
          ctx.strokeStyle = car.color;
          ctx.stroke();

          // Directional triangle pointing toward off-screen car
          ctx.save();
          ctx.rotate(angle);
          ctx.beginPath();
          ctx.moveTo(18, 0);
          ctx.lineTo(11, -5);
          ctx.lineTo(11, 5);
          ctx.closePath();
          ctx.fillStyle = car.color;
          ctx.fill();
          ctx.restore();

          // Initials inside badge
          ctx.font = '800 9px ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(car.name.slice(0, 2).toUpperCase(), 0, 0.5);

          ctx.restore();
        }
      }
    };

    onFrameProjectedRef.current = drawOverlay;
    drawOverlay();

    return () => {
      onFrameProjectedRef.current = null;
      ro.disconnect();
    };
  }, [active, projectedCarsRef, onFrameProjectedRef]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 w-full h-full z-20"
      aria-hidden="true"
    />
  );
};
