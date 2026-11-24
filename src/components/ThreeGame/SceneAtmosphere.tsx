import React, { useEffect, useMemo, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { RaceCarState, WeatherCondition } from '../../types';
import { CARS_RENDER_LAYER } from './renderLayers';

export type LightingPreset = 'day' | 'sunset' | 'night';

interface SceneAtmosphereProps {
  preset?: LightingPreset;
  weather?: WeatherCondition;
  shadowFocus?: [number, number];
  carsStateRef?: React.MutableRefObject<RaceCarState[]>;
  focusedPlayerId?: string | null;
  tightShadows?: boolean;
  shadowMapSize?: number;
}

// High-contrast HDR-style Studio/Autodrome IBL Environment Scene for PMREMGenerator
// Produces rich, crisp reflections across metallic-flake car paint, carbon fiber, chrome visors, and wet tarmac
const createAutodromeEnvironmentScene = (preset: LightingPreset, weather: WeatherCondition = 'dry') => {
  const envScene = new THREE.Scene();
  const isRain = weather === 'rain';

  const skyGeo = new THREE.SphereGeometry(90, 32, 16);
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 512;
  skyCanvas.height = 256;
  const ctx = skyCanvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    if (preset === 'day') {
      grad.addColorStop(0.0, isRain ? '#0f2342' : '#103468');
      grad.addColorStop(0.28, isRain ? '#264973' : '#2b6cb0');
      grad.addColorStop(0.50, isRain ? '#648cb8' : '#8cc4f8');
      grad.addColorStop(0.62, isRain ? '#cbd5e1' : '#eef6ff');
      grad.addColorStop(0.69, '#2b3a2c');
      grad.addColorStop(1.0, '#121914');
    } else if (preset === 'sunset') {
      grad.addColorStop(0.0, '#0f2140');
      grad.addColorStop(0.26, '#284a78');
      grad.addColorStop(0.48, isRain ? '#527196' : '#7398c4');
      grad.addColorStop(0.60, isRain ? '#d6c3a5' : '#fbe0a8');
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

  // High-luminance Solar Disc + Soft Atmospheric Corona for razor-sharp clearcoat highlights on F1 bodywork
  const sunColor =
    preset === 'day' ? '#fffef5' : preset === 'sunset' ? '#ffe8b6' : '#cceeff';
  const sunGeo = new THREE.SphereGeometry(7.5, 16, 16);
  const sunMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(sunColor).multiplyScalar(
      preset === 'night' ? 3.1 : isRain ? 3.5 : 4.2
    )
  });
  const sunCard = new THREE.Mesh(sunGeo, sunMat);
  sunCard.position.set(50, 36, preset === 'sunset' ? 22 : 44);
  envScene.add(sunCard);

  const coronaGeo = new THREE.SphereGeometry(16, 16, 16);
  const coronaMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(
      preset === 'day' ? '#e0f2fe' : preset === 'sunset' ? '#fcd34d' : '#38bdf8'
    ).multiplyScalar(preset === 'night' ? 0.9 : 1.35),
    transparent: true,
    opacity: 0.45
  });
  const coronaCard = new THREE.Mesh(coronaGeo, coronaMat);
  coronaCard.position.copy(sunCard.position);
  envScene.add(coronaCard);

  // Overhead Softbox Reflection Strips (emulates sunlit cloud decks / stadium floodlight banks)
  const stripGeo = new THREE.BoxGeometry(44, 4.8, 0.5);
  const stripMat1 = new THREE.MeshBasicMaterial({
    color: new THREE.Color(preset === 'night' || isRain ? '#a5f3fc' : '#ffffff').multiplyScalar(
      preset === 'night' || isRain ? 2.85 : 2.15
    )
  });
  const stripMat2 = new THREE.MeshBasicMaterial({
    color: new THREE.Color(preset === 'night' || isRain ? '#38bdf8' : '#e0f2fe').multiplyScalar(
      preset === 'night' || isRain ? 2.4 : 1.55
    )
  });

  for (let i = -2; i <= 2; i++) {
    const strip = new THREE.Mesh(stripGeo, i % 2 === 0 ? stripMat1 : stripMat2);
    strip.position.set(i * 18, i * 11, 34);
    strip.lookAt(0, 0, 0);
    envScene.add(strip);
  }

  // Warm/Cool Coastal Horizon Bounce Panels for sculpted metallic sidepod reflections
  const bounceGeo = new THREE.PlaneGeometry(58, 14);
  const warmBounceMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(
      preset === 'day' ? '#fef3c7' : preset === 'sunset' ? '#fdba74' : '#0ea5e9'
    ).multiplyScalar(preset === 'night' ? 1.4 : 1.15),
    side: THREE.DoubleSide
  });
  const coolBounceMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(
      preset === 'day' ? '#7dd3fc' : preset === 'sunset' ? '#93c5fd' : '#6366f1'
    ).multiplyScalar(preset === 'night' ? 1.35 : 0.95),
    side: THREE.DoubleSide
  });
  const warmPanel = new THREE.Mesh(bounceGeo, warmBounceMat);
  warmPanel.position.set(55, -28, 12);
  warmPanel.lookAt(0, 0, 0);
  envScene.add(warmPanel);

  const coolPanel = new THREE.Mesh(bounceGeo, coolBounceMat);
  coolPanel.position.set(-55, 28, 14);
  coolPanel.lookAt(0, 0, 0);
  envScene.add(coolPanel);

  // Horizon Light Ring for crisp sidepod specular sweep
  const horizonGeo = new THREE.TorusGeometry(62, 1.8, 8, 32);
  const horizonMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(
      preset === 'day' ? '#dbeafe' : preset === 'sunset' ? '#fde68a' : '#38bdf8'
    ).multiplyScalar(preset === 'night' || isRain ? 1.85 : 1.2)
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
      coronaGeo.dispose();
      coronaMat.dispose();
      stripGeo.dispose();
      stripMat1.dispose();
      stripMat2.dispose();
      bounceGeo.dispose();
      warmBounceMat.dispose();
      coolBounceMat.dispose();
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
    uniform float uWeather; // 0 = dry, 1 = rain
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
        zenithCol = mix(vec3(0.06, 0.21, 0.48), vec3(0.11, 0.19, 0.30), uWeather * 0.65);
        midCol = mix(vec3(0.22, 0.49, 0.80), vec3(0.26, 0.37, 0.50), uWeather * 0.65);
        horizonCol = mix(vec3(0.76, 0.87, 0.96), vec3(0.56, 0.66, 0.76), uWeather * 0.6);
        groundCol = vec3(0.18, 0.24, 0.16);
        sunCol = vec3(1.0, 0.98, 0.92);
        cloudBright = mix(vec3(1.0, 0.99, 0.97), vec3(0.78, 0.84, 0.90), uWeather * 0.55);
        cloudShadow = mix(vec3(0.56, 0.66, 0.78), vec3(0.26, 0.34, 0.44), uWeather * 0.7);
      } else if (uPreset < 1.5) {
        // GTA VI Golden-Hour Vice Coast (Rich Indigo Zenith to Champagne Gold Horizon, ZERO red tint)
        zenithCol = vec3(0.07, 0.15, 0.30);
        midCol = mix(vec3(0.26, 0.42, 0.62), vec3(0.22, 0.32, 0.46), uWeather * 0.6);
        horizonCol = mix(vec3(0.95, 0.82, 0.60), vec3(0.68, 0.64, 0.58), uWeather * 0.55);
        groundCol = vec3(0.15, 0.19, 0.17);
        sunCol = vec3(1.0, 0.92, 0.72);
        cloudBright = mix(vec3(1.0, 0.91, 0.74), vec3(0.80, 0.76, 0.68), uWeather * 0.5);
        cloudShadow = mix(vec3(0.38, 0.46, 0.60), vec3(0.22, 0.28, 0.38), uWeather * 0.65);
      } else {
        // Floodlit Night Grand Prix
        zenithCol = vec3(0.01, 0.02, 0.06);
        midCol = vec3(0.03, 0.07, 0.16);
        horizonCol = vec3(0.10, 0.18, 0.30);
        groundCol = vec3(0.03, 0.05, 0.09);
        sunCol = vec3(0.76, 0.90, 1.0);
        cloudBright = vec3(0.16, 0.26, 0.40);
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
      float sunVis = 1.0 - uWeather * 0.52;
      float mieGlow = pow(sunDot, 10.0) * (uPreset < 1.5 ? 0.38 : 0.14) * sunVis;
      float sunCorona = pow(sunDot, 120.0) * (uPreset < 1.5 ? 0.95 : 0.45) * sunVis;
      float sunDisk = smoothstep(0.9985, 0.9994, sunDot) * (uPreset < 1.5 ? 2.2 : 1.2) * sunVis;
      sky += sunCol * (mieGlow + sunCorona + sunDisk) * smoothstep(-0.04, 0.06, elev);

      // Animated Volumetric Cumulus / Storm Cloud Deck + Crepuscular Solar God-Rays (Light Shafts)
      if (elev > 0.02) {
        vec2 cloudUv = dir.xy / (elev + 0.18) * 1.45 + vec2(uTime * 0.011, uTime * 0.004);
        float c1 = fbm(cloudUv);
        float c2 = fbm(cloudUv * 2.1 - vec2(uTime * 0.016, 0.0));
        float lowThresh = mix(0.47, 0.30, uWeather);
        float highThresh = mix(0.78, 0.68, uWeather);
        float cloudDensity = smoothstep(lowThresh, highThresh, c1 * 0.75 + c2 * 0.28);

        // High-altitude wispy cirrus ice clouds above the cumulus deck
        float cirrus = smoothstep(0.62, 0.88, fbm(cloudUv * 0.65 + vec2(12.4, -uTime * 0.005)));
        sky = mix(sky, mix(cloudBright, sunCol, 0.35), cirrus * 0.24 * smoothstep(0.15, 0.65, elev));

        // Directional self-shadowing on clouds toward sun
        float litSample = fbm(cloudUv + sunDir.xy * 0.08);
        float cloudLight = clamp(0.45 + (c1 - litSample) * 2.4 + sunDot * 0.45, 0.0, 1.0);
        vec3 cloudCol = mix(cloudShadow, cloudBright, cloudLight);
        // Silver lining near sun
        cloudCol += sunCol * pow(sunDot, 7.0) * 0.48 * (1.0 - cloudDensity * 0.35);

        float horizonFade = smoothstep(0.02, 0.22, elev) * (1.0 - smoothstep(0.75, 0.98, elev) * 0.35);
        float maxCloudAlpha = mix(uPreset > 1.5 ? 0.42 : 0.78, 0.92, uWeather);
        sky = mix(sky, cloudCol, cloudDensity * horizonFade * maxCloudAlpha);

        // Crepuscular Volumetric Solar God-Rays (Light Shafts) streaming through cloud gaps
        if (uPreset < 1.5 && sunDot > 0.35) {
          vec2 rayUv1 = cloudUv - sunDir.xy * 0.14;
          vec2 rayUv2 = cloudUv - sunDir.xy * 0.28;
          float gap1 = 1.0 - smoothstep(lowThresh, highThresh, fbm(rayUv1));
          float gap2 = 1.0 - smoothstep(lowThresh, highThresh, fbm(rayUv2));
          float godRay = (gap1 * 0.55 + gap2 * 0.45) * (1.0 - cloudDensity * 0.65) * pow(sunDot, 5.5);
          sky += sunCol * godRay * (uPreset > 0.5 ? 0.46 : 0.32) * sunVis;
        }
      }

      // Crisp Twinkling Starfield in Night Grand Prix mode (partially veiled by storm clouds in rain)
      if (uPreset > 1.5 && elev > 0.08 && uWeather < 0.5) {
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
  weather = 'dry',
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
  }, [preset, weather, shadowMapSize]);

  const skyMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPreset: { value: preset === 'day' ? 0.0 : preset === 'sunset' ? 1.0 : 2.0 },
        uWeather: { value: weather === 'rain' ? 1.0 : 0.0 },
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
    skyMaterial.uniforms.uWeather.value = weather === 'rain' ? 1.0 : 0.0;
  }, [preset, weather, skyMaterial]);

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
    const { envScene, dispose: disposeEnvScene } = createAutodromeEnvironmentScene(preset, weather);
    const envRT = pmremGenerator.fromScene(envScene, 0.025);

    scene.environment = envRT.texture;

    const isRain = weather === 'rain';
    const fogColor =
      preset === 'day'
        ? isRain
          ? '#94adc4'
          : '#c5dcef'
        : preset === 'sunset'
          ? isRain
            ? '#9aa8b8'
            : '#cad2dc'
          : '#091224';
    scene.background = new THREE.Color(fogColor);
    const baseFog = preset === 'day' ? 0.00032 : preset === 'sunset' ? 0.00038 : 0.00046;
    scene.fog = new THREE.FogExp2(fogColor, isRain ? baseFog * 1.25 : baseFog);

    pmremGenerator.dispose();
    disposeEnvScene();

    return () => {
      envRT.dispose();
    };
  }, [gl, scene, preset, weather]);

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
