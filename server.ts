import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface StoredLeaderboardEntry {
  id: string;
  trackId: string;
  driverName: string;
  regionCode: string;
  regionName: string;
  carType: 'speedster' | 'balanced' | 'drifter';
  carColor: string;
  lapTimeMs: number;
  apexScore: number;
  smoothnessScore: number;
  topSpeedKmh: number;
  weather: 'dry' | 'rain';
  createdAt: number;
  challengeCode: string;
  ghostPath?: { x: number; y: number; t: number; speed: number }[];
}

export interface OnlineRoomPlayer {
  id: string;
  name: string;
  regionCode: string;
  carType: 'speedster' | 'balanced' | 'drifter';
  color: string;
  ready: boolean;
  pathSubmitted: boolean;
  drawnPath?: { x: number; y: number; t: number; speed: number }[];
}

export interface OnlineRoomState {
  code: string;
  hostId: string;
  trackId: string;
  totalLaps: number;
  lightingPreset: 'day' | 'sunset' | 'night';
  weather: 'dry' | 'rain';
  status: 'lobby' | 'drawing' | 'racing';
  players: OnlineRoomPlayer[];
  createdAt: number;
}

const DATA_DIR = path.join(__dirname, 'data');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');

const INITIAL_SEED_RECORDS: StoredLeaderboardEntry[] = [
  // Jarama
  {
    id: 'seed-jarama-1',
    trackId: 'jarama',
    driverName: 'Carlos Sainz Jr.',
    regionCode: 'ES-MD',
    regionName: 'Madrid · España',
    carType: 'balanced',
    carColor: '#ef4444',
    lapTimeMs: 6580,
    apexScore: 98,
    smoothnessScore: 95,
    topSpeedKmh: 332,
    weather: 'dry',
    createdAt: Date.now() - 3600_000 * 12,
    challengeCode: 'JRM-55'
  },
  {
    id: 'seed-jarama-2',
    trackId: 'jarama',
    driverName: 'Fernando Alonso',
    regionCode: 'ES-AS',
    regionName: 'Asturias · España',
    carType: 'drifter',
    carColor: '#10b981',
    lapTimeMs: 6640,
    apexScore: 97,
    smoothnessScore: 94,
    topSpeedKmh: 328,
    weather: 'dry',
    createdAt: Date.now() - 3600_000 * 18,
    challengeCode: 'ALO-14'
  },
  {
    id: 'seed-jarama-3',
    trackId: 'jarama',
    driverName: 'Max V. Racing',
    regionCode: 'INT-EU',
    regionName: 'Europa · Internacional',
    carType: 'speedster',
    carColor: '#3b82f6',
    lapTimeMs: 6790,
    apexScore: 94,
    smoothnessScore: 91,
    topSpeedKmh: 344,
    weather: 'dry',
    createdAt: Date.now() - 3600_000 * 24,
    challengeCode: 'MAX-01'
  },
  // Madring F1
  {
    id: 'seed-madring-1',
    trackId: 'madring',
    driverName: 'Diego De La Calle',
    regionCode: 'ES-MD',
    regionName: 'Madrid · España',
    carType: 'balanced',
    carColor: '#f59e0b',
    lapTimeMs: 6520,
    apexScore: 99,
    smoothnessScore: 96,
    topSpeedKmh: 338,
    weather: 'dry',
    createdAt: Date.now() - 3600_000 * 5,
    challengeCode: 'MAD-26'
  },
  {
    id: 'seed-madring-2',
    trackId: 'madring',
    driverName: 'Álex Palou GP',
    regionCode: 'ES-CT',
    regionName: 'Cataluña · España',
    carType: 'balanced',
    carColor: '#ec4899',
    lapTimeMs: 6690,
    apexScore: 96,
    smoothnessScore: 93,
    topSpeedKmh: 331,
    weather: 'dry',
    createdAt: Date.now() - 3600_000 * 14,
    challengeCode: 'BCN-10'
  },
  {
    id: 'seed-madring-3',
    trackId: 'madring',
    driverName: 'Checo Pérez MX',
    regionCode: 'LATAM',
    regionName: 'Latinoamérica',
    carType: 'speedster',
    carColor: '#10b981',
    lapTimeMs: 6840,
    apexScore: 93,
    smoothnessScore: 90,
    topSpeedKmh: 342,
    weather: 'dry',
    createdAt: Date.now() - 3600_000 * 20,
    challengeCode: 'MEX-11'
  },
  // Monaco
  {
    id: 'seed-monaco-1',
    trackId: 'monaco',
    driverName: 'Charles Leclerc',
    regionCode: 'INT-EU',
    regionName: 'Europa · Internacional',
    carType: 'drifter',
    carColor: '#ef4444',
    lapTimeMs: 6380,
    apexScore: 99,
    smoothnessScore: 97,
    topSpeedKmh: 318,
    weather: 'dry',
    createdAt: Date.now() - 3600_000 * 8,
    challengeCode: 'MON-16'
  },
  {
    id: 'seed-monaco-2',
    trackId: 'monaco',
    driverName: 'Pepe Martí F1',
    regionCode: 'ES-CT',
    regionName: 'Cataluña · España',
    carType: 'balanced',
    carColor: '#38bdf8',
    lapTimeMs: 6510,
    apexScore: 96,
    smoothnessScore: 93,
    topSpeedKmh: 322,
    weather: 'dry',
    createdAt: Date.now() - 3600_000 * 16,
    challengeCode: 'MON-23'
  },
  // Oval
  {
    id: 'seed-oval-1',
    trackId: 'oval',
    driverName: 'Lando Norris',
    regionCode: 'INT-EU',
    regionName: 'Europa · Internacional',
    carType: 'speedster',
    carColor: '#f59e0b',
    lapTimeMs: 5120,
    apexScore: 97,
    smoothnessScore: 96,
    topSpeedKmh: 345,
    weather: 'dry',
    createdAt: Date.now() - 3600_000 * 10,
    challengeCode: 'OVL-04'
  },
  // Forest
  {
    id: 'seed-forest-1',
    trackId: 'forest',
    driverName: 'Marta García F1',
    regionCode: 'ES-VC',
    regionName: 'C. Valenciana · España',
    carType: 'drifter',
    carColor: '#a855f7',
    lapTimeMs: 5280,
    apexScore: 97,
    smoothnessScore: 95,
    topSpeedKmh: 326,
    weather: 'dry',
    createdAt: Date.now() - 3600_000 * 9,
    challengeCode: 'FOR-19'
  },
  // Grand Prix (Monza)
  {
    id: 'seed-gp-1',
    trackId: 'grandprix',
    driverName: 'Kimi Antonelli',
    regionCode: 'INT-EU',
    regionName: 'Europa · Internacional',
    carType: 'speedster',
    carColor: '#10b981',
    lapTimeMs: 5690,
    apexScore: 98,
    smoothnessScore: 95,
    topSpeedKmh: 348,
    weather: 'dry',
    createdAt: Date.now() - 3600_000 * 7,
    challengeCode: 'MNZ-12'
  }
];

