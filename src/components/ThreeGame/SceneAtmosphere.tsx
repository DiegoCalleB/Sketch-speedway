import React, { useEffect, useMemo, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { RaceCarState } from '../../types';
import { CARS_RENDER_LAYER } from './renderLayers';

export type LightingPreset = 'day' | 'sunset' | 'night';

interface SceneAtmosphereProps {
  preset?: LightingPreset;
  shadowFocus?: [number, number];
  carsStateRef?: React.MutableRefObject<RaceCarState[]>;
  focusedPlayerId?: string | null;
  tightShadows?: boolean;
  shadowMapSize?: number;
}

// High-contrast HDR-style Studio/Autodrome IBL Environment Scene for PMREMGenerator
// Produces rich, crisp reflections across metallic-flake car paint, carbon fiber, chrome visors, and wet tarmac
const createAutodromeEnvironmentScene = (preset: LightingPreset) => {
  const envScene = new THREE.Scene();

  const skyGeo = new THREE.SphereGeometry(90, 32, 16);
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 512;
  skyCanvas.height = 256;
  const ctx = skyCanvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    if (preset === 'day') {
      grad.addColorStop(0.0, '#103468');
      grad.addColorStop(0.28, '#2b6cb0');
      grad.addColorStop(0.50, '#8cc4f8');
      grad.addColorStop(0.62, '#eef6ff');
      grad.addColorStop(0.69, '#394a36');
      grad.addColorStop(1.0, '#182018');
    } else if (preset === 'sunset') {
      grad.addColorStop(0.0, '#0f2140');
      grad.addColorStop(0.26, '#284a78');
      grad.addColorStop(0.48, '#7398c4');
      grad.addColorStop(0.60, '#fbe0a8');
      grad.addColorStop(0.68, '#2b3330');
      grad.addColorStop(1.0, '#141918');
    } else {
      grad.addColorStop(0.0, '#020510');
      grad.addColorStop(0.38, '#0b1832');
      grad.addColorStop(0.55, '#1e3254');
      grad.addColorStop(0.66, '#0f172a');
      grad.addColorStop(1.0, '#04070e');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);
  }
  const envTex = new THREE.CanvasTexture(skyCanvas);
  envTex.colorSpace = THREE.SRGBColorSpace;

  const skyMesh = new THREE.Mesh(
    skyGeo,
    new THREE.MeshBasicMaterial({ map: envTex, side: THREE.BackSide })
  );
  skyMesh.rotation.x = Math.PI / 2;
  envScene.add(skyMesh);

  // High-luminance Solar Disc for razor-sharp clearcoat highlights on F1 bodywork
  const sunColor =
    preset === 'day' ? '#ffffff' : preset === 'sunset' ? '#fff4d4' : '#cceeff';
  const sunGeo = new THREE.SphereGeometry(8.5, 16, 16);
  const sunMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(sunColor).multiplyScalar(preset === 'night' ? 2.6 : 3.4)
  });
  const sunCard = new THREE.Mesh(sunGeo, sunMat);
  sunCard.position.set(50, 36, preset === 'sunset' ? 22 : 44);
  envScene.add(sunCard);

  // Overhead Softbox Reflection Strips (emulates sunlit cloud decks / stadium floodlight banks)
  const stripGeo = new THREE.BoxGeometry(42, 4.2, 0.5);
  const stripMat1 = new THREE.MeshBasicMaterial({
    color: new THREE.Color(preset === 'night' ? '#a5f3fc' : '#ffffff').multiplyScalar(
      preset === 'night' ? 2.4 : 1.9
    )
  });
  const stripMat2 = new THREE.MeshBasicMaterial({
    color: new THREE.Color(preset === 'night' ? '#38bdf8' : '#e0f2fe').multiplyScalar(
      preset === 'night' ? 2.0 : 1.45
    )
  });

  for (let i = -2; i <= 2; i++) {
    const strip = new THREE.Mesh(stripGeo, i % 2 === 0 ? stripMat1 : stripMat2);
    strip.position.set(i * 18, i * 11, 34);
    strip.lookAt(0, 0, 0);
    envScene.add(strip);
  }

  // Horizon Light Ring for crisp sidepod reflections
  const horizonGeo = new THREE.TorusGeometry(62, 1.8, 8, 32);
  const horizonMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(
      preset === 'day' ? '#dbeafe' : preset === 'sunset' ? '#fde68a' : '#38bdf8'
    ).multiplyScalar(preset === 'night' ? 1.5 : 1.1)
  });
  const horizonRing = new THREE.Mesh(horizonGeo, horizonMat);
  horizonRing.position.set(0, 0, 4);
  envScene.add(horizonRing);

  return {
    envScene,
    dispose: () => {
      skyGeo.dispose();
      sunGeo.dispose();
      sunMat.dispose();
      stripGeo.dispose();
      stripMat1.dispose();
      stripMat2.dispose();
      horizonGeo.dispose();
      horizonMat.dispose();
      envTex.dispose();
    }
  };
};

