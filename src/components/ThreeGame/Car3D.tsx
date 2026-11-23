import React, { useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { RaceCarState, Track } from '../../types';
import { getTrackSurfaceInfo } from '../../utils/tracks';
import { CARS_RENDER_LAYER } from './renderLayers';

interface Car3DProps {
  playerId?: string;
  carsStateRef?: React.MutableRefObject<RaceCarState[]>;
  track?: Track;
  isRacing?: boolean;
  color: string;
  position: [number, number, number];
  angle: number;
  driftAngle?: number;
  steerAngle?: number;
  slipAngle?: number;
  longitudinalG?: number;
  lateralG?: number;
  bankAngle?: number;
  isDrifting: boolean;
  isBraking: boolean;
  drsActive?: boolean;
  throttle?: number;
  name: string;
  active?: boolean;
  speed?: number;
  showLabel?: boolean;
  carNumber?: number;
}

// High-detail procedural woven carbon-fiber albedo + tangent normal map
const createCarbonFiberMaps = (maxAnisotropy: number) => {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const normCanvas = document.createElement('canvas');
  normCanvas.width = size;
  normCanvas.height = size;
  const nCtx = normCanvas.getContext('2d');

  if (!ctx || !nCtx) {
    return { map: new THREE.Texture(), normalMap: new THREE.Texture() };
  }

  ctx.fillStyle = '#090d14';
  ctx.fillRect(0, 0, size, size);
  nCtx.fillStyle = 'rgb(128, 128, 255)';
  nCtx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 8) {
    for (let x = 0; x < size; x += 8) {
      const alt = ((x + y) / 8) % 2 === 0;
      ctx.fillStyle = alt ? '#252f42' : '#111622';
      ctx.fillRect(x, y, 7, 4);
      ctx.fillStyle = alt ? '#111622' : '#2f3a50';
      ctx.fillRect(x, y + 4, 7, 4);

      nCtx.fillStyle = alt ? 'rgb(154, 120, 248)' : 'rgb(104, 136, 248)';
      nCtx.fillRect(x, y, 7, 4);
      nCtx.fillStyle = alt ? 'rgb(108, 146, 248)' : 'rgb(148, 114, 248)';
      nCtx.fillRect(x, y + 4, 7, 4);
    }
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(6, 5);
  map.anisotropy = maxAnisotropy;

  const normalMap = new THREE.CanvasTexture(normCanvas);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(6, 5);
  normalMap.anisotropy = maxAnisotropy;

  return { map, normalMap };
};

// Automotive Metallic-Flake Micro-Normal Map for real Ferrari/McLaren/Mercedes clearcoat shimmer
const createMetallicFlakeNormalMap = () => {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  ctx.fillStyle = 'rgb(128, 128, 255)';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 4500; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 114 + Math.floor(Math.random() * 28);
    const g = 114 + Math.floor(Math.random() * 28);
    ctx.fillStyle = `rgb(${r}, ${g}, 252)`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  return tex;
};

// Procedural Pirelli P-Zero 18-inch Tire Sidewall Ring Texture (shows realistic spinning motion!)
const createTireSidewallTexture = (accentColor: string, maxAnisotropy: number) => {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  const cx = size * 0.5;
  const cy = size * 0.5;

  ctx.clearRect(0, 0, size, size);

  // Dark rubber sidewall ring
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.49, 0, Math.PI * 2);
  ctx.fillStyle = '#12161f';
  ctx.fill();

  // Inner rim cutout
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.31, 0, Math.PI * 2);
  ctx.fillStyle = '#1c222e';
  ctx.fill();

  // Iconic dual-arc Pirelli compound stripe (makes wheel rotation immediately readable!)
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.39, 0.25, Math.PI - 0.25);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.39, Math.PI + 0.25, Math.PI * 2 - 0.25);
  ctx.stroke();

  // Crisp sidewall stencil dashes at opposite poles
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.43, -0.14, 0.14);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.43, Math.PI - 0.14, Math.PI + 0.14);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
};

// Procedural radial contact-shadow gradient under the F1 Venturi floor
const createContactShadowTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  const grad = ctx.createRadialGradient(64, 32, 6, 64, 32, 60);
  grad.addColorStop(0.0, 'rgba(2, 6, 20, 0.94)');
  grad.addColorStop(0.55, 'rgba(2, 6, 20, 0.68)');
  grad.addColorStop(0.84, 'rgba(2, 6, 20, 0.22)');
  grad.addColorStop(1.0, 'rgba(2, 6, 20, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 64);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

// Build sculpted CAD-beveled aerodynamic geometries (no boxy primitives!)
const createSculptedF1Geometries = () => {
  // 1. Sleek tapered & sloped F1 Monocoque + Nosecone Side Profile extruded with rounded aerodynamic bevels
  const noseShape = new THREE.Shape();
  noseShape.moveTo(-4.85, 0.35);
  noseShape.lineTo(2.45, 0.35);
  noseShape.quadraticCurveTo(5.65, 0.34, 7.35, 0.22);
  noseShape.lineTo(7.45, 0.44);
  noseShape.quadraticCurveTo(5.25, 0.90, 2.15, 1.50);
  noseShape.lineTo(-1.35, 1.58);
  noseShape.quadraticCurveTo(-2.15, 2.42, -2.85, 2.30);
  noseShape.lineTo(-4.95, 1.38);
  noseShape.closePath();

  const monocoqueGeo = new THREE.ExtrudeGeometry(noseShape, {
    depth: 1.48,
    bevelEnabled: true,
    bevelSegments: 5,
    steps: 1,
    bevelSize: 0.22,
    bevelThickness: 0.24
  });
  monocoqueGeo.translate(0, 0, -0.74);
  monocoqueGeo.rotateX(Math.PI / 2);
  monocoqueGeo.computeVertexNormals();

  // 2. Sculpted Water-Slide Undercut Sidepod Geometry
  const podShape = new THREE.Shape();
  podShape.moveTo(-3.95, 0.38);
  podShape.lineTo(2.25, 0.38);
  podShape.quadraticCurveTo(2.48, 0.94, 2.18, 1.38);
  podShape.quadraticCurveTo(0.42, 1.44, -1.62, 1.16);
  podShape.quadraticCurveTo(-3.25, 0.86, -3.95, 0.65);
  podShape.closePath();

  const sidepodGeo = new THREE.ExtrudeGeometry(podShape, {
    depth: 1.08,
    bevelEnabled: true,
    bevelSegments: 4,
    steps: 1,
    bevelSize: 0.18,
    bevelThickness: 0.22
  });
  sidepodGeo.translate(0, 0, -0.54);
  sidepodGeo.rotateX(Math.PI / 2);
  sidepodGeo.computeVertexNormals();

  // 3. Swept Delta Front Wing Mainplane Profile
  const fwShape = new THREE.Shape();
  fwShape.moveTo(-0.35, -3.32);
  fwShape.quadraticCurveTo(0.35, -1.6, 0.65, 0.0);
  fwShape.quadraticCurveTo(0.35, 1.6, -0.35, 3.32);
  fwShape.lineTo(-0.98, 3.32);
  fwShape.quadraticCurveTo(-0.42, 1.5, -0.22, 0.0);
  fwShape.quadraticCurveTo(-0.42, -1.5, -0.98, -3.32);
  fwShape.closePath();

  const frontWingGeo = new THREE.ExtrudeGeometry(fwShape, {
    depth: 0.12,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.04,
    bevelThickness: 0.04
  });
  frontWingGeo.computeVertexNormals();

  // 4. Curved Titanium Halo Tube
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.35, -0.78, 1.72),
    new THREE.Vector3(0.45, -0.74, 2.02),
    new THREE.Vector3(1.42, -0.36, 2.06),
    new THREE.Vector3(1.85, 0.0, 2.0),
    new THREE.Vector3(1.42, 0.36, 2.06),
    new THREE.Vector3(0.45, 0.74, 2.02),
    new THREE.Vector3(-0.35, 0.78, 1.72)
  ]);
  const haloCurveGeo = new THREE.TubeGeometry(curve, 28, 0.11, 10, false);

  return { monocoqueGeo, sidepodGeo, frontWingGeo, haloCurveGeo };
};

