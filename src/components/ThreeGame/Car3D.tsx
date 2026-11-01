import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

interface Car3DProps {
  color: string;
  position: [number, number, number];
  angle: number;
  isDrifting: boolean;
  isBraking: boolean;
  name: string;
  active?: boolean;
  speed?: number;
  showLabel?: boolean;
}

export const Car3D: React.FC<Car3DProps> = ({
  color,
  position,
  angle,
  isDrifting,
  isBraking,
  name,
  active = false,
  speed = 0,
  showLabel = true
}) => {
  const carGroupRef = useRef<THREE.Group>(null);
  const frontLeftWheelRef = useRef<THREE.Mesh>(null);
  const frontRightWheelRef = useRef<THREE.Mesh>(null);
  const rearLeftWheelRef = useRef<THREE.Mesh>(null);
  const rearRightWheelRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const elapsed = state.clock.getElapsedTime();

    // 1. Spinning wheel hub gears relative to travel speed
    const wheelSpinSpeed = speed * 1.5;
    if (rearLeftWheelRef.current && rearRightWheelRef.current) {
      rearLeftWheelRef.current.rotation.x += wheelSpinSpeed;
      rearRightWheelRef.current.rotation.x += wheelSpinSpeed;
    }
    if (frontLeftWheelRef.current && frontRightWheelRef.current) {
      frontLeftWheelRef.current.rotation.x += wheelSpinSpeed;
      frontRightWheelRef.current.rotation.x += wheelSpinSpeed;

      // 2. Wheel steering angle (turns wheels into corners or drifts)
      const driftWobble = isDrifting ? Math.sin(elapsed * 45) * 0.12 : 0;
      const turnAngle = driftWobble + (isDrifting ? -0.22 : speed > 0.5 ? 0.08 : 0);
      frontLeftWheelRef.current.rotation.z = turnAngle;
      frontRightWheelRef.current.rotation.z = turnAngle;
    }

    // 3. Drift vibrating body wiggle (chassis jitters slightly during slide)
    if (carGroupRef.current) {
      if (isDrifting) {
        carGroupRef.current.position.z = Math.sin(elapsed * 55) * 0.12;
      } else {
        carGroupRef.current.position.z = 0;
      }
    }
  });

  return (
    <group position={position} rotation={[0, 0, -angle]}>
      {/* Car Base Shadow Ring (Faked ambient occlusion below car) */}
      <mesh position={[0, 0, -0.05]}>
        <planeGeometry args={[16, 10]} />
        <meshBasicMaterial color="#020617" transparent opacity={0.35} />
      </mesh>

      <group ref={carGroupRef}>
        {/* Main Body Chassis */}
        <mesh castShadow receiveShadow position={[0, 0, 1.1]}>
          <boxGeometry args={[11, 5.2, 1.8]} />
          <meshStandardMaterial 
            color={color} 
            roughness={0.25} 
            metalness={0.45} 
          />
        </mesh>

        {/* Cockpit Bubble Glass (Sporty futuristic dome) */}
        <mesh position={[-1.0, 0, 2.15]} castShadow>
          <sphereGeometry args={[1.75, 8, 8]} />
          <meshStandardMaterial 
            color="#0f172a" 
            roughness={0.05} 
            metalness={0.9} 
            transparent 
            opacity={0.85}
          />
        </mesh>

        {/* Front Spoiler Lip */}
        <mesh position={[6.0, 0, 0.65]} castShadow>
          <boxGeometry args={[1.2, 4.8, 0.35]} />
          <meshStandardMaterial color="#090d16" roughness={0.7} />
        </mesh>

        {/* Rear Wing Spoiler structure */}
        <group position={[-5.0, 0, 2.3]}>
          {/* Vertical plates */}
          <mesh position={[0, -2.1, -0.45]} castShadow>
            <boxGeometry args={[1.5, 0.2, 1.5]} />
            <meshStandardMaterial color={color} roughness={0.3} />
          </mesh>
          <mesh position={[0, 2.1, -0.45]} castShadow>
            <boxGeometry args={[1.5, 0.2, 1.5]} />
            <meshStandardMaterial color={color} roughness={0.3} />
          </mesh>
          {/* Horizontal board */}
          <mesh position={[0, 0, 0.35]} castShadow>
            <boxGeometry args={[1.8, 5.8, 0.22]} />
            <meshStandardMaterial color="#090d16" roughness={0.5} />
          </mesh>
        </group>

        {/* LEFT FRONT WHEEL */}
        <group position={[3.6, -2.8, 0.65]}>
          <mesh ref={frontLeftWheelRef} castShadow>
            <cylinderGeometry args={[1.3, 1.3, 1.3, 8]} />
            <meshStandardMaterial color="#09090b" roughness={0.9} />
          </mesh>
        </group>

        {/* RIGHT FRONT WHEEL */}
        <group position={[3.6, 2.8, 0.65]}>
          <mesh ref={frontRightWheelRef} castShadow>
            <cylinderGeometry args={[1.3, 1.3, 1.3, 8]} />
            <meshStandardMaterial color="#09090b" roughness={0.9} />
          </mesh>
        </group>

        {/* LEFT REAR WHEEL */}
        <group position={[-3.6, -2.8, 0.65]}>
          <mesh ref={rearLeftWheelRef} castShadow>
            <cylinderGeometry args={[1.4, 1.4, 1.4, 8]} />
            <meshStandardMaterial color="#09090b" roughness={0.9} />
          </mesh>
        </group>

        {/* RIGHT REAR WHEEL */}
        <group position={[-3.6, 2.8, 0.65]}>
          <mesh ref={rearRightWheelRef} castShadow>
            <cylinderGeometry args={[1.4, 1.4, 1.4, 8]} />
            <meshStandardMaterial color="#09090b" roughness={0.9} />
          </mesh>
        </group>

        {/* Headlight bulbs & Fog lights volumetric glow cones */}
        <group position={[5.5, 0, 1.1]}>
          {/* Left Headlight */}
          <mesh position={[0, -1.8, 0]}>
            <sphereGeometry args={[0.35, 6, 6]} />
            <meshBasicMaterial color="#fef08a" />
          </mesh>
          {/* Right Headlight */}
          <mesh position={[0, 1.8, 0]}>
            <sphereGeometry args={[0.35, 6, 6]} />
            <meshBasicMaterial color="#fef08a" />
          </mesh>

          {/* Volumetric Fog Cones */}
          <mesh position={[11, -1.8, 0.1]} rotation={[0, Math.PI / 2, 0]}>
            <cylinderGeometry args={[2.8, 0.1, 22, 6, 1, true]} />
            <meshBasicMaterial 
              color="#fef08a" 
              transparent 
              opacity={0.08} 
              blending={THREE.AdditiveBlending}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh position={[11, 1.8, 0.1]} rotation={[0, Math.PI / 2, 0]}>
            <cylinderGeometry args={[2.8, 0.1, 22, 6, 1, true]} />
            <meshBasicMaterial 
              color="#fef08a" 
              transparent 
              opacity={0.08} 
              blending={THREE.AdditiveBlending}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* Spotlight to cast dynamic shadows forward */}
          <spotLight 
            position={[0, 0, 0.2]} 
            angle={Math.PI / 5} 
            penumbra={0.6} 
            intensity={12.0} 
            distance={100} 
            castShadow
            shadow-mapSize={[512, 512]}
            target-position={[45, 0, -1.0]}
          />
        </group>

        {/* Red brake Taillights */}
        <group position={[-5.6, 0, 1.1]}>
          <mesh position={[0, -1.6, 0]}>
            <boxGeometry args={[0.2, 0.8, 0.35]} />
            <meshStandardMaterial 
              color={isBraking || isDrifting ? '#f43f5e' : '#7f1d1d'} 
              emissive="#f43f5e"
              emissiveIntensity={isBraking || isDrifting ? 4.5 : 0.0}
            />
          </mesh>
          <mesh position={[0, 1.6, 0]}>
            <boxGeometry args={[0.2, 0.8, 0.35]} />
            <meshStandardMaterial 
              color={isBraking || isDrifting ? '#f43f5e' : '#7f1d1d'} 
              emissive="#f43f5e"
              emissiveIntensity={isBraking || isDrifting ? 4.5 : 0.0}
            />
          </mesh>
        </group>
      </group>

      {/* Floating Name Overlay */}
      {showLabel && (
        <Html 
          distanceFactor={90} 
          position={[0, 0, 5.0]} 
          center 
          style={{ pointerEvents: 'none' }}
        >
          <div 
            className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold tracking-wider font-sans whitespace-nowrap shadow-xl border border-slate-800 transition-all duration-300 pointer-events-none select-none ${
              active 
                ? 'bg-slate-950 text-white border-white/40 scale-110 ring-2 ring-emerald-500/50' 
                : 'bg-slate-950/80 text-slate-300'
            }`}
          >
            {name}
          </div>
        </Html>
      )}
    </group>
  );
};