function loadLeaderboard(): StoredLeaderboardEntry[] {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(LEADERBOARD_FILE)) {
      fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(INITIAL_SEED_RECORDS, null, 2), 'utf-8');
      return [...INITIAL_SEED_RECORDS];
    }
    const raw = fs.readFileSync(LEADERBOARD_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (e) {
    console.error('Error loading leaderboard file:', e);
  }
  return [...INITIAL_SEED_RECORDS];
}

function saveLeaderboard(entries: StoredLeaderboardEntry[]) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(entries.slice(0, 250), null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving leaderboard file:', e);
  }
}

let leaderboardEntries: StoredLeaderboardEntry[] = loadLeaderboard();
const rooms = new Map<string, OnlineRoomState>();
const clientMeta = new Map<WebSocket, { clientId: string; roomCode: string | null }>();

function generateChallengeCode(trackId: string): string {
  const prefix = trackId.slice(0, 3).toUpperCase();
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 3; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}-${suffix}`;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname === '/ws') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      }
    } catch {
      // ignore malformed upgrade URLs
    }
  });

  const broadcastAll = (payload: unknown) => {
    const msg = JSON.stringify(payload);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
  };

  const broadcastRoom = (roomCode: string) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    // Send sanitized room summary + full room state to members
    const msg = JSON.stringify({ type: 'room:state', room });
    wss.clients.forEach((client) => {
      const meta = clientMeta.get(client);
      if (client.readyState === WebSocket.OPEN && meta?.roomCode === roomCode) {
        client.send(msg);
      }
    });
    broadcastPublicRoomsList();
  };

  const getPublicRoomsSummary = () => {
    const list: {
      code: string;
      trackId: string;
      totalLaps: number;
      playerCount: number;
      hostName: string;
      status: string;
      weather: string;
    }[] = [];
    rooms.forEach((r) => {
      if (r.players.length > 0) {
        list.push({
          code: r.code,
          trackId: r.trackId,
          totalLaps: r.totalLaps,
          playerCount: r.players.length,
          hostName: r.players[0]?.name || 'Anfitrión',
          status: r.status,
          weather: r.weather
        });
      }
    });
    return list;
  };

  const broadcastPublicRoomsList = () => {
    broadcastAll({
      type: 'rooms:list',
      rooms: getPublicRoomsSummary()
    });
  };

  // REST API: Fetch Global & Regional Leaderboard + Challenge Lookup
  app.get('/api/leaderboard', (req, res) => {
    const trackId = typeof req.query.trackId === 'string' ? req.query.trackId : undefined;
    const regionCode = typeof req.query.regionCode === 'string' ? req.query.regionCode : undefined;
    const challengeCode =
      typeof req.query.challengeCode === 'string'
        ? req.query.challengeCode.trim().toUpperCase()
        : undefined;

    if (challengeCode) {
      const found = leaderboardEntries.find(
        (e) => e.challengeCode.toUpperCase() === challengeCode
      );
      return res.json({ entry: found || null });
    }

    let filtered = [...leaderboardEntries];
    if (trackId && trackId !== 'all') {
      filtered = filtered.filter((e) => e.trackId === trackId);
    }
    if (regionCode && regionCode !== 'ALL') {
      filtered = filtered.filter((e) => e.regionCode === regionCode);
    }

    filtered.sort((a, b) => a.lapTimeMs - b.lapTimeMs);
    res.json({
      entries: filtered.slice(0, 50),
      publicRooms: getPublicRoomsSummary()
    });
  });

  // REST API: Submit a New Lap Time & Ghost Trajectory to Global/Regional Ranking
  app.post('/api/leaderboard', (req, res) => {
    const {
      trackId,
      driverName,
      regionCode,
      regionName,
      carType,
      carColor,
      lapTimeMs,
      apexScore,
      smoothnessScore,
      topSpeedKmh,
      weather,
      ghostPath
    } = req.body || {};

    if (
      typeof trackId !== 'string' ||
      typeof driverName !== 'string' ||
      typeof lapTimeMs !== 'number' ||
      !Number.isFinite(lapTimeMs) ||
      lapTimeMs < 2500 ||
      lapTimeMs > 120000
    ) {
      return res.status(400).json({ error: 'Datos de vuelta inválidos' });
    }

    const cleanName = driverName.trim().slice(0, 26) || 'Piloto F1';
    const cleanRegion =
      typeof regionCode === 'string' && regionCode.trim() ? regionCode.trim().slice(0, 10) : 'ES-MD';
    const cleanRegionName =
      typeof regionName === 'string' && regionName.trim()
        ? regionName.trim().slice(0, 32)
        : 'Madrid · España';

    // Cap ghostPath to 260 points so payloads stay compact and fast
    const compactGhost = Array.isArray(ghostPath)
      ? ghostPath.slice(0, 260).map((pt: { x: number; y: number; t: number; speed: number }) => ({
          x: Number(Number(pt.x).toFixed(1)),
          y: Number(Number(pt.y).toFixed(1)),
          t: Math.round(Number(pt.t)),
          speed: Number(Number(pt.speed).toFixed(2))
        }))
      : undefined;

    // Check if same driver already has a record on this track; keep personal best or insert if faster
    const existingIdx = leaderboardEntries.findIndex(
      (e) =>
        e.trackId === trackId &&
        e.driverName.toLowerCase() === cleanName.toLowerCase() &&
        e.regionCode === cleanRegion
    );

    let savedEntry: StoredLeaderboardEntry;
    if (existingIdx >= 0) {
      const existing = leaderboardEntries[existingIdx];
      if (lapTimeMs < existing.lapTimeMs) {
        savedEntry = {
          ...existing,
          lapTimeMs: Math.round(lapTimeMs),
          carType: carType || existing.carType,
          carColor: carColor || existing.carColor,
          apexScore: Math.round(Number(apexScore) || 90),
          smoothnessScore: Math.round(Number(smoothnessScore) || 88),
          topSpeedKmh: Math.round(Number(topSpeedKmh) || 330),
          weather: weather === 'rain' ? 'rain' : 'dry',
          createdAt: Date.now(),
          ghostPath: compactGhost || existing.ghostPath
        };
        leaderboardEntries[existingIdx] = savedEntry;
      } else {
        // Still update ghostPath if existing didn't have one
        if (!existing.ghostPath && compactGhost) {
          existing.ghostPath = compactGhost;
        }
        savedEntry = existing;
      }
    } else {
      savedEntry = {
        id: `lb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        trackId,
        driverName: cleanName,
        regionCode: cleanRegion,
        regionName: cleanRegionName,
        carType:
          carType === 'speedster' || carType === 'drifter' ? carType : 'balanced',
        carColor: typeof carColor === 'string' ? carColor : '#ef4444',
        lapTimeMs: Math.round(lapTimeMs),
        apexScore: Math.round(Number(apexScore) || 90),
        smoothnessScore: Math.round(Number(smoothnessScore) || 88),
        topSpeedKmh: Math.round(Number(topSpeedKmh) || 330),
        weather: weather === 'rain' ? 'rain' : 'dry',
        createdAt: Date.now(),
        challengeCode: generateChallengeCode(trackId),
        ghostPath: compactGhost
      };
      leaderboardEntries.push(savedEntry);
    }

    leaderboardEntries.sort((a, b) => a.lapTimeMs - b.lapTimeMs);
    saveLeaderboard(leaderboardEntries);

    broadcastAll({
      type: 'leaderboard:updated',
      entry: savedEntry
    });

    res.json({ entry: savedEntry });
  });

  // WebSocket Handler for Real-Time Cross-Device Online Multiplayer Rooms
  wss.on('connection', (ws) => {
    const clientId = `pilot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    clientMeta.set(ws, { clientId, roomCode: null });

    ws.send(
      JSON.stringify({
        type: 'connected',
        clientId,
        rooms: getPublicRoomsSummary()
      })
    );

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        const meta = clientMeta.get(ws);
        if (!meta) return;

        if (data.type === 'room:create') {
          LeaveCurrentRoom(ws);
          const code = generateRoomCode();
          const hostPlayer: OnlineRoomPlayer = {
            id: meta.clientId,
            name: (data.playerName || 'Anfitrión F1').slice(0, 22),
            regionCode: data.regionCode || 'ES-MD',
            carType: data.carType || 'balanced',
            color: data.color || '#ef4444',
            ready: true,
            pathSubmitted: false
          };
          const newRoom: OnlineRoomState = {
            code,
            hostId: meta.clientId,
            trackId: data.trackId || 'jarama',
            totalLaps: Number(data.totalLaps) || 2,
            lightingPreset: data.lightingPreset || 'day',
            weather: data.weather || 'dry',
            status: 'lobby',
            players: [hostPlayer],
            createdAt: Date.now()
          };
          rooms.set(code, newRoom);
          meta.roomCode = code;
          broadcastRoom(code);
        } else if (data.type === 'room:join') {
          const code = String(data.roomCode || '')
            .trim()
            .toUpperCase();
          const room = rooms.get(code);
          if (!room) {
            ws.send(
              JSON.stringify({
                type: 'room:error',
                message: `La sala "${code}" no existe o ya se ha cerrado.`
              })
            );
            return;
          }
          if (room.players.length >= 4 && !room.players.some((p) => p.id === meta.clientId)) {
            ws.send(
              JSON.stringify({
                type: 'room:error',
                message: `La sala "${code}" está llena (máximo 4 pilotos).`
              })
            );
            return;
          }

          LeaveCurrentRoom(ws);
          meta.roomCode = code;

          // Ensure unique car color inside room
          const palette = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4'];
          let chosenColor = data.color || '#3b82f6';
          if (room.players.some((p) => p.color.toLowerCase() === chosenColor.toLowerCase())) {
            chosenColor =
              palette.find(
                (hex) => !room.players.some((p) => p.color.toLowerCase() === hex.toLowerCase())
              ) || '#10b981';
          }

          const existing = room.players.find((p) => p.id === meta.clientId);
          if (!existing) {
            room.players.push({
              id: meta.clientId,
              name: (data.playerName || `Piloto ${room.players.length + 1}`).slice(0, 22),
              regionCode: data.regionCode || 'ES-MD',
              carType: data.carType || 'balanced',
              color: chosenColor,
              ready: true,
              pathSubmitted: false
            });
          }
          broadcastRoom(code);
        } else if (data.type === 'room:leave') {
          LeaveCurrentRoom(ws);
        } else if (data.type === 'room:update_settings') {
          if (!meta.roomCode) return;
          const room = rooms.get(meta.roomCode);
          if (!room || room.hostId !== meta.clientId) return;
          if (data.trackId) room.trackId = data.trackId;
          if (data.totalLaps) room.totalLaps = Number(data.totalLaps);
          if (data.lightingPreset) room.lightingPreset = data.lightingPreset;
          if (data.weather) room.weather = data.weather;
          broadcastRoom(room.code);
        } else if (data.type === 'room:update_player') {
          if (!meta.roomCode) return;
          const room = rooms.get(meta.roomCode);
          if (!room) return;
          const p = room.players.find((pl) => pl.id === meta.clientId);
          if (!p) return;
          if (data.name) p.name = String(data.name).slice(0, 22);
          if (data.carType) p.carType = data.carType;
          if (data.color) p.color = data.color;
          if (data.regionCode) p.regionCode = data.regionCode;
          broadcastRoom(room.code);
        } else if (data.type === 'room:start_drawing') {
          if (!meta.roomCode) return;
          const room = rooms.get(meta.roomCode);
          if (!room || room.hostId !== meta.clientId) return;
          room.status = 'drawing';
          room.players.forEach((p) => {
            p.pathSubmitted = false;
            p.drawnPath = undefined;
          });
          broadcastRoom(room.code);
        } else if (data.type === 'room:submit_path') {
          if (!meta.roomCode) return;
          const room = rooms.get(meta.roomCode);
          if (!room) return;
          const p = room.players.find((pl) => pl.id === meta.clientId);
          if (!p) return;
          if (Array.isArray(data.drawnPath) && data.drawnPath.length >= 5) {
            p.drawnPath = data.drawnPath.slice(0, 320);
            p.pathSubmitted = true;
          }
          // Check if all connected players in the room have submitted their drawn path
          const allSubmitted = room.players.every((pl) => pl.pathSubmitted && pl.drawnPath);
          if (allSubmitted) {
            room.status = 'racing';
          }
          broadcastRoom(room.code);
        } else if (data.type === 'room:reset_lobby') {
          if (!meta.roomCode) return;
          const room = rooms.get(meta.roomCode);
          if (!room) return;
          room.status = 'lobby';
          room.players.forEach((p) => {
            p.pathSubmitted = false;
            p.drawnPath = undefined;
          });
          broadcastRoom(room.code);
        }
      } catch (err) {
        console.error('WS message parse error:', err);
      }
    });

    ws.on('close', () => {
      LeaveCurrentRoom(ws);
      clientMeta.delete(ws);
    });
  });

  function LeaveCurrentRoom(ws: WebSocket) {
    const meta = clientMeta.get(ws);
    if (!meta || !meta.roomCode) return;
    const code = meta.roomCode;
    meta.roomCode = null;
    const room = rooms.get(code);
    if (!room) return;
    room.players = room.players.filter((p) => p.id !== meta.clientId);
    if (room.players.length === 0) {
      rooms.delete(code);
      broadcastPublicRoomsList();
    } else {
      if (room.hostId === meta.clientId) {
        room.hostId = room.players[0].id;
      }
      broadcastRoom(code);
    }
  }

  // Mount Vite dev server in development or static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Draw Race F1 Full-Stack Server & Online Multiplayer WS running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
