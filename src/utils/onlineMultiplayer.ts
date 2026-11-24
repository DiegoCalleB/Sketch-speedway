import { CarType, LightingPreset, Point, WeatherCondition } from '../types';

export interface RegionOption {
  code: string;
  name: string;
  flag: string;
}

export const REGIONS: RegionOption[] = [
  { code: 'ES-MD', name: 'Madrid · España', flag: '🇪🇸' },
  { code: 'ES-CT', name: 'Cataluña · España', flag: '🇪🇸' },
  { code: 'ES-AN', name: 'Andalucía · España', flag: '🇪🇸' },
  { code: 'ES-VC', name: 'C. Valenciana · España', flag: '🇪🇸' },
  { code: 'ES-AS', name: 'Asturias · España', flag: '🇪🇸' },
  { code: 'ES-PV', name: 'País Vasco · España', flag: '🇪🇸' },
  { code: 'ES-GA', name: 'Galicia · España', flag: '🇪🇸' },
  { code: 'INT-EU', name: 'Europa · Internacional', flag: '🇪🇺' },
  { code: 'LATAM', name: 'Latinoamérica', flag: '🌎' },
  { code: 'INT-NA', name: 'Norteamérica', flag: '🇺🇸' },
  { code: 'INT-AS', name: 'Asia · Pacífico', flag: '🇯🇵' }
];

export function getRegionByCode(code: string): RegionOption {
  return REGIONS.find((r) => r.code === code) || REGIONS[0];
}

export interface LeaderboardEntry {
  id: string;
  trackId: string;
  driverName: string;
  regionCode: string;
  regionName: string;
  carType: CarType;
  carColor: string;
  lapTimeMs: number;
  apexScore: number;
  smoothnessScore: number;
  topSpeedKmh: number;
  weather: WeatherCondition;
  createdAt: number;
  challengeCode: string;
  ghostPath?: Point[];
}

export interface OnlineRoomPlayer {
  id: string;
  name: string;
  regionCode: string;
  carType: CarType;
  color: string;
  ready: boolean;
  pathSubmitted: boolean;
  drawnPath?: Point[];
}

export interface OnlineRoomState {
  code: string;
  hostId: string;
  trackId: string;
  totalLaps: number;
  lightingPreset: LightingPreset;
  weather: WeatherCondition;
  status: 'lobby' | 'drawing' | 'racing';
  players: OnlineRoomPlayer[];
  createdAt: number;
}

export interface PublicRoomSummary {
  code: string;
  trackId: string;
  totalLaps: number;
  playerCount: number;
  hostName: string;
  status: string;
  weather: string;
}

type OnlineEventListener = (event: {
  type: string;
  clientId?: string;
  room?: OnlineRoomState;
  rooms?: PublicRoomSummary[];
  entry?: LeaderboardEntry;
  message?: string;
}) => void;

class OnlineMultiplayerClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<OnlineEventListener>();
  private reconnectTimer: number | null = null;
  public clientId: string = '';
  public currentRoom: OnlineRoomState | null = null;
  public publicRooms: PublicRoomSummary[] = [];
  public connected: boolean = false;

  connect() {
    if (typeof window === 'undefined') return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws`;

    try {
      const socket = new WebSocket(wsUrl);
      this.ws = socket;

      socket.onopen = () => {
        this.connected = true;
        this.emit({ type: 'connection:status' });
      };

      socket.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data.type === 'connected') {
            this.clientId = data.clientId || '';
            this.publicRooms = data.rooms || [];
          } else if (data.type === 'room:state') {
            this.currentRoom = data.room || null;
          } else if (data.type === 'rooms:list') {
            this.publicRooms = data.rooms || [];
          }
          this.emit(data);
        } catch {
          // ignore malformed packet
        }
      };

      socket.onclose = () => {
        this.connected = false;
        this.emit({ type: 'connection:status' });
        if (this.reconnectTimer === null) {
          this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
          }, 2800);
        }
      };
    } catch {
      // ignore if offline
    }
  }

  subscribe(listener: OnlineEventListener): () => void {
    this.listeners.add(listener);
    this.connect();
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: Parameters<OnlineEventListener>[0]) {
    this.listeners.forEach((cb) => cb(event));
  }

  send(payload: Record<string, unknown>) {
    this.connect();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else {
      setTimeout(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify(payload));
        }
      }, 450);
    }
  }

  createRoom(params: {
    playerName: string;
    regionCode: string;
    carType: CarType;
    color: string;
    trackId: string;
    totalLaps: number;
    lightingPreset: LightingPreset;
    weather: WeatherCondition;
  }) {
    this.send({
      type: 'room:create',
      ...params
    });
  }

  joinRoom(params: {
    roomCode: string;
    playerName: string;
    regionCode: string;
    carType: CarType;
    color: string;
  }) {
    this.send({
      type: 'room:join',
      ...params
    });
  }

  leaveRoom() {
    this.currentRoom = null;
    this.send({ type: 'room:leave' });
    this.emit({ type: 'room:state', room: undefined });
  }

  updateRoomSettings(params: {
    trackId?: string;
    totalLaps?: number;
    lightingPreset?: LightingPreset;
    weather?: WeatherCondition;
  }) {
    this.send({
      type: 'room:update_settings',
      ...params
    });
  }

  startOnlineDrawingPhase() {
    this.send({ type: 'room:start_drawing' });
  }

  submitOnlinePath(drawnPath: Point[]) {
    this.send({
      type: 'room:submit_path',
      drawnPath
    });
  }

  resetRoomToLobby() {
    this.send({ type: 'room:reset_lobby' });
  }
}

export const onlineClient = new OnlineMultiplayerClient();

export async function fetchLeaderboardEntries(
  trackId: string,
  regionCode: string = 'ALL'
): Promise<{ entries: LeaderboardEntry[]; publicRooms: PublicRoomSummary[] }> {
  try {
    const params = new URLSearchParams({ trackId, regionCode });
    const res = await fetch(`/api/leaderboard?${params.toString()}`);
    if (!res.ok) throw new Error('HTTP error');
    const data = await res.json();
    return {
      entries: Array.isArray(data.entries) ? data.entries : [],
      publicRooms: Array.isArray(data.publicRooms) ? data.publicRooms : []
    };
  } catch {
    return { entries: [], publicRooms: [] };
  }
}

export async function fetchChallengeByCode(
  challengeCode: string
): Promise<LeaderboardEntry | null> {
  try {
    const params = new URLSearchParams({ challengeCode: challengeCode.trim().toUpperCase() });
    const res = await fetch(`/api/leaderboard?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.entry || null;
  } catch {
    return null;
  }
}

export async function submitLeaderboardRecord(payload: {
  trackId: string;
  driverName: string;
  regionCode: string;
  regionName: string;
  carType: CarType;
  carColor: string;
  lapTimeMs: number;
  apexScore: number;
  smoothnessScore: number;
  topSpeedKmh: number;
  weather: WeatherCondition;
  ghostPath?: Point[];
}): Promise<LeaderboardEntry | null> {
  try {
    const res = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.entry || null;
  } catch {
    return null;
  }
}