// Real-Time Volumetric Atmospheric Rayleigh/Mie Sky + Animated Cumulus Clouds + Sun Corona GLSL Shader
const AtmosphericSkyShader = {
  vertexShader: `
    varying vec3 vWorldDir;
    void main() {
      vWorldDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uPreset; // 0 = day, 1 = sunset, 2 = night
    uniform vec3 uSunDir;
    varying vec3 vWorldDir;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.52;
      mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
      for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p = rot * p * 2.03;
        a *= 0.5;
      }
      return v;
    }

    void main() {
      vec3 dir = normalize(vWorldDir);
      // In our world Z is UP, so sky elevation is dir.z (when dome is unrotated)
      float elev = clamp(dir.z, -0.3, 1.0);
      float h = clamp(elev, 0.0, 1.0);

      vec3 zenithCol;
      vec3 midCol;
      vec3 horizonCol;
      vec3 groundCol;
      vec3 sunCol;
      vec3 cloudBright;
      vec3 cloudShadow;

      if (uPreset < 0.5) {
        // Crisp Natural European / Coastal GP Daylight
        zenithCol = vec3(0.06, 0.21, 0.48);
        midCol = vec3(0.22, 0.49, 0.80);
        horizonCol = vec3(0.76, 0.87, 0.96);
        groundCol = vec3(0.18, 0.24, 0.16);
        sunCol = vec3(1.0, 0.98, 0.92);
        cloudBright = vec3(1.0, 0.99, 0.97);
        cloudShadow = vec3(0.56, 0.66, 0.78);
      } else if (uPreset < 1.5) {
        // GTA VI Golden-Hour Vice Coast (Rich Indigo Zenith to Champagne Gold Horizon, ZERO red tint)
        zenithCol = vec3(0.07, 0.15, 0.30);
        midCol = vec3(0.26, 0.42, 0.62);
        horizonCol = vec3(0.95, 0.82, 0.60);
        groundCol = vec3(0.15, 0.19, 0.17);
        sunCol = vec3(1.0, 0.92, 0.72);
        cloudBright = vec3(1.0, 0.91, 0.74);
        cloudShadow = vec3(0.38, 0.46, 0.60);
      } else {
        // Floodlit Night Grand Prix
        zenithCol = vec3(0.01, 0.02, 0.06);
        midCol = vec3(0.03, 0.07, 0.16);
        horizonCol = vec3(0.10, 0.18, 0.30);
        groundCol = vec3(0.03, 0.05, 0.09);
        sunCol = vec3(0.76, 0.90, 1.0);
        cloudBright = vec3(0.14, 0.24, 0.38);
        cloudShadow = vec3(0.03, 0.05, 0.10);
      }

      // Rayleigh atmospheric gradient
      vec3 sky = mix(horizonCol, midCol, smoothstep(0.0, 0.34, h));
      sky = mix(sky, zenithCol, smoothstep(0.26, 0.88, h));
      if (elev < 0.0) {
        sky = mix(horizonCol, groundCol, smoothstep(0.0, -0.18, elev));
      }

      // Mie Solar Scattering Halo & Crisp Sun Disk
      vec3 sunDir = normalize(uSunDir);
      float sunDot = max(dot(dir, sunDir), 0.0);
      float mieGlow = pow(sunDot, 10.0) * (uPreset < 1.5 ? 0.38 : 0.14);
      float sunCorona = pow(sunDot, 120.0) * (uPreset < 1.5 ? 0.95 : 0.45);
      float sunDisk = smoothstep(0.9985, 0.9994, sunDot) * (uPreset < 1.5 ? 2.2 : 1.2);
      sky += sunCol * (mieGlow + sunCorona + sunDisk) * smoothstep(-0.04, 0.06, elev);

      // Animated Volumetric Cumulus Cloud Deck projected onto upper sky plane
      if (elev > 0.02) {
        vec2 cloudUv = dir.xy / (elev + 0.18) * 1.45 + vec2(uTime * 0.008, uTime * 0.003);
        float c1 = fbm(cloudUv);
        float c2 = fbm(cloudUv * 2.1 - vec2(uTime * 0.012, 0.0));
        float cloudDensity = smoothstep(0.47, 0.78, c1 * 0.75 + c2 * 0.28);

        // Directional self-shadowing on clouds toward sun
        float litSample = fbm(cloudUv + sunDir.xy * 0.08);
        float cloudLight = clamp(0.45 + (c1 - litSample) * 2.4 + sunDot * 0.45, 0.0, 1.0);
        vec3 cloudCol = mix(cloudShadow, cloudBright, cloudLight);
        // Silver lining near sun
        cloudCol += sunCol * pow(sunDot, 8.0) * 0.35 * (1.0 - cloudDensity * 0.4);

        float horizonFade = smoothstep(0.02, 0.22, elev) * (1.0 - smoothstep(0.75, 0.98, elev) * 0.35);
        sky = mix(sky, cloudCol, cloudDensity * horizonFade * (uPreset > 1.5 ? 0.42 : 0.78));
      }

      // Crisp Twinkling Starfield in Night Grand Prix mode
      if (uPreset > 1.5 && elev > 0.08) {
        vec2 starGrid = floor(dir.xy / (elev + 0.25) * 240.0);
        float starVal = hash(starGrid);
        if (starVal > 0.994) {
          float twinkle = 0.55 + 0.45 * sin(uTime * 3.5 + starVal * 900.0);
          sky += vec3(0.88, 0.94, 1.0) * twinkle * smoothstep(0.08, 0.35, elev);
        }
      }

      gl_FragColor = vec4(sky, 1.0);
    }
  `
};

