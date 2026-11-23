// Dedicated Three.js render layers for crisp multi-pass rendering during 'racing'
// Layer 0: Circuit, terrain, grandstands, trees, sky, splines, particles, skidmarks (HDR World Buffer)
// Layer 1: Racing F1 Cars exclusively (Dedicated Crisp Foreground Pass — zero bloom bleed, zero scenery occlusion)
export const WORLD_RENDER_LAYER = 0;
export const CARS_RENDER_LAYER = 1;

export interface ProjectedCarScreenPoint {
  playerId: string;
  name: string;
  color: string;
  isHuman: boolean;
  isFocused: boolean;
  screenX: number; // CSS pixels in viewport
  screenY: number; // CSS pixels in viewport
  ndcX: number;
  ndcY: number;
  inFront: boolean;
  isOnScreen: boolean;
  speedKmh: number;
  offTrack: boolean;
  finished: boolean;
  lap: number;
}
