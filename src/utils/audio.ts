// Web Audio API Synthesizer for retro Draw Race sounds

class AudioEngine {
  private ctx: AudioContext | null = null;
  private activeEngines: Map<string, { osc: OscillatorNode; gain: GainNode }> = new Map();
  private activeScreeches: Map<string, { osc: OscillatorNode; gain: GainNode }> = new Map();
  private isMuted: boolean = false;

  constructor() {
    // Initialized lazily on first user interaction
  }

  private init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
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

  // Play a simple retro beep
  playBeep(freq: number, duration: number, type: OscillatorType = 'sine') {
    this.init();
    if (this.isMuted || !this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn('Audio failed to play beep:', e);
    }
  }

  // Count down tick sound
  playCountdownTick() {
    this.playBeep(440, 0.1, 'triangle');
  }

  // Count down final GO sound
  playCountdownGo() {
    this.playBeep(880, 0.3, 'sine');
  }

  // Play a crash sound (synthesized white noise)
  playCrash() {
    this.init();
    if (this.isMuted || !this.ctx) return;

    try {
      const bufferSize = this.ctx.sampleRate * 0.4; // 0.4 seconds
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);

      // Fill buffer with noise
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noiseNode = this.ctx.createBufferSource();
      noiseNode.buffer = buffer;

      // Bandpass filter to make it sound muffled/crunchy
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(300, this.ctx.currentTime);
      filter.Q.setValueAtTime(1, this.ctx.currentTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.35);

      noiseNode.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noiseNode.start();
    } catch (e) {
      console.warn('Audio failed to play crash:', e);
    }
  }

  // Dynamic continuous engine hum
  startEngine(carId: string) {
    this.init();
    if (this.isMuted || !this.ctx) return;

    if (this.activeEngines.has(carId)) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      // Sawtooth gives a nice buzzing engine sound
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(50, this.ctx.currentTime); // Low idle frequency

      // Lowpass filter to make it less harsh
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(250, this.ctx.currentTime);

      gain.gain.setValueAtTime(0.02, this.ctx.currentTime); // Soft volume

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();

      this.activeEngines.set(carId, { osc, gain });
    } catch (e) {
      console.warn('Audio failed to start engine:', e);
    }
  }

  // Update engine pitch/volume based on physical speed
  updateEngine(carId: string, speedRatio: number, offTrack: boolean) {
    if (this.isMuted || !this.ctx) return;

    const engine = this.activeEngines.get(carId);
    if (!engine) {
      // Lazy start
      this.startEngine(carId);
      return;
    }

    try {
      // Map speed ratio (0 to 1+) to frequency (e.g., 60Hz to 240Hz)
      const targetFreq = 50 + Math.min(speedRatio, 1.5) * 150;
      engine.osc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);

      // Engine sounds muffled on grass (offTrack)
      const targetGain = offTrack ? 0.015 : 0.035;
      engine.gain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.1);
    } catch (e) {
      // Ignore audio errors during frame updates
    }
  }

  stopEngine(carId: string) {
    const engine = this.activeEngines.get(carId);
    if (engine) {
      try {
        engine.osc.stop();
        engine.osc.disconnect();
        engine.gain.disconnect();
      } catch (e) {}
      this.activeEngines.delete(carId);
    }
  }

  // Dynamic continuous tire screeching sound
  startScreech(carId: string) {
    this.init();
    if (this.isMuted || !this.ctx) return;

    if (this.activeScreeches.has(carId)) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      // Screeching sound is a high-pitched triangle/sine with some frequency modulation
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, this.ctx.currentTime);

      gain.gain.setValueAtTime(0.005, this.ctx.currentTime); // Start very quiet

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();

      this.activeScreeches.set(carId, { osc, gain });
    } catch (e) {
      console.warn('Audio failed to start screech:', e);
    }
  }

  updateScreech(carId: string, intensity: number) {
    if (this.isMuted || !this.ctx) return;

    let screech = this.activeScreeches.get(carId);
    if (!screech && intensity > 0.1) {
      this.startScreech(carId);
      screech = this.activeScreeches.get(carId);
    }

    if (!screech) return;

    try {
      if (intensity <= 0.05) {
        screech.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      } else {
        // High frequency variation to sound like friction
        const freq = 750 + Math.random() * 80 + intensity * 100;
        screech.osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        
        // Volume maps to drift intensity
        const targetGain = Math.min(intensity * 0.04, 0.035);
        screech.gain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.05);
      }
    } catch (e) {}
  }

  stopScreech(carId: string) {
    const screech = this.activeScreeches.get(carId);
    if (screech) {
      try {
        screech.osc.stop();
        screech.osc.disconnect();
        screech.gain.disconnect();
      } catch (e) {}
      this.activeScreeches.delete(carId);
    }
  }

  // Play nice retro victory jingle
  playVictoryJingle() {
    this.init();
    if (this.isMuted || !this.ctx) return;

    try {
      const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // C major arpeggio
      const tempo = 0.12; // time between notes

      notes.forEach((freq, index) => {
        const playTime = this.ctx!.currentTime + index * tempo;
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, playTime);

        gain.gain.setValueAtTime(0.12, playTime);
        gain.gain.exponentialRampToValueAtTime(0.01, playTime + 0.3);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(playTime);
        osc.stop(playTime + 0.3);
      });
    } catch (e) {
      console.warn('Audio failed to play victory jingle:', e);
    }
  }

  stopAll() {
    Array.from(this.activeEngines.keys()).forEach(id => this.stopEngine(id));
    Array.from(this.activeScreeches.keys()).forEach(id => this.stopScreech(id));
  }
}

export const audio = new AudioEngine();
