# ApexAI Racing Lab: Master's Thesis Edition (TFM Videojuegos & IA)

Plan maestro de arquitectura, jugabilidad y sistemas de Inteligencia Artificial para el videojuego de carreras trazadas ("Draw-to-Race"), diseñado para alcanzar el estándar de excelencia académica (Matrícula de Honor). El proyecto combina mecánicas cinemáticas predictivas, agentes autónomos basados en optimización genética y perfiles de comportamiento, y una suite integral de telemetría y análisis de rendimiento en tiempo real.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Al omitir las preguntas interactivas en la Fase 1, se han adoptado por defecto las opciones recomendadas de máxima solvencia técnica y académica para garantizar un proyecto de categoría sobresaliente:

- **Confirmed Decision 1 (Paradigma de IA)**: Implementación de un motor híbrido de IA con **Optimización Genética de Trazada (Spline Relaxation)** combinada con **Perfiles Heurísticos de Conducta** (Agresivo, Calculador/Apex Master, y Defensivo).
- **Confirmed Decision 2 (Herramienta Académica)**: Incorporación del **"Apex Telemetry Lab"**, que proporciona análisis de fuerzas G, mapa de calor de velocidad, cálculo de delta respecto al ápice ideal de curva (*Apex Delta*), y sistema de repetición con trazadas superpuestas ("Ghost Replay").
- **Confirmed Decision 3 (Profundidad de Físicas)**: Modelo físico de dos niveles con **cinemática de neumáticos (fricción no lineal de Pacejka simplificada)**, deslizamiento lateral/derrape proporcional a la curvatura, rebufo (*slipstream*) entre vehículos y respuesta elástica realista ante colisiones y pianos.
- **Confirmed Decision 4 (Pantalla y Ergonomía)**: Modo pantalla completa nativo e inmersivo permanente con canvas adaptativo de alta resolución y contenedor de circuito al 100% del área disponible sin solapamiento de etiquetas.

---

## 1. Overview & Core Concept

- **What It Does**: Es un simulador y videojuego de competición automovilística en dos fases complementarias:
  1. *Fase de Estrategia Vectorial*: El piloto traza libremente con el ratón o pantalla táctil la trayectoria óptima sobre el asfalto del circuito, modulando la velocidad mediante la aceleración de su propio trazo o selector de marchas.
  2. *Fase de Carrera 3D Simulada*: La física computa en tiempo real las inercias, fuerzas centrífugas, adherencia de los neumáticos y colisiones frente a coches conducidos por IA competitiva generada proceduralmente, visualizado en un entorno 3D con iluminación dinámica PBR, cámaras cinemáticas de televisión y sonido sintetizado reactivo.
- **Target Audience / Persona**: Tribunal evaluador de Máster en Inteligencia Artificial / Videojuegos, entusiastas de los deportes de motor, analistas de datos de carreras (F1, WEC) y jugadores de estrategia/simulación que buscan mecánicas originales donde la habilidad táctica prima sobre el control analógico convencional.
- **Key Value**: Demostración empírica de cómo la inteligencia artificial puede no solo gobernar oponentes realistas que compiten rueda a rueda sin "hacer trampas", sino también actuar como herramienta analítica evaluando en milisegundos la eficiencia de conducción humana frente a la trazada matemáticamente perfecta.

---

## 2. User Experience & Visual Design

### Key User Flows

```
┌─────────────────┐       ┌───────────────────────┐       ┌─────────────────────┐
│ 01. Circuito    │  ──>  │ 02. Parámetros IA &   │  ──>  │ 03. Trazado         │
│     & Vehículo  │       │     Dificultad        │       │     Vectorial       │
└─────────────────┘       └───────────────────────┘       └─────────────────────┘
                                                                     │
                                                                     ▼
┌─────────────────┐       ┌───────────────────────┐       ┌─────────────────────┐
│ 06. Telemetry   │  <──  │ 05. Podio &           │  <──  │ 04. Carrera 3D &    │
│     Lab & Ghost │       │     Evaluación TFM    │       │     Cámara F1       │
└─────────────────┘       └───────────────────────┘       └─────────────────────┘
```

