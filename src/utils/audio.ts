// Realistic Formula 1 Multi-Harmonic Engine & Telemetry Audio Synthesizer (Web Audio API)

interface F1CarAudioNodes {
  fundamentalOsc: OscillatorNode;
  octaveOsc: OscillatorNode;
  fifthOsc: OscillatorNode;
  subOsc: OscillatorNode;
  turboWhineOsc: OscillatorNode;
  turboWhineGain: GainNode;
  noiseSource: AudioBufferSourceNode;
  noiseFilter: BiquadFilterNode;
  noiseGain: GainNode;
  exhaustFilter: BiquadFilterNode;
  formantFilter: BiquadFilterNode;
  shaper: WaveShaperNode;
  masterGain: GainNode;
  lastSpeedRatio: number;
  lastGear: number;
  shiftCutUntil: number;
  downshiftBlipUntil: number;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private activeEngines: Map<string, F1CarAudioNodes> = new Map();
  private activeScreeches: Map<
    string,
    {
      noise: AudioBufferSourceNode;
      filter: BiquadFilterNode;
      tonalOsc: OscillatorNode;
      gain: GainNode;
    }
  > = new Map();
  private drawingPreviewNodes: {
    osc1: OscillatorNode;
    osc2: OscillatorNode;
    filter: BiquadFilterNode;
    gain: GainNode;
  } | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private distortionCurve: Float32Array<ArrayBuffer> | null = null;
  private isMuted: boolean = false;