export const SceneAtmosphere: React.FC<SceneAtmosphereProps> = ({
  preset = 'day',
  shadowFocus = [400, 250],
  carsStateRef,
  focusedPlayerId = null,
  tightShadows = false,
  shadowMapSize = 2048
}) => {
  const { gl, scene } = useThree();
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const rimRef = useRef<THREE.DirectionalLight>(null);
  const smoothFocusRef = useRef(new THREE.Vector2(400, 250));

  // Ensure all scene lights & directional shadow map cover BOTH World (Layer 0) and Cars (Layer 1)
  useEffect(() => {
    hemiRef.current?.layers.enable(CARS_RENDER_LAYER);
    rimRef.current?.layers.enable(CARS_RENDER_LAYER);
    if (sunRef.current) {
      sunRef.current.layers.enable(CARS_RENDER_LAYER);
      sunRef.current.shadow.camera.layers.enable(CARS_RENDER_LAYER);
    }
  }, [preset, shadowMapSize]);

  const skyMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPreset: { value: preset === 'day' ? 0.0 : preset === 'sunset' ? 1.0 : 2.0 },
        uSunDir: { value: new THREE.Vector3(0.65, 0.45, 0.6).normalize() }
      },
      vertexShader: AtmosphericSkyShader.vertexShader,
      fragmentShader: AtmosphericSkyShader.fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    });
  }, []);

  useEffect(() => {
    skyMaterial.uniforms.uPreset.value =
      preset === 'day' ? 0.0 : preset === 'sunset' ? 1.0 : 2.0;
  }, [preset, skyMaterial]);

  useEffect(() => {
    return () => {
      skyMaterial.dispose();
    };
  }, [skyMaterial]);

  useEffect(() => {
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = preset === 'day' ? 1.04 : preset === 'sunset' ? 1.06 : 1.16;

    const pmremGenerator = new THREE.PMREMGenerator(gl);
    pmremGenerator.compileEquirectangularShader();
    const { envScene, dispose: disposeEnvScene } = createAutodromeEnvironmentScene(preset);
    const envRT = pmremGenerator.fromScene(envScene, 0.025);

    scene.environment = envRT.texture;

    const fogColor =
      preset === 'day' ? '#c5dcef' : preset === 'sunset' ? '#cad2dc' : '#091224';
    scene.background = new THREE.Color(fogColor);
    scene.fog = new THREE.FogExp2(
      fogColor,
      preset === 'day' ? 0.00032 : preset === 'sunset' ? 0.00038 : 0.00046
    );

    pmremGenerator.dispose();
    disposeEnvScene();

    return () => {
      envRT.dispose();
    };
  }, [gl, scene, preset]);

  useFrame((state, delta) => {
    const elapsed = state.clock.getElapsedTime();
    const dt = Math.min(delta, 0.05);
    skyMaterial.uniforms.uTime.value = elapsed;

    // Smoothly track the live racing pack directly from carsStateRef for razor-sharp shadows with zero React re-renders
    let targetFx = tightShadows ? shadowFocus[0] : 400;
    let targetFy = tightShadows ? shadowFocus[1] : 250;
    if (tightShadows && carsStateRef?.current && carsStateRef.current.length > 0) {
      const cars = carsStateRef.current;
      let sumX = 0;
      let sumY = 0;
      let count = 0;
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        if (!c.disqualified) {
          sumX += c.x;
          sumY += 500 - c.y;
          count++;
        }
      }
      if (count > 0) {
        targetFx = sumX / count;
        targetFy = sumY / count;
      } else if (focusedPlayerId) {
        const focused = cars.find((c) => c.playerId === focusedPlayerId);
        if (focused) {
          targetFx = focused.x;
          targetFy = 500 - focused.y;
        }
      }
    }
    smoothFocusRef.current.x = THREE.MathUtils.damp(smoothFocusRef.current.x, targetFx, 5.5, dt);
    smoothFocusRef.current.y = THREE.MathUtils.damp(smoothFocusRef.current.y, targetFy, 5.5, dt);

    const baseAngle = preset === 'sunset' ? 0.42 : 0.66;
    const sunDirX = Math.cos(baseAngle + elapsed * 0.004) * 440;
    const sunDirY = Math.sin(baseAngle + elapsed * 0.004) * 340;
    const sunDirZ = preset === 'sunset' ? 215 : preset === 'night' ? 290 : 355;

    skyMaterial.uniforms.uSunDir.value.set(sunDirX, sunDirY, sunDirZ).normalize();

    if (sunRef.current) {
      const fx = smoothFocusRef.current.x;
      const fy = smoothFocusRef.current.y;
      sunRef.current.position.set(fx + sunDirX, fy + sunDirY, sunDirZ);
      sunRef.current.target.position.set(fx, fy, 0);
      sunRef.current.target.updateMatrixWorld();

      // Dynamically tighten shadow camera bounds during racing so every F1 wing & tire casts crisp shadows
      const desiredExtent = tightShadows ? 235 : 475;
      const cam = sunRef.current.shadow.camera;
      if (Math.abs(cam.right - desiredExtent) > 2) {
        cam.left = -desiredExtent;
        cam.right = desiredExtent;
        cam.top = desiredExtent * 0.82;
        cam.bottom = -desiredExtent * 0.82;
        cam.updateProjectionMatrix();
      }
    }
  });

  const hemiSky = preset === 'day' ? '#d8eeff' : preset === 'sunset' ? '#e6edf8' : '#38bdf8';
  const hemiGround = preset === 'day' ? '#33462a' : preset === 'sunset' ? '#2c342e' : '#080c16';
  const hemiIntensity = preset === 'day' ? 0.88 : preset === 'sunset' ? 0.80 : 0.56;

  const keyColor = preset === 'day' ? '#fffef9' : preset === 'sunset' ? '#fff0cf' : '#dbeafe';
  const keyIntensity = preset === 'day' ? 2.35 : preset === 'sunset' ? 2.25 : 1.75;

  const rimColor = preset === 'day' ? '#bae6fd' : preset === 'sunset' ? '#93c5fd' : '#38bdf8';
  const rimIntensity = preset === 'day' ? 0.62 : preset === 'sunset' ? 0.72 : 0.90;

  return (
    <group>
      {/* Real-Time Volumetric Rayleigh/Mie Atmospheric Sky Dome */}
      <mesh position={[400, 250, 0]} frustumCulled={false} material={skyMaterial}>
        <sphereGeometry args={[2250, 40, 28]} />
      </mesh>

      {/* Natural Sky / Ground Hemisphere Fill (illuminates Layer 0 World + Layer 1 Cars) */}
      <hemisphereLight ref={hemiRef} args={[hemiSky, hemiGround, hemiIntensity]} />

      {/* Primary Key Sun / Stadium Moon with Dynamic Tight-Tracking PCFSoft Shadows */}
      <directionalLight
        ref={sunRef}
        position={[760, 460, preset === 'sunset' ? 215 : 355]}
        intensity={keyIntensity}
        color={keyColor}
        castShadow
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        shadow-camera-left={-475}
        shadow-camera-right={475}
        shadow-camera-top={365}
        shadow-camera-bottom={-365}
        shadow-camera-near={10}
        shadow-camera-far={1350}
        shadow-bias={-0.0003}
        shadow-normalBias={0.032}
      />

      {/* Cool Sky Rim / Backlight to Sculpt Aerodynamic Curves & Carbon Edges */}
      <directionalLight
        ref={rimRef}
        position={[40, 30, 205]}
        intensity={rimIntensity}
        color={rimColor}
      />
    </group>
  );
};