1. **Selección de Circuito y Reglajes**: El usuario escoge trazado (Óvalo, Técnico, GP Red Bull Ring o Circuito Procedural) y configura su bólido (Velocidad Punta, Aceleración, Adherencia) frente a una parrilla personalizable de IAs.
2. **Entorno de Trazada Libre de Obstáculos**: Vista cenital con iluminación optimizada. Cero etiquetas molestas sobre el coche. Guía visual limpia con punto de anclaje inicial de alto contraste y barra superior con conteo de sectores completados en tiempo real.
3. **Carrera 3D Inmersiva**: Semáforo FIA de 5 luces rojas a verde. Vista en perspectiva con cámara dinámica de seguimiento, vibración de cámara al rebufo, marcas de neumático 3D (*skidmarks*) y telemetría lateral no intrusiva (tacómetro, velocímetro digital en `tabular-nums`, fuerza G y tiempos sectoriales).
4. **Laboratorio de Telemetría Post-Carrera**: Superposición de la trazada del jugador con la trazada teórica óptima de la IA. Mapa cromático de calor de velocidad (azul = frenada, rojo = máxima aceleración), comparador de tiempo por curva y métrica de eficiencia de conducción.

### Visual Identity & Theme

- **Aesthetic Direction**: *Obsidian Racing Engineering* — Inspirado en consolas profesionales de telemetría de Fórmula 1 y centros de operaciones de motorsport. Estilo sobrio, técnico, funcional y libre de ornamentos superfluos ("anti-slop").
- **Color Palette & Mood**:
  - `Canvas / Fondo Base`: Negro obsidiana profundo (`#090d16` / `slate-950`).
  - `Superficies Estructurales`: Carbón mate con bordes de 1px (`#131c2e` / `slate-900` con `border-slate-800`).
  - `Acento Primario`: Cian eléctrico de telemetría (`#06b6d4` / `cyan-500`) para lecturas y trazada propia.
  - `Acento Secundario`: Ámbar neon (`#f59e0b` / `amber-500`) para límites de adherencia, sectores y advertencias.
  - `Acento Competición`: Rojo carrera (`#ef4444` / `red-500`) para zonas de máxima velocidad y ápices de curva.
- **Typography & Hierarchy**:
  - `Display / Títulos`: Sans-serif angular condensado y limpio para competición.
  - `Body / Controles`: **Plus Jakarta Sans** (400 y 600) para máxima legibilidad sin saturación visual.
  - `Métricas & Telemetría`: **JetBrains Mono** / **Space Mono** con `tabular-nums` estricto en todos los cronómetros, velocidades y coordenadas.
- **Zero-Pill Discipline & Anti-Slop**:
  - Prohibido el uso de píldoras estáticas decorativas para estados o textos. Metadatos limpios separados por `·` o barras discretas.
  - Cero puntos verdes pulsantes decorativos.
  - Botones funcionales con labels directos de un solo renglón (`whitespace-nowrap`).
  - Contenedor de simulación aprovechando el máximo de pantalla con botón de alternancia pantalla completa fluido.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Motor de IA Basado en Optimización Genética de Trazada (Spline Relaxation)
- **Chosen Approach**: La IA no recorre una línea estática prefijada. Genera una población inicial de variantes de spline a lo largo del centro de pista y optimiza las posiciones de los nodos minimizando la curvatura total y maximizando la velocidad permitida por la física de fricción.
- **Why**: Para un TFM con Matrícula de Honor, una IA con waypoints fijos es insuficiente. Un evaluador valora que la IA calcule de forma matemática el ápice geométrico tardío (*late apex*) y adapte su velocidad según el agarre disponible.
- **Alternatives Considered**: Q-Learning tabular en tiempo de ejecución (descartado por excesiva lentitud de convergencia durante una partida web interactiva de 60 segundos).

### Decision 2: Físicas Desacopladas en RequestAnimationFrame con Búfer de Estado
- **Chosen Approach**: El bucle físico corre a 60-120 FPS dentro de un bucle de animación con referencias reactivas (`useRef`), aplicando modelos de tracción angular, fuerza centrífuga $F_c = \frac{m v^2}{r}$ y rebotes vectoriales elásticos en colisiones.
- **Why**: Evita por completo los re-renders innecesarios de React, garantizando que Three.js rinda con suavidad cristalina sin tirones (*micro-stuttering*), incluso en situaciones de alta carga.
- **Alternatives Considered**: Simulación ligada al ciclo de estado de Zustand/React (descartada por provocar cuellos de botella y pérdidas de fotogramas).

