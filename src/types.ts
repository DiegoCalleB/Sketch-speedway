export interface Point {
  x: number;
  y: number;
  t: number;      // timestamp in milliseconds
  speed: number;  // computed speed at this point (pixels/ms or relative)
}

export interface TrackPoint {
  x: number;
  y: number;
}

export interface Track {
  id: string;
  name: string;
  difficulty: 'Fácil' | 'Medio' | 'Difícil';
  description: string;
  // Canvas width and height are usually standard, say 800x500
  width: number;
  height: number;
  // Inner and outer boundaries as polygon points
  outerBoundary: TrackPoint[];
  innerBoundary: TrackPoint[];
  // Grid starting positions
  startGrid: { x: number; y: number; angle: number }[];
  startLine: { p1: TrackPoint; p2: TrackPoint };
  // Checkpoints to verify complete lap
  checkpoints: { p1: TrackPoint; p2: TrackPoint }[];
  // Decorative additions for professional 2026 graphics
  trees?: { x: number; y: number; size: number; type: 'pine' | 'leaf' }[];
  grandstands?: { x: number; y: number; width: number; height: number; angle: number; title: string }[];
  decorations?: { x: number; y: number; type: 'tent' | 'box' | 'car' | 'flag'; color: string; angle?: number }[];
}

export interface CarStats {
  name: string;
  color: string;
  maxSpeed: number;       // peak velocity modifier
  acceleration: number;   // how fast it speeds up
  grip: number;           // threshold before it starts drifting
  driftRecovery: number;  // how fast it regains traction
  description: string;
}

export type CarType = 'speedster' | 'drifter' | 'balanced';

export type AIArchetype = 'aggressive' | 'apex_master' | 'defensive';

export interface TelemetrySample {
  timestamp: number;
  x: number;
  y: number;
  speed: number;
  lateralG: number;
  longitudinalG: number;
  isDrifting: boolean;
  slipstreamActive: boolean;
  distToCenterline: number;
  lapProgress: number; // 0.0 - 1.0
}

export interface PlayerTelemetry {
  playerId: string;
  playerName: string;
  color: string;
  carType: CarType;
  samples: TelemetrySample[];
  apexScore: number;       // 0 - 100
  smoothnessScore: number; // 0 - 100
  avgSpeed: number;
  maxSpeed: number;
  maxLateralG: number;
}

export type PaceStrategyMode = 'attack' | 'balanced' | 'conserve';

export interface RaceResultItem {
  playerId: string;
  finished: boolean;
  time: number;
  disqualified: boolean;
  telemetry?: TelemetrySample[];
  performanceScore?: number;
  lapTimes?: number[];
  bestLap?: number;
  totalLaps?: number;
}

export interface Player {
  id: string;
  name: string;
  color: string;
  carType: CarType;
  drawnPath: Point[];
  lapPaths: Point[][];
  isAI: boolean;
  aiArchetype?: AIArchetype;
  isReady: boolean;
  raceTime: number;       // final race time in ms
  finished: boolean;
  currentLap: number;
  disqualified: boolean;
}

export interface RaceCarState {
  playerId: string;
  x: number;
  y: number;
  vx: number;             // actual physical velocity
  vy: number;
  angle: number;          // orientation angle
  targetIndex: number;    // index in the drawnPath
  isDrifting: boolean;
  driftAngle: number;
  offTrack: boolean;
  finished: boolean;
  disqualified: boolean;
  timeFinished: number | null;
  checkpointPassed: number; // index of the last checkpoint passed
  lap: number;
  bounceCooldown: number; // frames to ignore wall collisions after bouncing
  slipstreamActive?: boolean;
  overspeedTimer?: number; // frames of grip loss penalty when entering a corner too fast
  lapStartTime?: number;
  lapTimes?: number[];
  bestLapTime?: number | null;
  tireHealth?: number;     // 100% down to 40% across multi-lap stints
  ersBattery?: number;     // 100% down to 0% hybrid MGU-K battery
  drsActive?: boolean;
  // Rigid-body vehicle physics telemetry & kinematics
  angularVelocity?: number; // rad/s chassis yaw rate
  steerAngle?: number;      // rad front wheel Ackermann steering angle
  slipAngle?: number;       // rad true body slip angle (heading vs velocity vector)
  longitudinalG?: number;   // forward/braking G-force (-5.0 to +2.5)
  lateralG?: number;        // cornering lateral G-force (-4.5 to +4.5)
  throttle?: number;        // 0..1 driver throttle application
  brake?: number;           // 0..1 driver brake pressure
  tireTemp?: number;        // °C Pirelli thermal grip window (78..126°C, peak 95..108°C)
  gear?: number;            // 1..8 sequential F1 gearbox ratio
  onCurb?: boolean;         // true when wheels ride over serrated FIA rumble kerbs
  shiftKick?: number;       // 0..1 transient torque pulse on sequential gear upshifts
  // Soft-Body Crash & Structural Deformation State (0.0 = pristine -> 1.0 = heavily crumpled/dented)
  damageFront?: number;     // Nosecone & front wing crumple / droop
  damageRear?: number;      // Rear wing & diffuser crush / tilt
  damageLeft?: number;      // Left sidepod & suspension caved-in dent
  damageRight?: number;     // Right sidepod & suspension caved-in dent
  chassisHealth?: number;   // 100% down to 25% overall structural integrity
  lastImpactSeverity?: number; // 0..1 transient shock impulse from latest barrier/car crash
  lastImpactZone?: 'front' | 'rear' | 'left' | 'right' | null;
  lastImpactPos?: { x: number; y: number } | null;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  // Optional 3D solid carbon-fiber debris chunk or water spray plume kinematics
  kind?: 'smoke' | 'spark' | 'debris' | 'spray';
  z?: number;
  vz?: number;
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  vRotX?: number;
  vRotY?: number;
  vRotZ?: number;
}

export type LightingPreset = 'day' | 'sunset' | 'night';

export type WeatherCondition = 'dry' | 'rain';

export type GamePhase = 'menu' | 'car_selection' | 'drawing' | 'racing' | 'results';


