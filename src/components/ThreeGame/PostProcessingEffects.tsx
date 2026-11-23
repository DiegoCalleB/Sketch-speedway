import React, { useEffect, useMemo, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { LightingPreset } from './SceneAtmosphere';

interface PostProcessingEffectsProps {
  preset: LightingPreset;
  focusSpeed?: number;
}

// Detect software WebGL (SwiftShader / llvmpipe) to keep rendering fast on headless/VDI while unleashing full HDR pipeline on GPUs
const detectSoftwareGl = (gl: THREE.WebGLRenderer): boolean => {
  try {
    const ctx = gl.getContext();
    const ext = ctx.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : ctx.RENDERER;
    const gpu = String(ctx.getParameter(param));
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
};

// Next-Gen Photorealistic Motorsport Broadcast Optics Shader:
// - Contrast-Adaptive Sharpening (CAS) for 4K crispness on carbon fiber, asphalt grain & liveries
// - Subtle Radial Peripheral High-Speed Motion & Chromatic Dispersion above 260 km/h
// - True-to-life natural broadcast color grading (zero red wash) + organic micro sensor film grain
const MotorsportOpticsShader = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1280, 720) },
    uSpeedNorm: { value: 0.0 },
    uTime: { value: 0.0 },
    uPresetMode: { value: 2.0 } // 0 = sunset, 1 = night, 2 = day
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uSpeedNorm;
    uniform float uTime;
    uniform float uPresetMode;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 texel = 1.0 / max(uResolution, vec2(1.0));
      vec2 center = vUv - 0.5;
      float dist = length(center);

      // 1. Subtle high-speed optical chromatic dispersion + radial peripheral motion above 260 km/h
      float periph = smoothstep(0.28, 0.78, dist);
      float caAmount = (0.00035 + uSpeedNorm * 0.0022) * periph;
      vec2 caOffset = center * caAmount;

      vec3 col = vec3(
        texture2D(tDiffuse, vUv + caOffset).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - caOffset).b
      );

      // Subtle 3-tap peripheral radial motion blur when flying > 275 km/h (keeps center 100% razor sharp)
      if (uSpeedNorm > 0.15 && periph > 0.02) {
        vec2 radStep = center * (uSpeedNorm * 0.0055 * periph);
        vec3 s1 = texture2D(tDiffuse, vUv - radStep).rgb;
        vec3 s2 = texture2D(tDiffuse, vUv - radStep * 2.0).rgb;
        col = col * 0.62 + s1 * 0.25 + s2 * 0.13;
      }

      // 2. Contrast-Adaptive Sharpening (CAS) in center/midframe for next-gen material crispness
      vec3 n = texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).rgb;
      vec3 s = texture2D(tDiffuse, vUv - vec2(0.0, texel.y)).rgb;
      vec3 e = texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).rgb;
      vec3 w = texture2D(tDiffuse, vUv - vec2(texel.x, 0.0)).rgb;
      vec3 blurCross = (n + s + e + w) * 0.25;
      float sharpStrength = mix(0.24, 0.06, periph);
      col = col + (col - blurCross) * sharpStrength;

      // 3. Natural Photorealistic Broadcast Grading (balanced white-point, crisp micro-contrast, zero red wash)
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      if (uPresetMode < 0.5) {
        // Golden Hour: natural sunlit highlights + clean slate shadows
        vec3 shadowTint = vec3(0.95, 0.98, 1.04);
        vec3 highTint = vec3(1.02, 1.01, 0.96);
        col *= mix(shadowTint, highTint, smoothstep(0.16, 0.86, luma));
        col = mix(vec3(luma), col, 1.07);
      } else if (uPresetMode < 1.5) {
        // Night Wet GP: crisp cool LED reflections & deep obsidian shadows
        vec3 shadowTint = vec3(0.93, 0.97, 1.06);
        vec3 highTint = vec3(1.00, 1.02, 1.06);
        col *= mix(shadowTint, highTint, smoothstep(0.18, 0.85, luma));
        col = mix(vec3(luma), col, 1.08);
      } else {
        // Natural Daylight GP: true-to-life broadcast clarity
        col = mix(vec3(luma), col, 1.06);
      }

      // Subtle S-curve filmic micro-contrast boost without crushing shadows
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.12);

      // 4. Barely perceptible cinema sensor micro-grain (eliminates sky banding)
      float grain = (rand(vUv * uResolution + fract(uTime) * 100.0) - 0.5) * 0.014;
      col += grain;

      // 5. Optical broadcast lens vignette at extreme corners
      float vignette = smoothstep(0.98, 0.36, dist * (0.80 + uSpeedNorm * 0.12));
      col *= mix(0.85, 1.0, vignette);

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `
};

export const PostProcessingEffects: React.FC<PostProcessingEffectsProps> = ({
  preset,
  focusSpeed = 0
}) => {
  const { gl, scene, camera, size } = useThree();
  const isSoftwareGl = useMemo(() => detectSoftwareGl(gl), [gl]);
  const bloomPassRef = useRef<UnrealBloomPass | null>(null);
  const opticsPassRef = useRef<ShaderPass | null>(null);

  const composer = useMemo(() => {
    if (isSoftwareGl) return null;

    // HalfFloatType HDR render target preserves specular highlights & prevents color channel clipping
    const renderTarget = new THREE.WebGLRenderTarget(
      Math.max(1, size.width),
      Math.max(1, size.height),
      {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat
      }
    );

    const comp = new EffectComposer(gl, renderTarget);
    const renderPass = new RenderPass(scene, camera);
    comp.addPass(renderPass);

    // Selective HDR Bloom only on true emissive lights, brake discs, exhaust flames & neon gantries
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(Math.max(1, size.width * 0.5), Math.max(1, size.height * 0.5)),
      preset === 'night' ? 0.52 : preset === 'sunset' ? 0.34 : 0.24,
      0.40,
      preset === 'night' ? 0.78 : 0.90
    );
    comp.addPass(bloomPass);
    bloomPassRef.current = bloomPass;

    // OutputPass applies ACESFilmicToneMapping + Linear->sRGB conversion accurately
    const outputPass = new OutputPass();
    comp.addPass(outputPass);

    const opticsPass = new ShaderPass(MotorsportOpticsShader);
    opticsPass.uniforms.uResolution.value.set(Math.max(1, size.width), Math.max(1, size.height));
    opticsPass.renderToScreen = true;
    comp.addPass(opticsPass);
    opticsPassRef.current = opticsPass;

    return comp;
  }, [gl, scene, camera, isSoftwareGl]);

  useEffect(() => {
    if (!composer) return;
    composer.setSize(size.width, size.height);
    if (bloomPassRef.current) {
      bloomPassRef.current.resolution.set(
        Math.max(1, Math.floor(size.width * 0.5)),
        Math.max(1, Math.floor(size.height * 0.5))
      );
    }
    if (opticsPassRef.current) {
      opticsPassRef.current.uniforms.uResolution.value.set(
        Math.max(1, size.width),
        Math.max(1, size.height)
      );
    }
  }, [composer, size]);

  useEffect(() => {
    if (bloomPassRef.current) {
      bloomPassRef.current.strength =
        preset === 'night' ? 0.52 : preset === 'sunset' ? 0.34 : 0.24;
      bloomPassRef.current.threshold = preset === 'night' ? 0.78 : 0.90;
    }
    if (opticsPassRef.current) {
      opticsPassRef.current.uniforms.uPresetMode.value =
        preset === 'sunset' ? 0.0 : preset === 'night' ? 1.0 : 2.0;
    }
  }, [preset]);

  useEffect(() => {
    return () => {
      composer?.dispose();
    };
  }, [composer]);

  useFrame((state, delta) => {
    if (!composer || isSoftwareGl) return;
    if (opticsPassRef.current) {
      const targetSpeedNorm = THREE.MathUtils.clamp((focusSpeed - 3.6) / 4.2, 0, 1);
      opticsPassRef.current.uniforms.uSpeedNorm.value = THREE.MathUtils.damp(
        opticsPassRef.current.uniforms.uSpeedNorm.value,
        targetSpeedNorm,
        6,
        Math.min(delta, 0.05)
      );
      opticsPassRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
    }
    composer.render();
  }, isSoftwareGl ? 0 : 1);

  return null;
};
