import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Track } from '../../types';

interface Environment3DProps {
  track: Track;
}

// Procedural tileable grass texture with elegant lawnmower stripes
const createGrassTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  ctx.fillStyle = '#14532d'; // Deep Forest Green
  ctx.fillRect(0, 0, 128, 128);
  
  // Diagonal Mower Stripes
  ctx.fillStyle = '#166534'; // Light Green
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
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(16, 16);
  return texture;
};

export const Environment3D: React.FC<Environment3DProps> = ({ track }) => {
  const treesGroupRef = useRef<THREE.Group>(null);
  const flagsGroupRef = useRef<THREE.Group>(null);
  const heliLightsRef = useRef<THREE.Group>(null);

  // Generate grass, barriers, and other static decorations
  const { grassTexture, concreteBarriers, staticTrees, staticGrandstands, staticDecorations } = useMemo(() => {
    const texture = createGrassTexture();

    // 1. Concrete barriers (safety boundaries) placed slightly offset from racetrack
    const barriers: React.ReactNode[] = [];
    const buildBarriers = (boundary: typeof track.outerBoundary, isOuter: boolean) => {
      const step = 4; // space out barriers
      const count = boundary.length;
      
      for (let i = 0; i < count; i += step) {
        const pt = boundary[i];
        const nextPt = boundary[(i + step) % count];
        
        // Offset normal outward/inward to avoid overlapping on the track curbs
        const dx = nextPt.x - pt.x;
        const dy = nextPt.y - pt.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.1) continue;

        const nx = -dy / len;
        const ny = dx / len;
        const offsetDist = isOuter ? 4.8 : -4.8;

        const bx = pt.x + nx * offsetDist;
        const by = pt.y + ny * offsetDist;

        const color = (i / step) % 2 === 0 ? '#ef4444' : '#ffffff'; // Alternating red/white
        const angle = Math.atan2(dy, dx);

        barriers.push(
          <mesh 
            key={`barrier-${isOuter ? 'out' : 'in'}-${i}`}
            position={[bx, 500 - by, 1.0]} 
            rotation={[0, 0, angle]}
            castShadow 
            receiveShadow
          >
            <boxGeometry args={[4.2, 1.8, 2.0]} />
            <meshStandardMaterial 
              color={color} 
              roughness={0.8} 
              metalness={0.1}
            />
          </mesh>
        );
      }
    };

    buildBarriers(track.outerBoundary, true);
    buildBarriers(track.innerBoundary, false);

    // 2. Volumetric 3D Trees with custom geometries
    const trees = (track.trees || []).map((tree, idx) => {
      const isPine = tree.type === 'pine';
      const scaleZ = 1.0 + Math.random() * 0.25;

      return (
        <group key={`tree-${idx}`} position={[tree.x, 500 - tree.y, 0]}>
          {/* Trunk */}
          <mesh position={[0, 0, tree.size * 0.2]} castShadow receiveShadow>
            <cylinderGeometry args={[1.0, 1.4, tree.size * 0.4, 5]} />
            <meshStandardMaterial color="#78350f" roughness={0.9} />
          </mesh>
          
          {/* Leaves */}
          {isPine ? (
            // Pine cone stacked layers
            <group position={[0, 0, tree.size * 0.4]}>
              <mesh position={[0, 0, 0]} castShadow>
                <coneGeometry args={[tree.size * 0.48, tree.size * 0.6, 6]} />
                <meshStandardMaterial color="#065f46" roughness={0.8} flatShading />
              </mesh>
              <mesh position={[0, 0, tree.size * 0.25]} castShadow>
                <coneGeometry args={[tree.size * 0.36, tree.size * 0.5, 6]} />
                <meshStandardMaterial color="#047857" roughness={0.8} flatShading />
              </mesh>
              <mesh position={[0, 0, tree.size * 0.48]} castShadow>
                <coneGeometry args={[tree.size * 0.24, tree.size * 0.4, 6]} />
                <meshStandardMaterial color="#10b981" roughness={0.8} flatShading />
              </mesh>
            </group>
          ) : (
            // Fluffy leafy spheres clump
            <group position={[0, 0, tree.size * 0.45]}>
              <mesh position={[0, 0, 0]} castShadow>
                <sphereGeometry args={[tree.size * 0.35, 6, 6]} />
                <meshStandardMaterial color="#15803d" roughness={0.8} flatShading />
              </mesh>
              <mesh position={[-tree.size * 0.12, tree.size * 0.1, tree.size * 0.12]} castShadow>
                <sphereGeometry args={[tree.size * 0.26, 6, 6]} />
                <meshStandardMaterial color="#16a34a" roughness={0.8} flatShading />
              </mesh>
              <mesh position={[tree.size * 0.15, -tree.size * 0.1, tree.size * 0.15]} castShadow>
                <sphereGeometry args={[tree.size * 0.28, 6, 6]} />
                <meshStandardMaterial color="#22c55e" roughness={0.8} flatShading />
              </mesh>
            </group>
          )}
        </group>
      );
    });

    // 3. Grandstands
    const grandstands = (track.grandstands || []).map((gs, idx) => {
      return (
        <group key={`gs-${idx}`} position={[gs.x, 500 - gs.y, 0]} rotation={[0, 0, gs.angle]}>
          {/* Seating steps */}
          <mesh position={[0, 0, 2.5]} castShadow receiveShadow>
            <boxGeometry args={[gs.width, gs.height, 5]} />
            <meshStandardMaterial color="#475569" roughness={0.7} />
          </mesh>
          <mesh position={[0, -2, 4.5]} castShadow receiveShadow>
            <boxGeometry args={[gs.width, gs.height * 0.6, 4]} />
            <meshStandardMaterial color="#334155" roughness={0.7} />
          </mesh>

          {/* Roof Canopy Pillars */}
          <mesh position={[-gs.width * 0.45, 0, 7.5]} castShadow>
            <cylinderGeometry args={[0.3, 0.3, 10, 4]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.4} />
          </mesh>
          <mesh position={[gs.width * 0.45, 0, 7.5]} castShadow>
            <cylinderGeometry args={[0.3, 0.3, 10, 4]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.4} />
          </mesh>

          {/* Roof Canopy */}
          <mesh position={[0, 0, 12.5]} rotation={[0.08, 0, 0]} castShadow>
            <boxGeometry args={[gs.width + 4, gs.height + 4, 0.6]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.3} />
          </mesh>
        </group>
      );
    });

    // 4. Custom decorative items
    const decorations = (track.decorations || []).map((dec, idx) => {
      if (dec.type === 'tent') {
        return (
          <group key={`dec-tent-${idx}`} position={[dec.x, 500 - dec.y, 0]}>
            <mesh position={[0, 0, 3]} castShadow>
              <coneGeometry args={[6, 6, 4]} />
              <meshStandardMaterial color={dec.color} roughness={0.9} flatShading />
            </mesh>
          </group>
        );
      } else if (dec.type === 'flag') {
        return (
          <group key={`dec-flag-${idx}`} position={[dec.x, 500 - dec.y, 0]}>
            {/* Pole */}
            <mesh position={[0, 0, 5]} castShadow>
              <cylinderGeometry args={[0.2, 0.2, 10, 4]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.1} />
            </mesh>
            {/* Waving flag banner */}
            <mesh name="banner" position={[2.2, 0, 9.2]} rotation={[Math.PI / 2, 0, 0]}>
              <boxGeometry args={[4, 2.2, 0.1]} />
              <meshStandardMaterial color={dec.color} roughness={0.8} />
            </mesh>
          </group>
        );
      } else if (dec.type === 'car') {
        // Parked static supercar
        return (
          <group key={`dec-car-${idx}`} position={[dec.x, 500 - dec.y, 0.3]} rotation={[0, 0, dec.angle || 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[14, 7, 3.2]} />
              <meshStandardMaterial color={dec.color} roughness={0.2} metalness={0.5} />
            </mesh>
            {/* Windshield */}
            <mesh position={[1.5, 0, 1.35]} rotation={[0, 0.4, 0]}>
              <boxGeometry args={[4.5, 5.5, 1]} />
              <meshStandardMaterial color="#0f172a" roughness={0.1} />
            </mesh>
          </group>
        );
      } else if (dec.type === 'box') {
        // Heliport marker center on Track 1
        if (dec.x === 400 && dec.y === 250) {
          return (
            <group key={`dec-heli-${idx}`} position={[400, 250, 0.05]}>
              {/* Outer white helipad pad ring */}
              <mesh rotation={[0, 0, 0]} receiveShadow>
                <ringGeometry args={[16, 18, 32]} />
                <meshStandardMaterial color="#ffffff" roughness={1.0} />
              </mesh>
              {/* Inner transparent plate */}
              <mesh receiveShadow>
                <circleGeometry args={[16, 32]} />
                <meshStandardMaterial color="#ffffff" transparent opacity={0.1} roughness={1.0} />
              </mesh>
              {/* Giant visual 'H' marker */}
              <group position={[0, 0, 0.1]}>
                <mesh position={[-4, 0, 0]}>
                  <boxGeometry args={[1.8, 11, 0.15]} />
                  <meshStandardMaterial color="#ffffff" roughness={1.0} />
                </mesh>
                <mesh position={[4, 0, 0]}>
                  <boxGeometry args={[1.8, 11, 0.15]} />
                  <meshStandardMaterial color="#ffffff" roughness={1.0} />
                </mesh>
                <mesh position={[0, 0, 0]}>
                  <boxGeometry args={[6.2, 1.8, 0.15]} />
                  <meshStandardMaterial color="#ffffff" roughness={1.0} />
                </mesh>
              </group>
            </group>
          );
        } else {
          // Standard tire crash block
          return (
            <group key={`dec-block-${idx}`} position={[dec.x, 500 - dec.y, 0.8]} rotation={[0, 0, dec.angle || 0]}>
              <mesh castShadow receiveShadow>
                <boxGeometry args={[12, 6, 3.5]} />
                <meshStandardMaterial color={dec.color || '#ef4444'} roughness={0.9} />
              </mesh>
            </group>
          );
        }
      }
      return null;
    });

    return {
      grassTexture: texture,
      concreteBarriers: barriers,
      staticTrees: trees,
      staticGrandstands: grandstands,
      staticDecorations: decorations
    };
  }, [track]);

  useFrame((state) => {
    const elapsed = state.clock.getElapsedTime();

    // 1. Wind waving animation for Trees (subtle sway)
    if (treesGroupRef.current) {
      treesGroupRef.current.children.forEach((treeGroup, index) => {
        const sway = Math.sin(elapsed * 2.5 + index * 0.4) * 0.015;
        const swayZ = Math.cos(elapsed * 1.8 + index * 0.2) * 0.015;
        treeGroup.rotation.x = sway;
        treeGroup.rotation.y = swayZ;
      });
    }

    // 2. Wind rippling animation for Flags
    if (flagsGroupRef.current) {
      flagsGroupRef.current.children.forEach((flagGroup, index) => {
        const banner = flagGroup.getObjectByName('banner');
        if (banner) {
          const waveAngle = Math.sin(elapsed * 5.0 + index * 1.5) * 0.09;
          banner.rotation.z = waveAngle;
        }
      });
    }

    // 3. Flashing security light bulbs on the Heliport pad
    if (heliLightsRef.current) {
      const flash = Math.floor(elapsed * 2.8) % 2 === 0;
      heliLightsRef.current.children.forEach((bulb, bulbIdx) => {
        if (bulb instanceof THREE.Mesh && bulb.material) {
          const mat = bulb.material as THREE.MeshStandardMaterial;
          const isOdd = bulbIdx % 2 === 0;
          const active = flash ? isOdd : !isOdd;
          mat.color.set(active ? '#ef4444' : '#f59e0b');
          mat.emissive.set(active ? '#ef4444' : '#f59e0b');
          mat.emissiveIntensity = active ? 2.5 : 0.0;
        }
      });
    }
  });

  return (
    <group>
      {/* Absolute Grass Floor Plane */}
      <mesh position={[400, 250, -0.2]} receiveShadow>
        <planeGeometry args={[1600, 1100]} />
        <meshStandardMaterial 
          map={grassTexture}
          roughness={0.95} 
          metalness={0.05}
        />
      </mesh>

      {/* Safety concrete barriers following the track */}
      {concreteBarriers}

      {/* Animated trees layer */}
      <group ref={treesGroupRef}>
        {staticTrees}
      </group>

      {/* Racetrack Spectator Grandstands */}
      {staticGrandstands}

      {/* Interactive Flags group */}
      <group ref={flagsGroupRef}>
        {staticDecorations.filter(dec => dec && dec.key?.includes('flag'))}
      </group>

      {/* General static accessories */}
      {staticDecorations.filter(dec => dec && !dec.key?.includes('flag'))}

      {/* Flashing Heliport lights for Track 1 */}
      {track.id === 'oval' && (
        <group ref={heliLightsRef} position={[400, 250, 0.15]}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((bulbIdx) => {
            const angle = (bulbIdx / 8) * Math.PI * 2;
            const bx = Math.cos(angle) * 23.5;
            const by = Math.sin(angle) * 23.5;
            return (
              <mesh key={`heli-light-${bulbIdx}`} position={[bx, by, 0.1]}>
                <sphereGeometry args={[0.55, 6, 6]} />
                <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0} />
              </mesh>
            );
          })}
        </group>
      )}
    </group>
  );
};
