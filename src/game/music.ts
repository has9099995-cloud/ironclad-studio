import { tacticalAudio } from './audio';
import {
  BASS_PATTERN,
  computeMusicMixParameters,
  computeSchedulerSteps,
  createSoftClipCurve,
  HAT_BAR_CLIMAX,
  HAT_BAR_GROOVE,
  KICK_BAR_A,
  KICK_BAR_FILL,
  LEAD_PATTERN,
  midiToFreq,
  PAD_CHORDS,
  SNARE_BAR_A,
  SNARE_BAR_FILL,
  STEP_DURATION_SEC,
  STEPS_PER_BAR,
  type MusicMixParameters,
} from './musicTheory';
import type { MapId, MusicIntensity } from './types';

interface PrebakedDrumBank {
  kick: AudioBuffer;
  snare: AudioBuffer;
  closedHat: AudioBuffer;
  openHat: AudioBuffer;
}

const STORAGE_MUTED_KEY = 'ironclad_music_muted';
const STORAGE_VOL_KEY = 'ironclad_music_volume';

class TacticalMusicEngine {
  private ctx: AudioContext | null = null;
  private initialized = false;
  private bakingDrums = false;
  private drumBank: PrebakedDrumBank | null = null;

  // Shared AudioNodes (allocated once per session — zero per-step filter/shaper allocations)
  private musicMasterGain: GainNode | null = null;
  private duckGain: GainNode | null = null;
  private masterFilter: BiquadFilterNode | null = null;
  private tapeDrive: WaveShaperNode | null = null;
  private drumsBus: GainNode | null = null;
  private hatBus: GainNode | null = null;
  private bassBus: GainNode | null = null;
  private padBus: GainNode | null = null;
  private leadBus: GainNode | null = null;

  // Pre-computed custom PeriodicWave tables
  private bassWave: PeriodicWave | null = null;
  private padWave: PeriodicWave | null = null;
  private leadWave: PeriodicWave | null = null;

  // Scheduler & State
  private timerId = 0;
  private nextNoteTimeSec = 0;
  private currentStepIndex = 0;
  private intensity: MusicIntensity = 'briefing';
  private mapId: MapId = 'ironclad';
  private mix: MusicMixParameters = computeMusicMixParameters('briefing', 'ironclad');
  private musicMuted = false;
  private musicVolume = 0.55;
  private isHidden = false;