### Decision 3: "Apex Telemetry Lab" como Componente Central Post-Carrera
- **Chosen Approach**: Al cruzar la meta, se habilita una pestaña interactiva que almacena toda la traza de la carrera (muestras a 20Hz: posición, velocidad instantánea, ángulo de derrape y aceleración normal) permitiendo comparar curva a curva dónde ganó o perdió tiempo el jugador frente a la IA.
- **Why**: Transforma el juego de una simple experiencia arcade a una auténtica herramienta didáctica y de análisis para investigación de IA en automovilismo.
- **Alternatives Considered**: Pantalla de podio tradicional con tabla de tiempos estática (insuficiente para una calificación de honor).

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        APEX RACING APPLET                              │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    Header & Global Status                        │  │
│  │    [Brand: APEX AI LAB]  —  [Modo / Circuito]  —  [Pantalla C.]  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                   │                                    │
│         ┌─────────────────────────┴─────────────────────────┐          │
│         ▼                                                   ▼          │
│  ┌───────────────────────────────┐     ┌────────────────────────────┐  │
│  │     FASE 1: VECTOR DRAWING    │     │    FASE 2: 3D SIMULATION   │  │
│  │  - SVG Canvas Interactivo     │     │  - R3F Canvas PBR Studio   │  │
│  │  - Detección Anclaje Salida   │     │  - Camera Director (TV)    │  │
│  │  - Validación de Sectores     │     │  - Car3D Procedural Mesh   │  │
│  │  - Feedback Velocidad en Vivo │     │  - Pistas / Humo / Marcas  │  │
│  └───────────────────────────────┘     └────────────────────────────┘  │
│                 │                                     │                │
│                 ▼                                     ▼                │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                   CORE SIMULATION & AI ENGINE                    │  │
│  │  - Kinematic Vehicle Dynamic (Pacejka Friction Curve)            │  │
│  │  - Spline Genetic AI Solver (Apex Search & Curvature Smoothing)  │  │
│  │  - Continuous Collision Resolution (AABB + Raycast Polygons)     │  │
│  │  - Web Audio Procedural Synthesizer (Oscillator Pitch & Drift)   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                   │                                    │
│                                   ▼                                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │              FASE 3: APEX TELEMETRY LAB (POST-RACE)              │  │
│  │  - Ghost Replay Viewer (Velocidad variable 0.5x - 2.0x)          │  │
│  │  - Curvature & Apex Delta Visualizer (Mapa de calor)             │  │
│  │  - G-Force Vector Graph & Academic Benchmark Score               │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### Data Model & Core Entities

```typescript
// Estructura de Telemetría para Análisis Académico
export interface TelemetrySample {
  timestamp: number;
  x: number;
  y: number;
  speed: number;
  lateralG: number;
  longitudinalG: number;
  isDrifting: boolean;
  distToCenterline: number;
  lapPercentage: number;
}

// Parámetros de la IA para Evaluación en TFM
export interface AIPersonality {
  id: string;
  name: string;
  archetype: 'aggressive' | 'apex_master' | 'defensive';
  corneringCaution: number;   // Factor de frenada preventiva [0.7 - 1.2]
  apexCuttingPreference: number; // Modificador de distancia al interior [-0.4 a +0.4]
  overtakeThreshold: number;  // Distancia mínima para buscar trayectoria exterior
}

// Resumen de Evaluación Académica
export interface PerformanceAssessment {
  overallScore: number;       // Puntuación 0-100 calculada
  apexAccuracy: number;       // % de cercanía al ápice geométrico
  smoothnessIndex: number;    // Índice de suavidad de aceleración centrípeta
  timeDeltaToOptimal: number; // Diferencia con la trayectoria límite teórica
}
```

### Plan de Pruebas y Validación (Testing Strategy)

1. **Test Físico**: Verificación de conservación de momento y ausencia de tunelado (*tunneling*) en impactos frontales y oblicuos a velocidad máxima contra las barreras internas y externas.
2. **Test de Algoritmo de IA**: Comprobación de que la IA genera trayectorias continuas cerradas que superan todos los puntos de control en el orden correcto sin salir de los límites de pista.
3. **Test de Telemetría**: Validación de recolección de muestras sin fugas de memoria (*memory leaks*) en sesiones continuas de 10+ vueltas.
4. **Test de UX/Viewport**: Verificación de renderizado en pantallas estándar (1920x1080, 1440x900) y en modo pantalla completa sin deformación de aspect ratio ni superposición de textos.

---

## 5. Execution Roadmap

- **Hito 1**: Integración de los perfiles de IA matemática avanzada y optimizador de curvas en `tracks.ts`.
- **Hito 2**: Refactorización del viewport de dibujo y carrera en `GameCanvas.tsx` con controles unificados, pantalla completa inmersiva y eliminación de etiquetas invasivas.
- **Hito 3**: Implementación del módulo "Apex Telemetry Lab" en `GameUI.tsx` con gráficos de fuerzas G, mapa de calor de velocidad y comparador de trazadas.
- **Hito 4**: Calibración acústica procedimental (Web Audio API) y verificación final mediante compilación y pruebas unitarias.
