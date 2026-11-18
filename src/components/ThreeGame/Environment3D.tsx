import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Track } from '../../types';

interface Environment3DProps {
  track: Track;
}

// Procedural tileable grass texture with lawnmower stripes
const createGrassTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  ctx.fillStyle = '#0f3923'; // Deep Emerald Turf
  ctx.fillRect(0, 0, 128, 128);

  // Diagonal Mower Stripes
  ctx.fillStyle = '#14492d';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(64, 0);
  ctx.lineTo(128, 64);
  ctx.lineTo(128, 128);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, 64);
  ctx.lineTo(0, 128);
  ctx.lineTo(64, 128);
  ctx.closePath();
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(16, 16);
  return texture;
};

export const Environment3D: React.FC<Environment3DProps> = ({ track }) => {
  const treesGroupRef = useRef<THREE.Group>(null);
  const flagsGroupRef = useRef<THREE.Group>(null);

  const { grassTexture, staticTrees, staticGrandstands, staticDecorations } = useMemo(() => {
    const texture = createGrassTexture();

    // 1. Volumetric 3D Trees
    const trees = (track.trees || []).map((tree, idx) => {
      const isPine = tree.type === 'pine';

      return (
        <group key={`tree-${idx}`} position={[tree.x, 500 - tree.y, 0]}>
          {/* Trunk */}
          <mesh position={[0, 0, tree.size * 0.2]} castShadow receiveShadow>
            <cylinderGeometry args={[0.9, 1.3, tree.size * 0.4, 5]} />
            <meshStandardMaterial color="#78350f" roughness={0.9} />
          </mesh>

          {/* Leaves */}
          {isPine ? (
            <group position={[0, 0, tree.size * 0.4]}>
              <mesh position={[0, 0, 0]} castShadow>
                <coneGeometry args={[tree.size * 0.45, tree.size * 0.55, 6]} />
                <meshStandardMaterial color="#065f46" roughness={0.8} flatShading />
              </mesh>
              <mesh position={[0, 0, tree.size * 0.24]} castShadow>
                <coneGeometry args={[tree.size * 0.34, tree.size * 0.45, 6]} />
                <meshStandardMaterial color="#047857" roughness={0.8} flatShading />
              </mesh>
              <mesh position={[0, 0, tree.size * 0.45]} castShadow>
                <coneGeometry args={[tree.size * 0.22, tree.size * 0.36, 6]} />
                <meshStandardMaterial color="#10b981" roughness={0.8} flatShading />
              </mesh>
            </group>
          ) : (
            <group position={[0, 0, tree.size * 0.42]}>
              <mesh position={[0, 0, 0]} castShadow>
                <sphereGeometry args={[tree.size * 0.32, 6, 6]} />
                <meshStandardMaterial color="#15803d" roughness={0.8} flatShading />
              </mesh>
              <mesh position={[-tree.size * 0.11, tree.size * 0.08, tree.size * 0.11]} castShadow>
                <sphereGeometry args={[tree.size * 0.24, 6, 6]} />
                <meshStandardMaterial color="#16a34a" roughness={0.8} flatShading />
              </mesh>
              <mesh position={[tree.size * 0.14, -tree.size * 0.08, tree.size * 0.14]} castShadow>
                <sphereGeometry args={[tree.size * 0.25, 6, 6]} />
                <meshStandardMaterial color="#22c55e" roughness={0.8} flatShading />
              </mesh>
            </group>
          )}
        </group>
      );
    });

    // 2. Grandstands
    const grandstands = (track.grandstands || []).map((gs, idx) => {
      return (
        <group key={`gs-${idx}`} position={[gs.x, 500 - gs.y, 0]} rotation={[0, 0, -gs.angle]}>
          <mesh position={[0, 0, 2.2]} castShadow receiveShadow>
            <boxGeometry args={[gs.width, gs.height, 4.4]} />
            <meshStandardMaterial color="#334155" roughness={0.7} />
          </mesh>
          <mesh position={[0, -1.8, 4.0]} castShadow receiveShadow>
            <boxGeometry args={[gs.width, gs.height * 0.6, 3.5]} />
            <meshStandardMaterial color="#1e293b" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0, 9.5]} rotation={[0.08, 0, 0]} castShadow>
            <boxGeometry args={[gs.width + 2, gs.height + 2, 0.5]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.35} />
          </mesh>
        </group>
      );
    });

    // 3. Clean out-of-bounds decorative items
    const decorations = (track.decorations || []).map((dec, idx) => {
      if (dec.type === 'tent') {
        return (
          <group key={`dec-tent-${idx}`} position={[dec.x, 500 - dec.y, 0]}>
            <mesh position={[0, 0, 2.5]} castShadow>
              <coneGeometry args={[5, 5, 4]} />
              <meshStandardMaterial color={dec.color} roughness={0.85} flatShading />
            </mesh>
          </group>
        );
      } else if (dec.type === 'flag') {
        return (
          <group key={`dec-flag-${idx}`} position={[dec.x, 500 - dec.y, 0]}>
            <mesh position={[0, 0, 4.5]} castShadow>
              <cylinderGeometry args={[0.18, 0.18, 9, 4]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.2} />
            </mesh>
            <mesh name="banner" position={[1.8, 0, 8.2]} rotation={[Math.PI / 2, 0, 0]}>
              <boxGeometry args={[3.4, 1.8, 0.1]} />
              <meshStandardMaterial color={dec.color} roughness={0.8} />
            </mesh>
          </group>
        );
      }
      return null;
    });

    return {
      grassTexture: texture,
      staticTrees: trees,
      staticGrandstands: grandstands,
      staticDecorations: decorations
    };
  }, [track]);

  useFrame((state) => {
    const elapsed = state.clock.getElapsedTime();

    if (treesGroupRef.current) {
      treesGroupRef.current.children.forEach((treeGroup, index) => {
        const sway = Math.sin(elapsed * 2.2 + index * 0.4) * 0.012;
        const swayZ = Math.cos(elapsed * 1.6 + index * 0.2) * 0.012;
        treeGroup.rotation.x = sway;
        treeGroup.rotation.y = swayZ;
      });
    }

    if (flagsGroupRef.current) {
      flagsGroupRef.current.children.forEach((flagGroup, index) => {
        const banner = flagGroup.getObjectByName('banner');
        if (banner) {
          const waveAngle = Math.sin(elapsed * 4.5 + index * 1.5) * 0.08;
          banner.rotation.z = waveAngle;
        }
      });
    }
  });

  return (
    <group>
      {/* Absolute Grass Floor Plane */}
      <mesh position={[400, 250, -0.15]} receiveShadow>
        <planeGeometry args={[1800, 1200]} />
        <meshStandardMaterial map={grassTexture} roughness={0.92} metalness={0.02} />
      </mesh>

      {/* Animated trees layer */}
      <group ref={treesGroupRef}>{staticTrees}</group>

      {/* Racetrack Spectator Grandstands */}
      {staticGrandstands}

      {/* Interactive Flags group */}
      <group ref={flagsGroupRef}>
        {staticDecorations.filter((dec) => dec && dec.key?.includes('flag'))}
      </group>

      {/* General static accessories */}
      {staticDecorations.filter((dec) => dec && !dec.key?.includes('flag'))}
    </group>
  );
};
