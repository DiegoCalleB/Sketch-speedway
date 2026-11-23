import React, { useEffect, useMemo, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { LightingPreset } from './SceneAtmosphere';
import { CARS_RENDER_LAYER, WORLD_RENDER_LAYER } from './renderLayers';

interface PostProcessingEffectsProps {
  preset: LightingPreset;
  phase?: 'drawing' | 'racing';
  focusSpeed?: number;
  isMobile?: boolean;
}

// Detect software WebGL (SwiftShader / llvmpipe) to skip expensive multi-pass bloom on CPU renderers
// while preserving the exact same 2-layer World + Crisp Cars compositing order
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

// Razor-Sharp Broadcast Optics Shader applied strictly to the World Buffer (Layer 0):
// - ZERO radial motion blur and ZERO chromatic aberration smear
// - High-precision Contrast-Adaptive Sharpening (CAS) in exact physical device pixels
// - Boosted clarity during 'racing' so asphalt grain, kerbs & track markings stay razor-sharp at 350 km/h
const MotorsportOpticsShader = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1280, 720) },
    uPresetMode: { value: 2.0 }, // 0 = sunset, 1 = night, 2 = day
    uSharpness: { value: 0.44 }
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
    uniform float uPresetMode;
    uniform float uSharpness;
    varying vec2 vUv;

    void main() {
      vec2 texel = 1.0 / max(uResolution, vec2(1.0));
      vec3 centerCol = texture2D(tDiffuse, vUv).rgb;

      // 1. Contrast-Adaptive Sharpening (CAS) in exact physical device pixels
      vec3 n = texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).rgb;
      vec3 s = texture2D(tDiffuse, vUv - vec2(0.0, texel.y)).rgb;
      vec3 e = texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).rgb;
      vec3 w = texture2D(tDiffuse, vUv - vec2(texel.x, 0.0)).rgb;
      vec3 avgCross = (n + s + e + w) * 0.25;
      vec3 sharpDelta = clamp(centerCol - avgCross, -0.10, 0.10);
      vec3 col = centerCol + sharpDelta * uSharpness;

      // 2. Clean Photorealistic Broadcast Color Grading (balanced white-point, zero haze)
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      if (uPresetMode < 0.5) {
        vec3 shadowTint = vec3(0.96, 0.98, 1.03);
        vec3 highTint = vec3(1.02, 1.01, 0.97);
        col *= mix(shadowTint, highTint, smoothstep(0.18, 0.86, luma));
        col = mix(vec3(luma), col, 1.07);
      } else if (uPresetMode < 1.5) {
        vec3 shadowTint = vec3(0.94, 0.98, 1.05);
        vec3 highTint = vec3(1.00, 1.02, 1.05);
        col *= mix(shadowTint, highTint, smoothstep(0.18, 0.85, luma));
        col = mix(vec3(luma), col, 1.08);
      } else {
        col = mix(vec3(luma), col, 1.06);
      }

      // Subtle micro-contrast without crushing carbon-fiber or kerb details
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.08);

      // Gentle corner lens framing only at extreme perimeter
      float dist = length(vUv - 0.5);
      float vignette = smoothstep(1.08, 0.48, dist);
      col *= mix(0.93, 1.0, vignette);

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `
};

/**
 * Dual-Layer / Separate-Buffer WebGL Rendering Pipeline:
 * - PASS 1 (Layer 0 — World Buffer): Circuit, terrain, grandstands, trees, sky, splines, particles
 *   rendered into a full-physical-DPR MSAA HalfFloat render target with selective world-only HDR bloom
 *   and physical-pixel Contrast-Adaptive Sharpening (CAS).
 * - PASS 2 (Layer 1 — Dedicated Crisp Cars Foreground Pass): Renders ALL racing F1 cars directly to
 *   the native full-DPR MSAA framebuffer after clearing depth — guaranteeing razor-sharp car silhouettes
 *   with ZERO bloom bleed, ZERO downsample blur, and ZERO occlusion by trackside scenery!
 */
export const PostProcessingEffects: React.FC<PostProcessingEffectsProps> = ({
  preset,
  phase = 'racing',
  isMobile = false
}) => {
  const { gl, scene, camera, size } = useThree();
  const isSoftwareGl = useMemo(() => detectSoftwareGl(gl), [gl]);
  const bloomPassRef = useRef<UnrealBloomPass | null>(null);
  const opticsPassRef = useRef<ShaderPass | null>(null);

  const worldComposer = useMemo(() => {
    if (isSoftwareGl) return null;

    const pixelRatio = gl.getPixelRatio();
    const physW = Math.max(1, Math.floor(size.width * pixelRatio));
    const physH = Math.max(1, Math.floor(size.height * pixelRatio));
    const isWebGL2 = gl.capabilities.isWebGL2;

    // Dedicated Full-Physical-DPR MSAA HalfFloat HDR World Render Target (Layer 0)
    const worldRenderTarget = new THREE.WebGLRenderTarget(physW, physH, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      samples: isWebGL2 ? (isMobile ? 2 : 4) : 0
    });

    const comp = new EffectComposer(gl, worldRenderTarget);
    comp.setPixelRatio(pixelRatio);
    comp.setSize(size.width, size.height);

    const renderPass = new RenderPass(scene, camera);
    comp.addPass(renderPass);

    // Strictly selective World-Only HDR Bloom (never bleeds onto cars on Layer 1!)
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(Math.max(1, Math.floor(physW * 0.5)), Math.max(1, Math.floor(physH * 0.5))),
      preset === 'night' ? 0.34 : preset === 'sunset' ? 0.16 : 0.10,
      0.22,
      preset === 'night' ? 0.86 : preset === 'sunset' ? 0.96 : 1.04
    );
    comp.addPass(bloomPass);
    bloomPassRef.current = bloomPass;

    // OutputPass applies ACESFilmicToneMapping + Linear->sRGB conversion accurately
    const outputPass = new OutputPass();
    comp.addPass(outputPass);

    const opticsPass = new ShaderPass(MotorsportOpticsShader);
    opticsPass.uniforms.uResolution.value.set(physW, physH);
    opticsPass.uniforms.uSharpness.value = phase === 'racing' ? 0.44 : 0.32;
    opticsPass.renderToScreen = true;
    comp.addPass(opticsPass);
    opticsPassRef.current = opticsPass;

    return comp;
  }, [gl, scene, camera, isSoftwareGl, isMobile]);

  useEffect(() => {
    if (!worldComposer) return;
    const pixelRatio = gl.getPixelRatio();
    const physW = Math.max(1, Math.floor(size.width * pixelRatio));
    const physH = Math.max(1, Math.floor(size.height * pixelRatio));

    worldComposer.setPixelRatio(pixelRatio);
    worldComposer.setSize(size.width, size.height);

    if (bloomPassRef.current) {
      bloomPassRef.current.resolution.set(
        Math.max(1, Math.floor(physW * 0.5)),
        Math.max(1, Math.floor(physH * 0.5))
      );
    }
    if (opticsPassRef.current) {
      opticsPassRef.current.uniforms.uResolution.value.set(physW, physH);
    }
  }, [worldComposer, gl, size]);

  useEffect(() => {
    if (bloomPassRef.current) {
      bloomPassRef.current.strength =
        preset === 'night' ? 0.34 : preset === 'sunset' ? 0.16 : 0.10;
      bloomPassRef.current.threshold =
        preset === 'night' ? 0.86 : preset === 'sunset' ? 0.96 : 1.04;
    }
    if (opticsPassRef.current) {
      opticsPassRef.current.uniforms.uPresetMode.value =
        preset === 'sunset' ? 0.0 : preset === 'night' ? 1.0 : 2.0;
      opticsPassRef.current.uniforms.uSharpness.value = phase === 'racing' ? 0.44 : 0.32;
    }
  }, [preset, phase]);

  useEffect(() => {
    return () => {
      worldComposer?.dispose();
    };
  }, [worldComposer]);

  // Take explicit priority=1 render control so BOTH World Layer (0) and Cars Layer (1)
  // are composited deterministically in exact sequence every frame
  useFrame(() => {
    const prevAutoClear = gl.autoClear;
    const prevBackground = scene.background;
    const prevFog = scene.fog;

    // 1. PASS 1: Render World Buffer (Layer 0 — Circuit, Terrain, Sky, Grandstands, Splines, Smoke)
    camera.layers.set(WORLD_RENDER_LAYER);
    if (worldComposer && !isSoftwareGl) {
      worldComposer.render();
    } else {
      gl.setRenderTarget(null);
      gl.autoClear = true;
      gl.clear(true, true, true);
      gl.render(scene, camera);
    }

    // 2. PASS 2: Render Dedicated Crisp Cars Foreground Layer (Layer 1)
    // Clears ONLY depth (preserving World Buffer color) and disables scene.background/fog
    // so BOTH/ALL cars render razor-sharp at native physical DPR + hardware MSAA,
    // depth-sorted cleanly against each other with ZERO bloom smear & ZERO scenery occlusion!
    gl.setRenderTarget(null);
    gl.autoClear = false;
    gl.clearDepth();
    scene.background = null;
    scene.fog = null;
    camera.layers.set(CARS_RENDER_LAYER);
    gl.render(scene, camera);

    // Restore scene & renderer state cleanly for raycasting / shadow updates
    scene.background = prevBackground;
    scene.fog = prevFog;
    gl.autoClear = prevAutoClear;
    camera.layers.enableAll();
  }, 1);

  return null;
};