const _normalScaleCarbon = new THREE.Vector2(1.25, 1.25);
const _normalScaleFlake = new THREE.Vector2(0.18, 0.18);
const _colBrakeRed = new THREE.Color('#ff1e42');
const _colCyan = new THREE.Color('#22d3ee');
const _colDarkRain = new THREE.Color('#7f1d1d');
const _colDarkBrake = new THREE.Color('#450a0a');

export const Car3D: React.FC<Car3DProps> = ({
  playerId,
  carsStateRef,
  track,
  isRacing = false,
  color,
  position,
  angle,
  steerAngle = 0,
  longitudinalG = 0,
  lateralG = 0,
  bankAngle = 0,
  isDrifting,
  isBraking,
  drsActive = false,
  throttle = 0,
  name,
  active = false,
  speed = 0,
  showLabel = false
}) => {
  const { gl } = useThree();
  const maxAnisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());

  const rootGroupRef = useRef<THREE.Group>(null);
  const contactShadowRef = useRef<THREE.Mesh>(null);
  const carGroupRef = useRef<THREE.Group>(null);
  const chassisBodyRef = useRef<THREE.Group>(null);
  const frontLeftWheelGroupRef = useRef<THREE.Group>(null);
  const frontRightWheelGroupRef = useRef<THREE.Group>(null);
  const frontLeftTireRef = useRef<THREE.Group>(null);
  const frontRightTireRef = useRef<THREE.Group>(null);
  const rearLeftTireRef = useRef<THREE.Group>(null);
  const rearRightTireRef = useRef<THREE.Group>(null);
  const steeringWheelRef = useRef<THREE.Group>(null);
  const driverHelmetRef = useRef<THREE.Group>(null);
  const drsFlapRef = useRef<THREE.Mesh>(null);
  const exhaustFlameRef = useRef<THREE.Group>(null);
  const leftVortexRef = useRef<THREE.Mesh>(null);
  const rightVortexRef = useRef<THREE.Mesh>(null);
  const tailLightPointRef = useRef<THREE.PointLight>(null);

  const smoothYawRef = useRef<number>(-angle);
  const brakeHeatRef = useRef<number>(0);

  const flBrakeMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const frBrakeMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const rlBrakeMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const rrBrakeMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const steeringLedMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const rainLightMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const leftBrakeLedMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const rightBrakeLedMatRef = useRef<THREE.MeshStandardMaterial>(null);

  // Assign entire Car3D hierarchy strictly to CARS_RENDER_LAYER (Layer 1) with frustumCulled=false
  // so BOTH/ALL cars render in Pass 2 at native full-DPR sharpness with ZERO bloom smear or scenery occlusion
  useLayoutEffect(() => {
    const root = rootGroupRef.current;
    if (!root) return;
    root.traverse((obj) => {
      obj.layers.set(CARS_RENDER_LAYER);
      if ((obj as THREE.Light).isLight) {
        obj.layers.enable(0);
      }
      obj.frustumCulled = false;
    });
  }, [active, showLabel, isRacing]);

  // Synchronize initial / drawing-mode transforms imperatively so React HUD re-renders during 'racing'
  // can NEVER overwrite live physics positions managed inside useFrame
  useLayoutEffect(() => {
    if (!isRacing) {
      if (rootGroupRef.current) {
        rootGroupRef.current.visible = true;
        rootGroupRef.current.position.set(position[0], position[1], position[2]);
      }
      if (contactShadowRef.current) {
        contactShadowRef.current.rotation.set(0, 0, -angle);
      }
      if (carGroupRef.current) {
        carGroupRef.current.rotation.z = -angle;
      }
      smoothYawRef.current = -angle;
    } else if (rootGroupRef.current && carsStateRef?.current && playerId && track) {
      const liveCar = carsStateRef.current.find((c) => c.playerId === playerId);
      if (liveCar) {
        const carSurf = getTrackSurfaceInfo({ x: liveCar.x, y: liveCar.y }, track);
        rootGroupRef.current.position.set(liveCar.x, 500 - liveCar.y, carSurf.elevationZ + 0.15);
        if (contactShadowRef.current) contactShadowRef.current.rotation.set(0, 0, -liveCar.angle);
        if (carGroupRef.current) carGroupRef.current.rotation.z = -liveCar.angle;
        smoothYawRef.current = -liveCar.angle;
      } else {
        rootGroupRef.current.position.set(position[0], position[1], position[2]);
        if (contactShadowRef.current) contactShadowRef.current.rotation.set(0, 0, -angle);
        if (carGroupRef.current) carGroupRef.current.rotation.z = -angle;
        smoothYawRef.current = -angle;
      }
    }
  }, [isRacing, position[0], position[1], position[2], angle, carsStateRef, playerId, track]);

  const {
    carbonMaps,
    flakeNormalMap,
    tireSidewallTex,
    shadowTex,
    monocoqueGeo,
    sidepodGeo,
    frontWingGeo,
    haloCurveGeo
  } = useMemo(() => {
    const cMaps = createCarbonFiberMaps(maxAnisotropy);
    const flake = createMetallicFlakeNormalMap();
    const sidewall = createTireSidewallTexture(color, maxAnisotropy);
    const sTex = createContactShadowTexture();
    const geos = createSculptedF1Geometries();
    return {
      carbonMaps: cMaps,
      flakeNormalMap: flake,
      tireSidewallTex: sidewall,
      shadowTex: sTex,
      ...geos
    };
  }, [color, maxAnisotropy]);

  useEffect(() => {
    return () => {
      carbonMaps.map.dispose();
      carbonMaps.normalMap.dispose();
      flakeNormalMap.dispose();
      tireSidewallTex.dispose();
      shadowTex.dispose();
      monocoqueGeo.dispose();
      sidepodGeo.dispose();
      frontWingGeo.dispose();
      haloCurveGeo.dispose();
    };
  }, [
    carbonMaps,
    flakeNormalMap,
    tireSidewallTex,
    shadowTex,
    monocoqueGeo,
    sidepodGeo,
    frontWingGeo,
    haloCurveGeo
  ]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const elapsed = state.clock.getElapsedTime();

    // Direct 60/120fps physics-ref synchronization during 'racing' (zero React reconciliation lag!)
    let liveSpeed = speed;
    let liveAngle = angle;
    let liveSteerAngle = steerAngle;
    let liveLongG = longitudinalG;
    let liveLatG = lateralG;
    let liveBankAngle = bankAngle;
    let liveDrifting = isDrifting;
    let liveBraking = isBraking;
    let liveDrs = drsActive;
    let liveThrottle = throttle;

    if (isRacing && carsStateRef?.current && playerId && track) {
      const liveCar = carsStateRef.current.find((c) => c.playerId === playerId);
      if (liveCar) {
        if (rootGroupRef.current) {
          const isHidden = Boolean(liveCar.disqualified);
          rootGroupRef.current.visible = !isHidden;
          if (isHidden) return;
          const carSurf = getTrackSurfaceInfo({ x: liveCar.x, y: liveCar.y }, track);
          rootGroupRef.current.position.set(liveCar.x, 500 - liveCar.y, carSurf.elevationZ + 0.15);
          liveBankAngle = carSurf.bankAngleRad;
        }
        if (contactShadowRef.current) {
          contactShadowRef.current.rotation.z = -liveCar.angle;
        }
        liveSpeed = Math.hypot(liveCar.vx, liveCar.vy);
        liveAngle = liveCar.angle;
        liveSteerAngle = liveCar.steerAngle ?? 0;
        liveLongG = liveCar.longitudinalG ?? 0;
        liveLatG = liveCar.lateralG ?? 0;
        liveDrifting = liveCar.isDrifting;
        liveBraking = (liveCar.brake ?? 0) > 0.18 && liveSpeed > 1.4;
        liveDrs = Boolean(liveCar.drsActive);
        liveThrottle = liveCar.throttle ?? 0;
      }
    } else if (rootGroupRef.current) {
      rootGroupRef.current.visible = true;
      rootGroupRef.current.position.set(position[0], position[1], position[2]);
      if (contactShadowRef.current) {
        contactShadowRef.current.rotation.z = -angle;
      }
    }

    // 1. Spin 18-inch Pirelli tires at exact angular velocity v / R
    const wheelSpinSpeed = liveSpeed * 25 * dt;
    if (rearLeftTireRef.current && rearRightTireRef.current) {
      rearLeftTireRef.current.rotation.y += wheelSpinSpeed * 0.92;
      rearRightTireRef.current.rotation.y += wheelSpinSpeed * 0.92;
    }
    if (frontLeftTireRef.current && frontRightTireRef.current) {
      frontLeftTireRef.current.rotation.y += wheelSpinSpeed;
      frontRightTireRef.current.rotation.y += wheelSpinSpeed;
    }

    // 2. Real Physical Ackermann Front-Wheel Steering (inner wheel turns tighter than outer wheel!)
    if (frontLeftWheelGroupRef.current && frontRightWheelGroupRef.current) {
      // In 3D Z-up coordinates (3D Y = 500 - 2D y), 2D clockwise +steerAngle maps to -steerAngle around +Z
      const baseSteerZ = THREE.MathUtils.clamp(-liveSteerAngle, -0.52, 0.52);
      const ackermannLeft = baseSteerZ < 0 ? baseSteerZ * 1.12 : baseSteerZ * 0.92;
      const ackermannRight = baseSteerZ > 0 ? baseSteerZ * 1.12 : baseSteerZ * 0.92;
      frontLeftWheelGroupRef.current.rotation.z = THREE.MathUtils.damp(
        frontLeftWheelGroupRef.current.rotation.z,
        ackermannLeft,
        22,
        dt
      );
      frontRightWheelGroupRef.current.rotation.z = THREE.MathUtils.damp(
        frontRightWheelGroupRef.current.rotation.z,
        ackermannRight,
        22,
        dt
      );
    }

    // Rotate F1 cockpit steering wheel in sync with physical front-wheel steering!
    if (steeringWheelRef.current) {
      const targetWheelRoll = THREE.MathUtils.clamp(-liveSteerAngle * 2.1, -1.1, 1.1);
      steeringWheelRef.current.rotation.x = THREE.MathUtils.damp(
        steeringWheelRef.current.rotation.x,
        targetWheelRoll,
        20,
        dt
      );
    }

    // Driver helmet naturally looks toward the apex & leans against lateral G-forces!
    if (driverHelmetRef.current) {
      const headLookZ = THREE.MathUtils.clamp(-liveSteerAngle * 0.72, -0.34, 0.34);
      const headTiltX = THREE.MathUtils.clamp(liveLatG * 0.045, -0.22, 0.22);
      driverHelmetRef.current.rotation.z = THREE.MathUtils.damp(
        driverHelmetRef.current.rotation.z,
        headLookZ,
        14,
        dt
      );
      driverHelmetRef.current.rotation.x = THREE.MathUtils.damp(
        driverHelmetRef.current.rotation.x,
        headTiltX,
        12,
        dt
      );
    }

    // 3. True Rigid-Body Chassis Yaw (-angle directly — ZERO artificial drift double-counting!)
    if (carGroupRef.current) {
      const targetYaw = -liveAngle;
      let diff = targetYaw - smoothYawRef.current;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      smoothYawRef.current += diff * Math.min(1, dt * 26);
      carGroupRef.current.rotation.z = smoothYawRef.current;

      // Track banking camber + real lateral G-force body roll
      const targetRoll = THREE.MathUtils.clamp(
        liveBankAngle * 1.4 + liveLatG * 0.022,
        -0.28,
        0.28
      );
      carGroupRef.current.rotation.x = THREE.MathUtils.damp(
        carGroupRef.current.rotation.x,
        targetRoll,
        14,
        dt
      );
    }

    // 4. Physical Suspension Pitch (Braking Nose-Dive / Launch Squat) & Ground-Effect Aero Ride-Height Compression
    if (chassisBodyRef.current) {
      const targetPitch = THREE.MathUtils.clamp(-liveLongG * 0.015, -0.042, 0.068);
      chassisBodyRef.current.rotation.y = THREE.MathUtils.damp(
        chassisBodyRef.current.rotation.y,
        targetPitch,
        14,
        dt
      );
      // Aerodynamic downforce compresses suspension lower at 300+ km/h + subtle high-frequency floor porpoising
      const aeroCompression = -THREE.MathUtils.clamp((liveSpeed - 3.5) * 0.028, 0, 0.12);
      const buzz = liveSpeed > 5.4 ? Math.sin(elapsed * 58) * 0.018 : 0;
      chassisBodyRef.current.position.z = THREE.MathUtils.damp(
        chassisBodyRef.current.position.z,
        aeroCompression + buzz,
        16,
        dt
      );
    }

    // 5. Real Active Aerodynamic DRS Rear Flap synced to physics drsActive state
    if (drsFlapRef.current) {
      const isDrsNow = liveDrs || (liveSpeed > 6.1 && !liveBraking && !liveDrifting);
      const targetDrsPitch = isDrsNow ? -0.46 : 0.16;
      drsFlapRef.current.rotation.y = THREE.MathUtils.damp(
        drsFlapRef.current.rotation.y,
        targetDrsPitch,
        16,
        dt
      );
    }

    // 6. Incandescent Carbon-Ceramic Brake Disc Glow & Rear Brake LEDs driven directly by live deceleration
    const brakingEnergy =
      liveBraking && liveSpeed > 1.6 ? Math.min(1, 0.45 + Math.abs(liveLongG) * 0.25) : 0;
    brakeHeatRef.current = THREE.MathUtils.damp(
      brakeHeatRef.current,
      brakingEnergy,
      liveBraking ? 11.5 : 2.6,
      dt
    );
    const glowIntensity = brakeHeatRef.current * 9.5;
    if (flBrakeMatRef.current) flBrakeMatRef.current.emissiveIntensity = glowIntensity;
    if (frBrakeMatRef.current) frBrakeMatRef.current.emissiveIntensity = glowIntensity;
    if (rlBrakeMatRef.current) rlBrakeMatRef.current.emissiveIntensity = glowIntensity;
    if (rrBrakeMatRef.current) rrBrakeMatRef.current.emissiveIntensity = glowIntensity;

    if (steeringLedMatRef.current) {
      steeringLedMatRef.current.emissive.copy(liveBraking ? _colBrakeRed : _colCyan);
    }
    if (rainLightMatRef.current) {
      const lit = liveBraking || liveDrifting;
      rainLightMatRef.current.color.copy(lit ? _colBrakeRed : _colDarkRain);
      rainLightMatRef.current.emissiveIntensity = lit ? 9.5 : 1.5;
    }
    if (leftBrakeLedMatRef.current) {
      leftBrakeLedMatRef.current.color.copy(liveBraking ? _colBrakeRed : _colDarkBrake);
      leftBrakeLedMatRef.current.emissiveIntensity = liveBraking ? 7.8 : 0.3;
    }
    if (rightBrakeLedMatRef.current) {
      rightBrakeLedMatRef.current.color.copy(liveBraking ? _colBrakeRed : _colDarkBrake);
      rightBrakeLedMatRef.current.emissiveIntensity = liveBraking ? 7.8 : 0.3;
    }

    // 7. Exhaust Overrun Backfire Flame Plume & Dynamic Real-Time Diffuser PointLight
    const isBackfiring =
      (liveBraking && liveSpeed > 2.6 && Math.sin(elapsed * 46) > 0.22) ||
      (liveThrottle > 0.8 && liveLongG > 0.9 && liveSpeed > 2.8 && Math.sin(elapsed * 58) > 0.45);

    if (exhaustFlameRef.current) {
      exhaustFlameRef.current.visible = isBackfiring;
      if (isBackfiring) {
        const pulseScale = 0.85 + Math.random() * 0.72;
        exhaustFlameRef.current.scale.set(pulseScale, 1.0 + Math.random() * 0.35, pulseScale);
      }
    }

    if (tailLightPointRef.current) {
      if (isBackfiring) {
        tailLightPointRef.current.color.set('#38bdf8');
        tailLightPointRef.current.intensity = 16;
      } else if (liveBraking || liveDrifting) {
        tailLightPointRef.current.color.set('#ff1e42');
        tailLightPointRef.current.intensity = 3.2;
      } else {
        tailLightPointRef.current.intensity = 0;
      }
    }

    // 8. Aerodynamic Rear Wingtip Condensation Vortices above 265 km/h
    if (leftVortexRef.current && rightVortexRef.current) {
      const showVortex = liveSpeed > 5.55;
      leftVortexRef.current.visible = showVortex;
      rightVortexRef.current.visible = showVortex;
      if (showVortex) {
        const vAlpha = Math.min(0.38, (liveSpeed - 5.55) * 0.18);
        (leftVortexRef.current.material as THREE.MeshBasicMaterial).opacity = vAlpha;
        (rightVortexRef.current.material as THREE.MeshBasicMaterial).opacity = vAlpha;
      }
    }
  });

  // Helper for detailed 18" Open-Wheel Pirelli Slick + Brembo Caliper + Carbon Duct + Glowing Ceramic Rotor
  const renderWheelAssembly = (
    tireRef: React.RefObject<THREE.Group | null>,
    brakeMatRef: React.RefObject<THREE.MeshStandardMaterial | null>,
    radius: number,
    width: number,
    isLeft: boolean
  ) => {
    const sideSign = isLeft ? -1 : 1;
    return (
      <group>
        {/* Stationary Carbon-Fiber Aerodynamic Brake Scoop & Wheel Wake Deflector */}
        <mesh position={[0.15, -sideSign * (width * 0.44), 0.28]}>
          <boxGeometry args={[radius * 1.02, 0.2, radius * 1.22]} />
          <meshStandardMaterial
            map={carbonMaps.map}
            normalMap={carbonMaps.normalMap}
            roughness={0.34}
            metalness={0.48}
          />
        </mesh>

        {/* Stationary Brembo 6-Piston Racing Brake Caliper */}
        <mesh position={[-radius * 0.36, -sideSign * (width * 0.32), 0.12]}>
          <boxGeometry args={[0.38, 0.32, 0.65]} />
          <meshPhysicalMaterial
            color="#ef4444"
            roughness={0.16}
            metalness={0.78}
            clearcoat={1.0}
          />
        </mesh>

        {/* Stationary Incandescent Carbon-Ceramic Brake Disc */}
        <mesh position={[0, -sideSign * (width * 0.34), 0]}>
          <cylinderGeometry args={[radius * 0.62, radius * 0.62, 0.2, 20]} />
          <meshStandardMaterial
            ref={brakeMatRef}
            color="#334155"
            emissive="#ff4500"
            emissiveIntensity={0}
            roughness={0.40}
            metalness={0.70}
          />
        </mesh>

        {/* Spinning Tire + Rim Group */}
        <group ref={tireRef}>
          {/* Main Pirelli P-Zero Rubber Slick Tread */}
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[radius, radius, width * 0.86, 28]} />
            <meshPhysicalMaterial
              color="#0e1118"
              roughness={0.56}
              metalness={0.08}
              clearcoat={0.44}
              clearcoatRoughness={0.34}
            />
          </mesh>
          {/* Rounded Toroidal Tire Shoulders */}
          <mesh
            position={[0, sideSign * (width * 0.43), 0]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <torusGeometry args={[radius * 0.84, radius * 0.16, 12, 28]} />
            <meshPhysicalMaterial
              color="#121620"
              roughness={0.60}
              metalness={0.08}
              clearcoat={0.32}
            />
          </mesh>
          <mesh
            position={[0, -sideSign * (width * 0.43), 0]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <torusGeometry args={[radius * 0.84, radius * 0.16, 12, 28]} />
            <meshPhysicalMaterial
              color="#121620"
              roughness={0.60}
              metalness={0.08}
              clearcoat={0.32}
            />
          </mesh>

          {/* Pirelli P-Zero Sidewall Compound Graphics Disc */}
          <mesh position={[0, sideSign * (width * 0.51), 0]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[radius * 0.96, 28]} />
            <meshStandardMaterial
              map={tireSidewallTex}
              transparent
              roughness={0.55}
              metalness={0.12}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* Deep-Dish Brushed Metallic 18" BBS/OZ Aero Wheel Rim Face */}
          <mesh position={[0, sideSign * (width * 0.49), 0]}>
            <cylinderGeometry args={[radius * 0.62, radius * 0.56, 0.12, 20]} />
            <meshPhysicalMaterial
              color="#1e2532"
              roughness={0.18}
              metalness={0.94}
              clearcoat={0.6}
            />
          </mesh>
          {/* Center-Lock Anodized Gold Wheel Nut */}
          <mesh position={[0, sideSign * (width * 0.54), 0]}>
            <cylinderGeometry args={[radius * 0.17, radius * 0.19, 0.14, 6]} />
            <meshStandardMaterial color="#f59e0b" roughness={0.16} metalness={0.96} />
          </mesh>
          {/* Multi-Spoke Forged Alloy Star Pattern */}
          {[0, Math.PI / 3, (Math.PI * 2) / 3].map((ang, sIdx) => (
            <mesh
              key={`spoke-${sIdx}`}
              position={[0, sideSign * (width * 0.525), 0]}
              rotation={[0, ang, 0]}
            >
              <boxGeometry args={[radius * 1.14, 0.04, 0.12]} />
              <meshStandardMaterial color="#cbd5e1" roughness={0.16} metalness={0.96} />
            </mesh>
          ))}
        </group>
      </group>
    );
  };

  return (
    <group ref={rootGroupRef}>
      {/* Soft Grounded Contact Shadow directly beneath Venturi Floor */}
      <mesh ref={contactShadowRef} position={[0, 0, -0.04]}>
        <planeGeometry args={[18.8, 10.4]} />
        <meshBasicMaterial map={shadowTex} transparent opacity={0.94} depthWrite={false} />
      </mesh>

      {/* Subtle Active Car Focus Ring (only in drawing/selection) */}
      {!isRacing && active && speed < 0.1 && (
        <mesh position={[0, 0, -0.02]}>
          <ringGeometry args={[7.8, 8.7, 36]} />
          <meshBasicMaterial color={color} transparent opacity={0.48} depthWrite={false} />
        </mesh>
      )}

      <group ref={carGroupRef}>
        {/* Suspended Chassis Group */}
        <group ref={chassisBodyRef}>
          {/* Compact Dynamic PointLight at Rear Diffuser */}
          {active && (
            <pointLight
              ref={tailLightPointRef}
              position={[-6.4, 0, 1.0]}
              color="#ff1e42"
              intensity={0}
              distance={12}
              decay={2}
            />
          )}

          {/* Carbon-Fiber Venturi Underfloor Plank & Sculpted Rear Diffuser Tunnels */}
          <mesh castShadow receiveShadow position={[-0.35, 0, 0.34]}>
            <boxGeometry args={[12.0, 5.25, 0.18]} />
            <meshStandardMaterial
              map={carbonMaps.map}
              normalMap={carbonMaps.normalMap}
              normalScale={_normalScaleCarbon}
              roughness={0.34}
              metalness={0.52}
            />
          </mesh>
          {/* Rear Venturi Diffuser Strakes */}
          {[-1.6, -0.8, 0.8, 1.6].map((yPos, dIdx) => (
            <mesh key={`diff-strake-${dIdx}`} position={[-5.45, yPos, 0.56]}>
              <boxGeometry args={[1.65, 0.1, 0.46]} />
              <meshStandardMaterial map={carbonMaps.map} roughness={0.36} metalness={0.54} />
            </mesh>
          ))}
          {/* Floor Edge Aero Fences */}
          <mesh position={[-0.4, -2.56, 0.48]}>
            <boxGeometry args={[8.1, 0.12, 0.28]} />
            <meshPhysicalMaterial
              color={color}
              normalMap={flakeNormalMap}
              normalScale={_normalScaleFlake}
              roughness={0.10}
              metalness={0.80}
              clearcoat={1.0}
              clearcoatRoughness={0.03}
              envMapIntensity={2.4}
            />
          </mesh>
          <mesh position={[-0.4, 2.56, 0.48]}>
            <boxGeometry args={[8.1, 0.12, 0.28]} />
            <meshPhysicalMaterial
              color={color}
              normalMap={flakeNormalMap}
              normalScale={_normalScaleFlake}
              roughness={0.10}
              metalness={0.80}
              clearcoat={1.0}
              clearcoatRoughness={0.03}
              envMapIntensity={2.4}
            />
          </mesh>

          {/* Sculpted CAD Beveled F1 Monocoque, Nosecone & Engine Roll-Hoop */}
          <mesh geometry={monocoqueGeo} castShadow receiveShadow>
            <meshPhysicalMaterial
              color={color}
              normalMap={flakeNormalMap}
              normalScale={_normalScaleFlake}
              roughness={0.09}
              metalness={0.78}
              clearcoat={1.0}
              clearcoatRoughness={0.025}
              iridescence={0.14}
              sheen={0.35}
              sheenColor="#ffffff"
              envMapIntensity={2.45}
            />
          </mesh>

          {/* Sculpted Undercut Aerodynamic Sidepods (Left & Right) */}
          <mesh
            geometry={sidepodGeo}
            position={[0.1, -1.36, 0]}
            rotation={[0.06, 0, -0.05]}
            castShadow
            receiveShadow
          >
            <meshPhysicalMaterial
              color={color}
              normalMap={flakeNormalMap}
              normalScale={_normalScaleFlake}
              roughness={0.10}
              metalness={0.78}
              clearcoat={1.0}
              clearcoatRoughness={0.025}
              iridescence={0.12}
              envMapIntensity={2.4}
            />
          </mesh>
          <mesh
            geometry={sidepodGeo}
            position={[0.1, 1.36, 0]}
            rotation={[-0.06, 0, 0.05]}
            castShadow
            receiveShadow
          >
            <meshPhysicalMaterial
              color={color}
              normalMap={flakeNormalMap}
              normalScale={_normalScaleFlake}
              roughness={0.10}
              metalness={0.78}
              clearcoat={1.0}
              clearcoatRoughness={0.025}
              iridescence={0.12}
              envMapIntensity={2.4}
            />
          </mesh>

          {/* Engine Cover Cooling Louver Vents (Carbon Detail) */}
          {[-1.25, 1.25].map((ySide, idx) => (
            <mesh key={`louver-${idx}`} position={[-1.4, ySide, 1.32]} rotation={[0, 0.12, 0]}>
              <boxGeometry args={[2.1, 0.42, 0.06]} />
              <meshStandardMaterial map={carbonMaps.map} roughness={0.45} metalness={0.4} />
            </mesh>
          ))}

          {/* Championship White & Carbon Livery Pin-Striping along Nosecone */}
          <mesh position={[3.95, 0, 1.25]} rotation={[0, 0.14, 0]}>
            <boxGeometry args={[5.3, 0.24, 0.04]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.14} metalness={0.45} />
          </mesh>

          {/* Wing Mirrors on Carbon Stalks */}
          {[-1.55, 1.55].map((yMir, idx) => (
            <group key={`mirror-${idx}`} position={[1.75, yMir, 1.62]}>
              <mesh>
                <boxGeometry args={[0.38, 0.62, 0.24]} />
                <meshPhysicalMaterial
                  color={color}
                  roughness={0.1}
                  metalness={0.75}
                  clearcoat={1.0}
                />
              </mesh>
              <mesh position={[-0.2, 0, 0]}>
                <boxGeometry args={[0.04, 0.52, 0.18]} />
                <meshStandardMaterial color="#e2e8f0" roughness={0.04} metalness={1.0} />
              </mesh>
            </group>
          ))}

          {/* Deep Carbon Radiator Sidepod Intakes */}
          <mesh position={[2.34, -1.66, 0.96]}>
            <boxGeometry args={[0.22, 1.18, 0.62]} />
            <meshStandardMaterial color="#03050a" roughness={0.92} />
          </mesh>
          <mesh position={[2.34, 1.66, 0.96]}>
            <boxGeometry args={[0.22, 1.18, 0.62]} />
            <meshStandardMaterial color="#03050a" roughness={0.92} />
          </mesh>

          {/* Swept Delta Multi-Element Carbon Front Wing + Contoured Winglet Endplates */}
          <group position={[6.9, 0, 0.34]}>
            <mesh geometry={frontWingGeo} castShadow receiveShadow>
              <meshStandardMaterial
                map={carbonMaps.map}
                normalMap={carbonMaps.normalMap}
                roughness={0.30}
                metalness={0.54}
              />
            </mesh>
            <mesh castShadow position={[-0.32, 0, 0.19]} rotation={[0, -0.18, 0]}>
              <boxGeometry args={[0.68, 6.22, 0.09]} />
              <meshPhysicalMaterial
                color={color}
                roughness={0.1}
                metalness={0.78}
                clearcoat={1.0}
                envMapIntensity={2.3}
              />
            </mesh>
            <mesh castShadow position={[-0.25, -3.32, 0.3]}>
              <boxGeometry args={[1.68, 0.14, 0.76]} />
              <meshPhysicalMaterial color={color} roughness={0.12} metalness={0.72} clearcoat={1.0} />
            </mesh>
            <mesh castShadow position={[-0.25, 3.32, 0.3]}>
              <boxGeometry args={[1.68, 0.14, 0.76]} />
              <meshPhysicalMaterial color={color} roughness={0.12} metalness={0.72} clearcoat={1.0} />
            </mesh>
          </group>

          {/* Carbon Dorsal Shark Fin & Glowing FIA Broadcast T-Cam Pod */}
          <mesh castShadow position={[-3.45, 0, 2.0]}>
            <boxGeometry args={[2.8, 0.11, 0.98]} />
            <meshStandardMaterial
              map={carbonMaps.map}
              normalMap={carbonMaps.normalMap}
              roughness={0.30}
              metalness={0.54}
            />
          </mesh>
          <group position={[-1.4, 0, 2.54]}>
            <mesh castShadow>
              <boxGeometry args={[0.45, 0.18, 0.42]} />
              <meshStandardMaterial color="#0f172a" roughness={0.38} />
            </mesh>
            <mesh position={[0, 0, 0.2]}>
              <boxGeometry args={[0.42, 1.48, 0.16]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={1.15}
                roughness={0.20}
              />
            </mesh>
          </group>

          {/* Open Cockpit Recess, Rotating F1 Steering Wheel, Animated Driver Helmet & Curved Titanium Halo */}
          <mesh position={[0.45, 0, 1.56]}>
            <boxGeometry args={[2.25, 1.22, 0.18]} />
            <meshStandardMaterial color="#04070d" roughness={0.92} />
          </mesh>
          {/* Cockpit F1 Steering Wheel (physically rotates with steerAngle!) */}
          <group ref={steeringWheelRef} position={[1.18, 0, 1.74]} rotation={[0, -0.35, 0]}>
            <mesh>
              <boxGeometry args={[0.12, 0.64, 0.38]} />
              <meshStandardMaterial color="#0f172a" roughness={0.42} />
            </mesh>
            <mesh position={[-0.07, 0, 0.08]}>
              <boxGeometry args={[0.02, 0.44, 0.13]} />
              <meshStandardMaterial
                ref={steeringLedMatRef}
                color="#22d3ee"
                emissive={isBraking ? '#ff1e42' : '#22d3ee'}
                emissiveIntensity={5.8}
              />
            </mesh>
          </group>
          {/* Driver Racing Helmet (livery-matched crown for instant car recognition + turns toward apex!) */}
          <group ref={driverHelmetRef} position={[0.25, 0, 1.88]}>
            <mesh castShadow>
              <sphereGeometry args={[0.56, 22, 18]} />
              <meshPhysicalMaterial
                color={color}
                roughness={0.08}
                metalness={0.55}
                clearcoat={1.0}
                envMapIntensity={2.4}
              />
            </mesh>
            <mesh position={[0.36, 0, 0.08]}>
              <boxGeometry args={[0.32, 0.72, 0.24]} />
              <meshPhysicalMaterial
                color="#38bdf8"
                roughness={0.02}
                metalness={1.0}
                clearcoat={1.0}
                iridescence={0.65}
                envMapIntensity={3.0}
              />
            </mesh>
          </group>
          {/* Real Curved 3D Titanium Halo + Central Front Safety Pylon */}
          <mesh geometry={haloCurveGeo} castShadow>
            <meshStandardMaterial color="#1e293b" roughness={0.18} metalness={0.92} />
          </mesh>
          <mesh position={[1.82, 0, 1.72]} rotation={[0, -0.35, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.11, 0.65, 8]} />
            <meshStandardMaterial color="#1e293b" roughness={0.18} metalness={0.92} />
          </mesh>

          {/* Carbon Double-Wishbone Suspension Arms */}
          <mesh position={[4.15, 0, 0.88]}>
            <boxGeometry args={[0.28, 6.2, 0.1]} />
            <meshStandardMaterial map={carbonMaps.map} roughness={0.38} metalness={0.52} />
          </mesh>
          <mesh position={[3.95, 0, 0.56]}>
            <boxGeometry args={[0.24, 6.1, 0.09]} />
            <meshStandardMaterial map={carbonMaps.map} roughness={0.38} metalness={0.52} />
          </mesh>
          <mesh position={[-3.95, 0, 0.9]}>
            <boxGeometry args={[0.34, 6.3, 0.12]} />
            <meshStandardMaterial map={carbonMaps.map} roughness={0.38} metalness={0.52} />
          </mesh>
          <mesh position={[-3.75, 0, 0.58]}>
            <boxGeometry args={[0.28, 6.2, 0.1]} />
            <meshStandardMaterial map={carbonMaps.map} roughness={0.38} metalness={0.52} />
          </mesh>

          {/* High-Downforce Carbon Rear Wing Assembly with Active DRS Flap & Wingtip Vapor Vortices */}
          <group position={[-5.45, 0, 2.2]}>
            <mesh position={[0.45, 0, -0.65]} castShadow>
              <boxGeometry args={[0.9, 0.18, 1.4]} />
              <meshStandardMaterial map={carbonMaps.map} roughness={0.34} />
            </mesh>
            <mesh position={[0, -2.2, -0.35]} castShadow>
              <boxGeometry args={[1.7, 0.16, 1.74]} />
              <meshStandardMaterial
                map={carbonMaps.map}
                normalMap={carbonMaps.normalMap}
                roughness={0.30}
                metalness={0.54}
              />
            </mesh>
            <mesh position={[0, 2.2, -0.35]} castShadow>
              <boxGeometry args={[1.7, 0.16, 1.74]} />
              <meshStandardMaterial
                map={carbonMaps.map}
                normalMap={carbonMaps.normalMap}
                roughness={0.30}
                metalness={0.54}
              />
            </mesh>
            <mesh position={[0.12, 0, 0.08]} castShadow>
              <boxGeometry args={[1.2, 4.42, 0.15]} />
              <meshStandardMaterial map={carbonMaps.map} roughness={0.34} />
            </mesh>
            <mesh ref={drsFlapRef} position={[-0.28, 0, 0.44]} castShadow>
              <boxGeometry args={[0.8, 4.36, 0.14]} />
              <meshPhysicalMaterial
                color={color}
                roughness={0.09}
                metalness={0.78}
                clearcoat={1.0}
                envMapIntensity={2.35}
              />
            </mesh>

            {/* Left & Right High-Speed Wingtip Condensation Vapor Trails */}
            <mesh
              ref={leftVortexRef}
              position={[-6.5, -2.2, 0.45]}
              rotation={[0, 0, Math.PI / 2]}
              visible={false}
            >
              <cylinderGeometry args={[0.04, 0.24, 12.2, 8]} />
              <meshBasicMaterial color="#e2e8f0" transparent opacity={0.25} depthWrite={false} />
            </mesh>
            <mesh
              ref={rightVortexRef}
              position={[-6.5, 2.2, 0.45]}
              rotation={[0, 0, Math.PI / 2]}
              visible={false}
            >
              <cylinderGeometry args={[0.04, 0.24, 12.2, 8]} />
              <meshBasicMaterial color="#e2e8f0" transparent opacity={0.25} depthWrite={false} />
            </mesh>
          </group>

          {/* Central Titanium Exhaust Tailpipe, Dual-Core Overrun Backfire Flame & FIA Rear Rain Light */}
          <group position={[-5.92, 0, 0.88]}>
            <mesh position={[0.15, 0, 0.34]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.26, 0.28, 0.55, 12]} />
              <meshStandardMaterial color="#94a3b8" roughness={0.18} metalness={0.98} />
            </mesh>
            {/* Multi-Layer Blue-White Overrun Exhaust Flame */}
            <group ref={exhaustFlameRef} position={[-0.95, 0, 0.34]} visible={false}>
              <mesh rotation={[0, 0, Math.PI / 2]}>
                <coneGeometry args={[0.38, 2.3, 12]} />
                <meshBasicMaterial
                  color="#38bdf8"
                  transparent
                  opacity={0.85}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                />
              </mesh>
              <mesh position={[0.35, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <coneGeometry args={[0.18, 1.35, 10]} />
                <meshBasicMaterial
                  color="#ffffff"
                  transparent
                  opacity={0.95}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                />
              </mesh>
            </group>
            {/* FIA Center Rain/Harvesting LED */}
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[0.22, 0.52, 0.56]} />
              <meshStandardMaterial
                ref={rainLightMatRef}
                color={isBraking || isDrifting ? '#ff1e42' : '#7f1d1d'}
                emissive="#ff1e42"
                emissiveIntensity={isBraking || isDrifting ? 9.5 : 1.5}
              />
            </mesh>
            {/* Rear Wing Endplate Vertical LED Strips */}
            <mesh position={[0.35, -2.2, 0.92]}>
              <boxGeometry args={[0.16, 0.14, 0.82]} />
              <meshStandardMaterial
                ref={leftBrakeLedMatRef}
                color={isBraking ? '#ff1e42' : '#450a0a'}
                emissive="#ff1e42"
                emissiveIntensity={isBraking ? 7.8 : 0.3}
              />
            </mesh>
            <mesh position={[0.35, 2.2, 0.92]}>
              <boxGeometry args={[0.16, 0.14, 0.82]} />
              <meshStandardMaterial
                ref={rightBrakeLedMatRef}
                color={isBraking ? '#ff1e42' : '#450a0a'}
                emissive="#ff1e42"
                emissiveIntensity={isBraking ? 7.8 : 0.3}
              />
            </mesh>
          </group>
        </group>

        {/* 4 Detailed 18" Open-Wheel Pirelli F1 Slicks with Ackermann Steering, Brembo Calipers & Glowing Discs */}
        <group ref={frontLeftWheelGroupRef} position={[4.15, -3.18, 0.78]}>
          {renderWheelAssembly(frontLeftTireRef, flBrakeMatRef, 1.32, 1.35, true)}
        </group>
        <group ref={frontRightWheelGroupRef} position={[4.15, 3.18, 0.78]}>
          {renderWheelAssembly(frontRightTireRef, frBrakeMatRef, 1.32, 1.35, false)}
        </group>
        <group position={[-3.95, -3.25, 0.86]}>
          {renderWheelAssembly(rearLeftTireRef, rlBrakeMatRef, 1.46, 1.68, true)}
        </group>
        <group position={[-3.95, 3.25, 0.86]}>
          {renderWheelAssembly(rearRightTireRef, rrBrakeMatRef, 1.46, 1.68, false)}
        </group>
      </group>

      {/* Compact Optional Driver Badge */}
      {showLabel && (
        <Html distanceFactor={140} position={[0, 0, 5.0]} center style={{ pointerEvents: 'none' }}>
          <div
            className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide font-mono whitespace-nowrap border pointer-events-none select-none ${
              active
                ? 'bg-slate-950/90 text-white border-amber-400/60'
                : 'bg-slate-950/75 text-slate-300 border-slate-800'
            }`}
          >
            {name}
          </div>
        </Html>
      )}
    </group>
  );
};