  private init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (this.ctx && !this.noiseBuffer) {
      // Pre-generate 2 seconds of pink-ish noise for tire scrub, gravel, and turbo airbox intake
      const bufferSize = this.ctx.sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = this.noiseBuffer.getChannelData(0);
      let b0 = 0,
        b1 = 0,
        b2 = 0,
        b3 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + white * 0.029;
        b1 = 0.985 * b1 + white * 0.032;
        b2 = 0.95 * b2 + white * 0.048;
        b3 = 0.85 * b3 + white * 0.09;
        output[i] = (b0 + b1 + b2 + b3 + white * 0.08) * 0.35;
      }
    }
    if (!this.distortionCurve) {
      // Warm asymmetric tube/exhaust wave-shaping curve for authentic F1 metallic rasp
      const samples = 1024;
      const curve = new Float32Array(new ArrayBuffer(samples * 4));
      for (let i = 0; i < samples; i++) {
        const x = (i * 2) / samples - 1;
        curve[i] = Math.tanh(x * 2.6) * 0.85 + Math.sin(x * Math.PI * 0.5) * 0.15;
      }
      this.distortionCurve = curve;
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopAll();
    }
    return this.isMuted;
  }

  getMuted() {
    return this.isMuted;
  }

  // Subtle, non-intrusive tactile click for UI buttons (no annoying retro beeps!)
  playBeep(freq: number = 500, duration: number = 0.025, _type: OscillatorType = 'sine') {
    this.init();
    if (this.isMuted || !this.ctx) return;

    // Ignore high-frequency spam calls during drawing
    if (duration <= 0.04) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      const cleanFreq = Math.min(520, Math.max(180, freq * 0.55));
      osc.frequency.setValueAtTime(cleanFreq, now);
      osc.frequency.exponentialRampToValueAtTime(cleanFreq * 0.65, now + 0.028);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, now);

      gain.gain.setValueAtTime(0.035, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.032);
    } catch {
      // ignore audio errors
    }
  }

  // FIA F1 Broadcast Red Light Countdown Tone
  playCountdownTick() {
    this.init();
    if (this.isMuted || !this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const sub = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(380, now);
      sub.type = 'sine';
      sub.frequency.setValueAtTime(190, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, now);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

      osc.connect(filter);
      sub.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      sub.start(now);
      osc.stop(now + 0.12);
      sub.stop(now + 0.12);
    } catch {}
  }

  // FIA Lights Out Full-Throttle Launch Roar
  playCountdownGo() {
    this.init();
    if (this.isMuted || !this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'triangle';
      // Rapid clutch-drop RPM surge sound
      osc1.frequency.setValueAtTime(140, now);
      osc1.frequency.exponentialRampToValueAtTime(310, now + 0.24);
      osc2.frequency.setValueAtTime(280, now);
      osc2.frequency.exponentialRampToValueAtTime(620, now + 0.24);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(520, now);
      filter.Q.setValueAtTime(1.4, now);

      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.27);
      osc2.stop(now + 0.27);
    } catch {}
  }

  // Smooth F1 Dyno / Intake preview while drawing the racing line (no beeps!)
  updateDrawingEngine(speed: number, isOverspeed: boolean) {
    this.init();
    if (this.isMuted || !this.ctx) return;

    const now = this.ctx.currentTime;
    if (!this.drawingPreviewNodes) {
      try {
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc1.type = 'sawtooth';
        osc2.type = 'triangle';
        osc1.frequency.setValueAtTime(95, now);
        osc2.frequency.setValueAtTime(190, now);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(380, now);
        filter.Q.setValueAtTime(1.8, now);

        gain.gain.setValueAtTime(0.001, now);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        osc1.start(now);
        osc2.start(now);

        this.drawingPreviewNodes = { osc1, osc2, filter, gain };
      } catch {
        return;
      }
    }

    const nodes = this.drawingPreviewNodes;
    if (!nodes) return;

    // Map drawing speed (1.5 .. 7.5) to smooth F1 intake RPM pitch (85Hz .. 295Hz)
    const norm = Math.max(0, Math.min(1, (speed - 1.2) / 6.3));
    const baseFreq = 82 + norm * 215;
    nodes.osc1.frequency.setTargetAtTime(baseFreq, now, 0.04);
    nodes.osc2.frequency.setTargetAtTime(baseFreq * (isOverspeed ? 1.48 : 2.0), now, 0.04);
    nodes.filter.frequency.setTargetAtTime(260 + norm * 650, now, 0.04);
    nodes.gain.gain.setTargetAtTime(0.022, now, 0.03);
  }

  stopDrawingEngine() {
    if (!this.drawingPreviewNodes || !this.ctx) return;
    try {
      const nodes = this.drawingPreviewNodes;
      this.drawingPreviewNodes = null;
      nodes.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.03);
      setTimeout(() => {
        try {
          nodes.osc1.stop();
          nodes.osc2.stop();
          nodes.osc1.disconnect();
          nodes.osc2.disconnect();
          nodes.gain.disconnect();
        } catch {}
      }, 60);
    } catch {}
  }

  playCrash() {
    this.init();
    if (this.isMuted || !this.ctx || !this.noiseBuffer) return;

    try {
      const now = this.ctx.currentTime;
      const noiseNode = this.ctx.createBufferSource();
      noiseNode.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(320, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      noiseNode.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noiseNode.start(now);
      noiseNode.stop(now + 0.3);
    } catch {}
  }

  // Multi-Harmonic Formula 1 V10 / V6-Hybrid Engine Synthesizer
  startEngine(carId: string) {
    this.init();
    if (this.isMuted || !this.ctx || !this.noiseBuffer || !this.distortionCurve) return;
    if (this.activeEngines.has(carId)) return;

    try {
      const now = this.ctx.currentTime;

      // 1. Primary cylinder firing frequency (Sawtooth)
      const fundamentalOsc = this.ctx.createOscillator();
      fundamentalOsc.type = 'sawtooth';
      fundamentalOsc.frequency.setValueAtTime(95, now);

      // 2. Second harmonic (Octave - gives the high-RPM F1 scream)
      const octaveOsc = this.ctx.createOscillator();
      octaveOsc.type = 'sawtooth';
      octaveOsc.frequency.setValueAtTime(190, now);

      // 3. V-bank cross-firing harmonic (1.5x fifth interval - creates authentic multi-cylinder growl)
      const fifthOsc = this.ctx.createOscillator();
      fifthOsc.type = 'triangle';
      fifthOsc.frequency.setValueAtTime(142.5, now);

      // 4. Low exhaust thump sub-oscillator (0.5x sub-harmonic)
      const subOsc = this.ctx.createOscillator();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(47.5, now);

      // Balance individual harmonic gains before waveshaper
      const gFund = this.ctx.createGain();
      const gOct = this.ctx.createGain();
      const gFifth = this.ctx.createGain();
      const gSub = this.ctx.createGain();

      gFund.gain.value = 0.45;
      gOct.gain.value = 0.32;
      gFifth.gain.value = 0.25;
      gSub.gain.value = 0.35;

      // Non-linear exhaust waveshaper
      const shaper = this.ctx.createWaveShaper();
      shaper.curve = this.distortionCurve;
      shaper.oversample = '2x';

      // Exhaust manifold resonant formant filter
      const formantFilter = this.ctx.createBiquadFilter();
      formantFilter.type = 'peaking';
      formantFilter.frequency.setValueAtTime(480, now);
      formantFilter.Q.setValueAtTime(2.2, now);
      formantFilter.gain.setValueAtTime(5.5, now);

      // Dynamic throttle lowpass filter (opens wide at full throttle, closes under braking)
      const exhaustFilter = this.ctx.createBiquadFilter();
      exhaustFilter.type = 'lowpass';
      exhaustFilter.frequency.setValueAtTime(520, now);
      exhaustFilter.Q.setValueAtTime(1.4, now);

      // 5. F1 Hybrid MGU-H / Turbocharger Spool Whine Oscillator
      const turboWhineOsc = this.ctx.createOscillator();
      turboWhineOsc.type = 'sine';
      turboWhineOsc.frequency.setValueAtTime(1600, now);

      const turboWhineGain = this.ctx.createGain();
      turboWhineGain.gain.setValueAtTime(0.002, now);

      // 6. Turbocharger / Airbox Intake Noise layer
      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = this.noiseBuffer;
      noiseSource.loop = true;

      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(900, now);
      noiseFilter.Q.setValueAtTime(3.0, now);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.008, now);

      const masterGain = this.ctx.createGain();
      masterGain.gain.setValueAtTime(0.025, now);

      fundamentalOsc.connect(gFund);
      octaveOsc.connect(gOct);
      fifthOsc.connect(gFifth);
      subOsc.connect(gSub);

      gFund.connect(shaper);
      gOct.connect(shaper);
      gFifth.connect(shaper);
      gSub.connect(shaper);

      shaper.connect(formantFilter);
      formantFilter.connect(exhaustFilter);
      exhaustFilter.connect(masterGain);

      turboWhineOsc.connect(turboWhineGain);
      turboWhineGain.connect(masterGain);

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(masterGain);

      masterGain.connect(this.ctx.destination);

      fundamentalOsc.start(now);
      octaveOsc.start(now);
      fifthOsc.start(now);
      subOsc.start(now);
      turboWhineOsc.start(now);
      noiseSource.start(now);

      this.activeEngines.set(carId, {
        fundamentalOsc,
        octaveOsc,
        fifthOsc,
        subOsc,
        turboWhineOsc,
        turboWhineGain,
        noiseSource,
        noiseFilter,
        noiseGain,
        exhaustFilter,
        formantFilter,
        shaper,
        masterGain,
        lastSpeedRatio: 0,
        lastGear: 1,
        shiftCutUntil: 0,
        downshiftBlipUntil: 0
      });
    } catch (e) {
      console.warn('Audio failed to start F1 engine:', e);
    }
  }

  // Brief realistic F1 exhaust overrun crackle pop on heavy braking downshifts
  private playExhaustPop(volume: number) {
    if (this.isMuted || !this.ctx || !this.noiseBuffer) return;
    try {
      const now = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(240 + Math.random() * 140, now);
      bp.Q.setValueAtTime(1.8, now);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.048);

      src.connect(bp);
      bp.connect(gain);
      gain.connect(this.ctx.destination);
      src.start(now, Math.random() * 0.8, 0.055);
    } catch {}
  }

  // Update F1 Engine RPM, 8-Speed Sequential Gearbox shifts, launch growl, MGU-H whine, and braking downshift blips
  updateEngine(
    carId: string,
    speedRatio: number,
    offTrack: boolean,
    isBraking: boolean = false,
    isFocusedCar: boolean = true
  ) {
    if (this.isMuted || !this.ctx) return;

    let engine = this.activeEngines.get(carId);
    if (!engine) {
      this.startEngine(carId);
      engine = this.activeEngines.get(carId);
      if (!engine) return;
    }

    try {
      const now = this.ctx.currentTime;
      const clampedRatio = Math.max(0.04, Math.min(1.85, speedRatio));
      const accelDelta = clampedRatio - engine.lastSpeedRatio;

      // Compute current F1 sequential gear (1 to 8) from speedRatio
      const currentGear = Math.min(8, Math.max(1, Math.ceil(clampedRatio * 4.8)));

      // Detect UPSHIFT (1 -> 2 -> 3 ... -> 8): brief 45ms ignition cut!
      if (currentGear > engine.lastGear && clampedRatio > 0.22) {
        engine.shiftCutUntil = now + 0.045;
      }
      // Detect DOWNSHIFT under braking: throttle auto-blip + crisp exhaust overrun pop!
      else if (currentGear < engine.lastGear && (isBraking || accelDelta < -0.005)) {
        engine.downshiftBlipUntil = now + 0.068;
        if (isFocusedCar) {
          this.playExhaustPop(0.036);
        }
      }

      engine.lastGear = currentGear;
      engine.lastSpeedRatio = clampedRatio;

      // Calculate sawtooth RPM within the current gear + overall velocity pitch
      const gearWidth = 1.65 / 8;
      const gearFloor = (currentGear - 1) * gearWidth;
      const inGearProgress = Math.max(0, Math.min(1, (clampedRatio - gearFloor) / gearWidth));

      // Authentic F1 RPM band: revs climb from 10,200 RPM to 14,800 RPM in each gear
      let rpmNormalized = 0.28 + inGearProgress * 0.52 + (currentGear / 8) * 0.25;

      // Apply downshift throttle auto-blip (rev-matching spike when braking into corners!)
      if (now < engine.downshiftBlipUntil) {
        rpmNormalized = Math.min(1.18, rpmNormalized + 0.24);
      }

      // Launch traction growl off the start line
      const isLaunching = clampedRatio < 0.38 && accelDelta > 0.002;
      if (isLaunching) {
        rpmNormalized = Math.max(rpmNormalized, 0.58 + Math.sin(now * 45) * 0.04);
      }

      // Fundamental firing frequency: 80 Hz (idle) -> 395 Hz (15,000 RPM F1 scream)
      const f0 = 80 + rpmNormalized * 278;

      engine.fundamentalOsc.frequency.setTargetAtTime(f0, now, 0.025);
      engine.octaveOsc.frequency.setTargetAtTime(f0 * 2.0, now, 0.025);
      engine.fifthOsc.frequency.setTargetAtTime(f0 * 1.498, now, 0.025);
      engine.subOsc.frequency.setTargetAtTime(f0 * 0.5, now, 0.025);

      // Subtle Hybrid MGU-H / Turbocharger whine tracks boost pressure
      const turboFreq = 1350 + rpmNormalized * 2100;
      engine.turboWhineOsc.frequency.setTargetAtTime(turboFreq, now, 0.04);
      engine.turboWhineGain.gain.setTargetAtTime(
        isBraking ? 0.012 : 0.018 + clampedRatio * 0.014,
        now,
        0.04
      );

      // Exhaust formant & lowpass filter open up under acceleration and close under braking/off-track
      const isShiftCut = now < engine.shiftCutUntil;
      const throttleOpen = isBraking ? 0.45 : offTrack ? 0.55 : 1.0;
      const targetCutoff = isShiftCut
        ? 220
        : (380 + rpmNormalized * 1720) * throttleOpen;

      engine.exhaustFilter.frequency.setTargetAtTime(targetCutoff, now, 0.02);
      engine.formantFilter.frequency.setTargetAtTime(340 + rpmNormalized * 520, now, 0.03);

      // Turbocharger / intake rush & gravelly stone rattle when off-track
      if (offTrack) {
        engine.noiseFilter.type = 'bandpass';
        engine.noiseFilter.frequency.setTargetAtTime(380 + Math.sin(now * 58) * 90, now, 0.025);
        engine.noiseFilter.Q.setTargetAtTime(0.95, now, 0.03);
        engine.noiseGain.gain.setTargetAtTime(0.055, now, 0.03);
      } else {
        engine.noiseFilter.type = 'bandpass';
        engine.noiseFilter.frequency.setTargetAtTime(800 + rpmNormalized * 1450, now, 0.03);
        engine.noiseFilter.Q.setTargetAtTime(3.2, now, 0.03);
        engine.noiseGain.gain.setTargetAtTime(isBraking ? 0.016 : 0.009, now, 0.03);
      }

      // Master volume: focused car is prominent, background AI cars are subtle, ignition cut dips briefly on upshift
      const baseVol = isFocusedCar ? 0.052 : 0.017;
      const targetVol = isShiftCut
        ? baseVol * 0.24
        : offTrack
          ? baseVol * 0.75
          : isBraking
            ? baseVol * 0.88
            : baseVol;

      engine.masterGain.gain.setTargetAtTime(targetVol, now, 0.018);
    } catch {
      // ignore frame audio errors
    }
  }

  stopEngine(carId: string) {
    const engine = this.activeEngines.get(carId);
    if (engine) {
      try {
        engine.fundamentalOsc.stop();
        engine.octaveOsc.stop();
        engine.fifthOsc.stop();
        engine.subOsc.stop();
        engine.turboWhineOsc.stop();
        engine.noiseSource.stop();
        engine.masterGain.disconnect();
      } catch {}
      this.activeEngines.delete(carId);
    }
  }

  // Realistic Tire Rubber Scrub & Asphalt Lateral Friction Sound (Filtered Noise, NOT a high-pitched sine whistle!)
  startScreech(carId: string) {
    this.init();
    if (this.isMuted || !this.ctx || !this.noiseBuffer) return;
    if (this.activeScreeches.has(carId)) return;

    try {
      const now = this.ctx.currentTime;
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      noise.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(620, now);
      filter.Q.setValueAtTime(2.4, now);

      const tonalOsc = this.ctx.createOscillator();
      tonalOsc.type = 'sine';
      tonalOsc.frequency.setValueAtTime(420, now);

      const tonalGain = this.ctx.createGain();
      tonalGain.gain.setValueAtTime(0.15, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);

      noise.connect(filter);
      tonalOsc.connect(tonalGain);
      tonalGain.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noise.start(now);
      tonalOsc.start(now);

      this.activeScreeches.set(carId, { noise, filter, tonalOsc, gain });
    } catch {}
  }

  updateScreech(carId: string, intensity: number) {
    if (this.isMuted || !this.ctx) return;

    let screech = this.activeScreeches.get(carId);
    if (!screech && intensity > 0.12) {
      this.startScreech(carId);
      screech = this.activeScreeches.get(carId);
    }
    if (!screech) return;

    try {
      const now = this.ctx.currentTime;
      if (intensity <= 0.08) {
        screech.gain.gain.setTargetAtTime(0.0001, now, 0.06);
      } else {
        const clamped = Math.min(1, intensity);
        screech.filter.frequency.setTargetAtTime(520 + clamped * 280, now, 0.04);
        screech.tonalOsc.frequency.setTargetAtTime(360 + clamped * 140, now, 0.04);
        screech.gain.gain.setTargetAtTime(clamped * 0.028, now, 0.04);
      }
    } catch {}
  }

  stopScreech(carId: string) {
    const screech = this.activeScreeches.get(carId);
    if (screech) {
      try {
        screech.noise.stop();
        screech.tonalOsc.stop();
        screech.gain.disconnect();
      } catch {}
      this.activeScreeches.delete(carId);
    }
  }

  // Clean Broadcast Podium Chord
  playVictoryJingle() {
    this.init();
    if (this.isMuted || !this.ctx) return;

    try {
      const notes = [261.63, 329.63, 392.0, 523.25];
      notes.forEach((freq, idx) => {
        const start = this.ctx!.currentTime + idx * 0.09;
        const osc = this.ctx!.createOscillator();
        const filter = this.ctx!.createBiquadFilter();
        const gain = this.ctx!.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, start);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(950, start);

        gain.gain.setValueAtTime(0.06, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.45);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(start);
        osc.stop(start + 0.46);
      });
    } catch {}
  }

  suspendForBackground() {
    if (this.ctx && this.ctx.state === 'running') {
      void this.ctx.suspend().catch(() => {});
    }
  }

  resumeFromBackground() {
    if (!this.isMuted && this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
  }

  stopAll() {
    this.stopDrawingEngine();
    Array.from(this.activeEngines.keys()).forEach((id) => this.stopEngine(id));
    Array.from(this.activeScreeches.keys()).forEach((id) => this.stopScreech(id));
  }
}

export const audio = new AudioEngine();