  constructor() {
    try {
      const savedMute = localStorage.getItem(STORAGE_MUTED_KEY);
      if (savedMute === '1') this.musicMuted = true;
      const savedVol = localStorage.getItem(STORAGE_VOL_KEY);
      if (savedVol !== null) {
        const parsed = parseFloat(savedVol);
        if (Number.isFinite(parsed)) {
          this.musicVolume = Math.max(0, Math.min(1, parsed));
        }
      }
    } catch {
      // Ignore storage access errors in restricted contexts
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this.isHidden = document.hidden;
        if (this.isHidden) {
          this.stopScheduler();
        } else if (this.initialized && !this.musicMuted && !tacticalAudio.isMuted()) {
          this.startScheduler();
        }
      });
    }
  }

  public isMuted(): boolean {
    return this.musicMuted;
  }

  public getVolume(): number {
    return this.musicVolume;
  }

  public setMuted(muted: boolean) {
    this.musicMuted = muted;
    try {
      localStorage.setItem(STORAGE_MUTED_KEY, muted ? '1' : '0');
    } catch {
      // ignore
    }
    this.syncMasterGain();
    if (muted) {
      this.stopScheduler();
    } else if (this.initialized && !tacticalAudio.isMuted() && !this.isHidden) {
      this.startScheduler();
    }
  }

  public toggleMuted(): boolean {
    this.setMuted(!this.musicMuted);
    return this.musicMuted;
  }

  public setVolume(vol: number) {
    this.musicVolume = Math.max(0, Math.min(1, vol));
    try {
      localStorage.setItem(STORAGE_VOL_KEY, this.musicVolume.toFixed(2));
    } catch {
      // ignore
    }
    this.syncMasterGain();
  }

  public syncMasterMute(allAudioMuted: boolean) {
    this.syncMasterGain(allAudioMuted);
    if (allAudioMuted || this.musicMuted) {
      this.stopScheduler();
    } else if (this.initialized && !this.isHidden) {
      this.startScheduler();
    }
  }

  public setState(intensity: MusicIntensity, mapId: MapId) {
    if (this.intensity === intensity && this.mapId === mapId) return;
    this.intensity = intensity;
    this.mapId = mapId;
    this.mix = computeMusicMixParameters(intensity, mapId);
    this.applyMixEnvelope();
  }

  public unlockAndStart() {
    tacticalAudio.unlock();
    const shared = tacticalAudio.getSharedNodes();
    if (!shared) return;

    if (!this.initialized) {
      this.initGraph(shared.ctx, shared.compressor);
    }

    if (!this.musicMuted && !tacticalAudio.isMuted() && !this.isHidden) {
      this.startScheduler();
    }
  }

  private initGraph(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    const now = ctx.currentTime;

    this.musicMasterGain = ctx.createGain();
    const effective = this.musicMuted || tacticalAudio.isMuted() ? 0 : this.musicVolume * 0.42;
    this.musicMasterGain.gain.setValueAtTime(effective, now);
    this.musicMasterGain.connect(destination);

    this.duckGain = ctx.createGain();
    this.duckGain.gain.setValueAtTime(1.0, now);
    this.duckGain.connect(this.musicMasterGain);

    this.tapeDrive = ctx.createWaveShaper();
    this.tapeDrive.curve = createSoftClipCurve(1024, 1.45);
    this.tapeDrive.oversample = 'none'; // Low CPU cost, zero extra oversample buffers
    this.tapeDrive.connect(this.duckGain);

    this.masterFilter = ctx.createBiquadFilter();
    this.masterFilter.type = 'lowpass';
    this.masterFilter.frequency.setValueAtTime(this.mix.cutoffHz, now);
    this.masterFilter.Q.setValueAtTime(0.8, now);
    this.masterFilter.connect(this.tapeDrive);

    this.drumsBus = ctx.createGain();
    this.hatBus = ctx.createGain();
    this.bassBus = ctx.createGain();
    this.padBus = ctx.createGain();
    this.leadBus = ctx.createGain();

    this.drumsBus.connect(this.masterFilter);
    this.hatBus.connect(this.masterFilter);
    this.bassBus.connect(this.masterFilter);
    this.padBus.connect(this.masterFilter);
    this.leadBus.connect(this.masterFilter);

    // Pre-compute custom harmonic PeriodicWaves once (saves 3-4 oscillators per voice)
    // 1. Gritty Sub + Saw Bass
    const bassReal = new Float32Array([0, 1.0, 0.72, 0.44, 0.3, 0.2, 0.12, 0.08, 0.04]);
    const bassImag = new Float32Array(bassReal.length);
    this.bassWave = ctx.createPeriodicWave(bassReal, bassImag);

    // 2. Warm Military Brass/String Pad
    const padReal = new Float32Array([0, 0.9, 0.45, 0.55, 0.28, 0.34, 0.18, 0.14, 0.08, 0.05]);
    const padImag = new Float32Array(padReal.length);
    this.padWave = ctx.createPeriodicWave(padReal, padImag);

    // 3. Sharp Metallic Pluck Lead
    const leadReal = new Float32Array([0, 0.85, 0.25, 0.62, 0.15, 0.4, 0.08, 0.22]);
    const leadImag = new Float32Array(leadReal.length);
    this.leadWave = ctx.createPeriodicWave(leadReal, leadImag);

    tacticalAudio.registerDuckListener((depth, dur) => {
      this.duckForImpact(depth, dur);
    });

    this.initialized = true;
    this.applyMixEnvelope();
    void this.prebakeDrumBuffers(ctx.sampleRate);
  }

  /**
   * Pre-renders kick, snare, closed hat, and open hat into compact AudioBuffers via OfflineAudioContext
   * so runtime rhythm playback triggers lightweight single BufferSource nodes with zero filter churn.
   */
  private async prebakeDrumBuffers(sampleRate: number) {
    if (this.drumBank || this.bakingDrums) return;
    if (typeof OfflineAudioContext === 'undefined') return;
    this.bakingDrums = true;

    try {
      const bake = async (durationSec: number, build: (octx: OfflineAudioContext) => void) => {
        const len = Math.max(1, Math.round(sampleRate * durationSec));
        const octx = new OfflineAudioContext(1, len, sampleRate);
        build(octx);
        return octx.startRendering();
      };

      const noiseBufFor = (octx: OfflineAudioContext, durSec: number) => {
        const buf = octx.createBuffer(1, Math.max(1, Math.round(sampleRate * durSec)), sampleRate);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
        return buf;
      };

      const [kick, snare, closedHat, openHat] = await Promise.all([
        // Tight industrial tactical kick
        bake(0.28, (octx) => {
          const osc = octx.createOscillator();
          const g = octx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(145, 0);
          osc.frequency.exponentialRampToValueAtTime(44, 0.065);
          osc.frequency.exponentialRampToValueAtTime(32, 0.25);
          g.gain.setValueAtTime(0.95, 0);
          g.gain.exponentialRampToValueAtTime(0.001, 0.26);
          osc.connect(g).connect(octx.destination);
          osc.start(0);
          osc.stop(0.27);

          const click = octx.createOscillator();
          const cg = octx.createGain();
          click.type = 'triangle';
          click.frequency.setValueAtTime(1800, 0);
          click.frequency.exponentialRampToValueAtTime(180, 0.015);
          cg.gain.setValueAtTime(0.35, 0);
          cg.gain.exponentialRampToValueAtTime(0.001, 0.018);
          click.connect(cg).connect(octx.destination);
          click.start(0);
          click.stop(0.02);
        }),
        // Crisp tactical snare crack + body
        bake(0.24, (octx) => {
          const body = octx.createOscillator();
          const bg = octx.createGain();
          body.type = 'triangle';
          body.frequency.setValueAtTime(210, 0);
          body.frequency.exponentialRampToValueAtTime(95, 0.08);
          bg.gain.setValueAtTime(0.55, 0);
          bg.gain.exponentialRampToValueAtTime(0.001, 0.11);
          body.connect(bg).connect(octx.destination);
          body.start(0);
          body.stop(0.12);

          const noise = octx.createBufferSource();
          noise.buffer = noiseBufFor(octx, 0.24);
          const hp = octx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.setValueAtTime(1100, 0);
          const ng = octx.createGain();
          ng.gain.setValueAtTime(0.62, 0);
          ng.gain.exponentialRampToValueAtTime(0.001, 0.21);
          noise.connect(hp).connect(ng).connect(octx.destination);
          noise.start(0);
          noise.stop(0.23);
        }),
        // Tight metallic closed hat
        bake(0.065, (octx) => {
          const noise = octx.createBufferSource();
          noise.buffer = noiseBufFor(octx, 0.065);
          const hp = octx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.setValueAtTime(6400, 0);
          const g = octx.createGain();
          g.gain.setValueAtTime(0.45, 0);
          g.gain.exponentialRampToValueAtTime(0.001, 0.055);
          noise.connect(hp).connect(g).connect(octx.destination);
          noise.start(0);
          noise.stop(0.06);
        }),
        // Crisp open shaker/hat accent
        bake(0.16, (octx) => {
          const noise = octx.createBufferSource();
          noise.buffer = noiseBufFor(octx, 0.16);
          const hp = octx.createBiquadFilter();
          hp.type = 'bandpass';
          hp.frequency.setValueAtTime(7800, 0);
          hp.Q.setValueAtTime(1.1, 0);
          const g = octx.createGain();
          g.gain.setValueAtTime(0.42, 0);
          g.gain.exponentialRampToValueAtTime(0.001, 0.15);
          noise.connect(hp).connect(g).connect(octx.destination);
          noise.start(0);
          noise.stop(0.155);
        }),
      ]);

      this.drumBank = { kick, snare, closedHat, openHat };
    } catch {
      // Fallback safely if offline rendering fails
    } finally {
      this.bakingDrums = false;
    }
  }

  private syncMasterGain(allAudioMuted = tacticalAudio.isMuted()) {
    if (!this.ctx || !this.musicMasterGain) return;
    const effective = allAudioMuted || this.musicMuted ? 0 : this.musicVolume * 0.42;
    this.musicMasterGain.gain.setTargetAtTime(effective, this.ctx.currentTime, 0.06);
  }

  private applyMixEnvelope() {
    if (!this.ctx || !this.masterFilter) return;
    const now = this.ctx.currentTime;
    this.masterFilter.frequency.setTargetAtTime(this.mix.cutoffHz, now, 0.18);
    this.drumsBus?.gain.setTargetAtTime(this.mix.drumsLevel, now, 0.15);
    this.hatBus?.gain.setTargetAtTime(this.mix.hatLevel, now, 0.15);
    this.bassBus?.gain.setTargetAtTime(this.mix.bassLevel, now, 0.15);
    this.padBus?.gain.setTargetAtTime(this.mix.padLevel, now, 0.25);
    this.leadBus?.gain.setTargetAtTime(this.mix.leadLevel, now, 0.18);
  }

  public duckForImpact(depth = 0.72, durationSec = 0.16) {
    if (!this.ctx || !this.duckGain || this.musicMuted || tacticalAudio.isMuted()) return;
    const now = this.ctx.currentTime;
    this.duckGain.gain.cancelScheduledValues(now);
    this.duckGain.gain.setTargetAtTime(Math.max(0.25, Math.min(1, depth)), now, 0.012);
    this.duckGain.gain.setTargetAtTime(1.0, now + 0.03, durationSec);
  }

  private startScheduler() {
    if (!this.ctx || this.timerId !== 0) return;
    this.nextNoteTimeSec = this.ctx.currentTime + 0.04;
    this.timerId = window.setInterval(() => this.tickScheduler(), 30);
  }

  private stopScheduler() {
    if (this.timerId !== 0) {
      clearInterval(this.timerId);
      this.timerId = 0;
    }
  }

  private tickScheduler() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (this.musicMuted || tacticalAudio.isMuted() || this.isHidden) {
      this.stopScheduler();
      return;
    }

    const { events, nextNoteTimeSec, nextStepIndex } = computeSchedulerSteps(
      this.ctx.currentTime,
      this.nextNoteTimeSec,
      this.currentStepIndex,
      0.12,
      STEP_DURATION_SEC,
    );
    this.nextNoteTimeSec = nextNoteTimeSec;
    this.currentStepIndex = nextStepIndex;

    for (let i = 0; i < events.length; i++) {
      this.scheduleStep(events[i].stepIndex, events[i].timeSec);
    }
  }

  private scheduleStep(stepIndex: number, timeSec: number) {
    if (!this.ctx) return;

    const barIndex = Math.floor(stepIndex / STEPS_PER_BAR);
    const barStep = stepIndex % STEPS_PER_BAR;
    const isFillBar = barIndex === 3;
    const transpose = this.mix.transposeSemitones;

    // 1. Pre-baked Drums (Zero filter/oscillator churn)
    if (this.drumBank) {
      const kickHit = (isFillBar ? KICK_BAR_FILL : KICK_BAR_A)[barStep];
      if (kickHit > 0 && this.mix.drumsLevel > 0.02 && this.drumsBus) {
        this.triggerBuffer(this.drumBank.kick, this.drumsBus, timeSec, kickHit === 2 ? 0.95 : 0.72);
      }

      const snareHit = (isFillBar ? SNARE_BAR_FILL : SNARE_BAR_A)[barStep];
      if (snareHit > 0 && this.mix.drumsLevel > 0.02 && this.drumsBus) {
        this.triggerBuffer(this.drumBank.snare, this.drumsBus, timeSec, snareHit === 2 ? 0.72 : 0.44);
      }

      const hatPattern = this.intensity === 'climax' ? HAT_BAR_CLIMAX : HAT_BAR_GROOVE;
      const hatHit = hatPattern[barStep];
      if (hatHit > 0 && this.mix.hatLevel > 0.02 && this.hatBus) {
        const buf = hatHit === 2 ? this.drumBank.openHat : this.drumBank.closedHat;
        this.triggerBuffer(buf, this.hatBus, timeSec, hatHit === 2 ? 0.42 : 0.28);
      }
    }

    // 2. Driving Bass Ostinato (PeriodicWave + cheap envelope)
    const bassMidi = BASS_PATTERN[stepIndex];
    if (bassMidi > 0 && this.mix.bassLevel > 0.02 && this.bassBus && this.bassWave) {
      const freq = midiToFreq(bassMidi + transpose);
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.setPeriodicWave(this.bassWave);
      osc.frequency.setValueAtTime(freq, timeSec);
      const dur = STEP_DURATION_SEC * 0.9;
      g.gain.setValueAtTime(0.001, timeSec);
      g.gain.linearRampToValueAtTime(0.32, timeSec + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, timeSec + dur);
      osc.connect(g).connect(this.bassBus);
      osc.start(timeSec);
      osc.stop(timeSec + dur + 0.015);
    }

    // 3. Tactical Minor Brass/String Pad (triggers once per bar at step 0)
    if (barStep === 0 && this.mix.padLevel > 0.02 && this.padBus && this.padWave) {
      const chord = PAD_CHORDS[barIndex];
      const padDur = STEP_DURATION_SEC * STEPS_PER_BAR * 0.96;
      for (let c = 0; c < chord.length; c++) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.setPeriodicWave(this.padWave);
        osc.frequency.setValueAtTime(midiToFreq(chord[c] + transpose), timeSec);
        g.gain.setValueAtTime(0.001, timeSec);
        g.gain.linearRampToValueAtTime(0.085, timeSec + 0.22);
        g.gain.setValueAtTime(0.085, timeSec + padDur * 0.65);
        g.gain.exponentialRampToValueAtTime(0.001, timeSec + padDur);
        osc.connect(g).connect(this.padBus);
        osc.start(timeSec);
        osc.stop(timeSec + padDur + 0.02);
      }
    }

    // 4. Metallic Tactical Lead Arpeggio
    const leadMidi = LEAD_PATTERN[stepIndex];
    if (leadMidi > 0 && this.mix.leadLevel > 0.02 && this.leadBus && this.leadWave) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.setPeriodicWave(this.leadWave);
      osc.frequency.setValueAtTime(midiToFreq(leadMidi + transpose), timeSec);
      const dur = STEP_DURATION_SEC * 1.45;
      g.gain.setValueAtTime(0.001, timeSec);
      g.gain.linearRampToValueAtTime(0.14, timeSec + 0.006);
      g.gain.exponentialRampToValueAtTime(0.001, timeSec + dur);
      osc.connect(g).connect(this.leadBus);
      osc.start(timeSec);
      osc.stop(timeSec + dur + 0.02);
    }
  }

  private triggerBuffer(buf: AudioBuffer, bus: AudioNode, timeSec: number, gainVal: number) {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gainVal, timeSec);
    src.connect(g).connect(bus);
    src.start(timeSec);
  }

  public dispose() {
    this.stopScheduler();
    tacticalAudio.registerDuckListener(null);
  }
}

export const tacticalMusic = new TacticalMusicEngine();
