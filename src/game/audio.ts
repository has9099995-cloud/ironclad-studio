import type { WeaponId } from './types';

class TacticalAudioEngine {
  private ctx: AudioContext | null = null;
  private masterCompressor: DynamicsCompressorNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private unlocked = false;
  private duckListener: ((depth: number, durationSec: number) => void) | null = null;

  public registerDuckListener(cb: ((depth: number, durationSec: number) => void) | null) {
    this.duckListener = cb;
  }

  public setMuted(m: boolean) {
    this.muted = m;
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.02);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public isUnlocked(): boolean {
    return this.unlocked;
  }

  /**
   * Initializes and returns shared AudioContext + master limiter bus so SFX & Music
   * share a single hardware audio thread without clipping.
   */
  public getSharedNodes(): {
    ctx: AudioContext;
    compressor: DynamicsCompressorNode;
    noiseBuffer: AudioBuffer;
  } | null {
    if (!this.unlocked) return null;
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx({ latencyHint: 'interactive' });

      this.masterCompressor = this.ctx.createDynamicsCompressor();
      this.masterCompressor.threshold.setValueAtTime(-10, this.ctx.currentTime);
      this.masterCompressor.knee.setValueAtTime(12, this.ctx.currentTime);
      this.masterCompressor.ratio.setValueAtTime(6, this.ctx.currentTime);
      this.masterCompressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.masterCompressor.release.setValueAtTime(0.18, this.ctx.currentTime);
      this.masterCompressor.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime);
      this.sfxGain.connect(this.masterCompressor);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }

    if (!this.noiseBuffer && this.ctx) {
      const sr = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, Math.round(sr * 1.5), sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buf;
    }

    if (!this.ctx || !this.masterCompressor || !this.noiseBuffer) return null;
    return {
      ctx: this.ctx,
      compressor: this.masterCompressor,
      noiseBuffer: this.noiseBuffer,
    };
  }

  private ensureSfxContext(): { ctx: AudioContext; out: AudioNode; noiseBuffer: AudioBuffer } | null {
    if (this.muted || !this.unlocked) return null;
    const shared = this.getSharedNodes();
    if (!shared || !this.sfxGain) return null;
    return { ctx: shared.ctx, out: this.sfxGain, noiseBuffer: shared.noiseBuffer };
  }

  public unlock() {
    this.unlocked = true;
    this.getSharedNodes();
  }

  public playGunshot(weapon: WeaponId) {
    const sfx = this.ensureSfxContext();
    if (!sfx) return;
    const { ctx, out, noiseBuffer } = sfx;

    this.duckListener?.(weapon === 'rifle' ? 0.78 : 0.68, weapon === 'sniper' ? 0.24 : 0.14);

    const now = ctx.currentTime;
    const pitchJitter = 0.94 + Math.random() * 0.12;

    // 1. Sub-bass punch thump
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = weapon === 'sniper' ? 'sawtooth' : 'triangle';

    const startFreq = weapon === 'shotgun' ? 140 : weapon === 'sniper' ? 185 : 165;
    const endFreq = weapon === 'shotgun' ? 32 : weapon === 'sniper' ? 28 : 42;
    const punchDur = weapon === 'shotgun' ? 0.18 : weapon === 'sniper' ? 0.24 : 0.1;

    osc.frequency.setValueAtTime(startFreq * pitchJitter, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + punchDur);

    oscGain.gain.setValueAtTime(weapon === 'rifle' ? 0.36 : 0.52, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + punchDur);

    osc.connect(oscGain).connect(out);
    osc.start(now);
    osc.stop(now + punchDur + 0.02);

    // 2. High-pressure ballistic crack (filtered white noise)
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(
      (weapon === 'sniper' ? 1900 : weapon === 'shotgun' ? 1100 : 1600) * pitchJitter,
      now,
    );
    filter.frequency.exponentialRampToValueAtTime(280, now + (weapon === 'sniper' ? 0.38 : 0.16));
    filter.Q.value = weapon === 'sniper' ? 0.9 : 0.65;

    const noiseGain = ctx.createGain();
    const tailDur = weapon === 'sniper' ? 0.42 : weapon === 'shotgun' ? 0.28 : 0.15;
    noiseGain.gain.setValueAtTime(weapon === 'rifle' ? 0.42 : 0.62, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + tailDur);

    noise.connect(filter).connect(noiseGain).connect(out);
    noise.start(now);
    noise.stop(now + tailDur + 0.03);

    // 3. Mechanical bolt snap
    const bolt = ctx.createOscillator();
    const boltGain = ctx.createGain();
    bolt.type = 'square';
    bolt.frequency.setValueAtTime(2400 * pitchJitter, now + 0.015);
    bolt.frequency.exponentialRampToValueAtTime(750, now + 0.055);
    boltGain.gain.setValueAtTime(0.07, now + 0.015);
    boltGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    bolt.connect(boltGain).connect(out);
    bolt.start(now + 0.015);
    bolt.stop(now + 0.065);
  }

  public playDryFire() {
    const sfx = this.ensureSfxContext();
    if (!sfx) return;
    const { ctx, out } = sfx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.025);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    osc.connect(gain).connect(out);
    osc.start(now);
    osc.stop(now + 0.035);
  }

  public playReload(stage: 'start' | 'complete') {
    const sfx = this.ensureSfxContext();
    if (!sfx) return;
    const { ctx, out } = sfx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    if (stage === 'start') {
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.09);
    } else {
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(860, now + 0.05);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.12);
    }
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain).connect(out);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  public playHitmarker(headshot: boolean) {
    const sfx = this.ensureSfxContext();
    if (!sfx) return;
    const { ctx, out } = sfx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = headshot ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(headshot ? 2150 : 1380, now);
    osc.frequency.exponentialRampToValueAtTime(headshot ? 3100 : 880, now + 0.045);
    gain.gain.setValueAtTime(headshot ? 0.22 : 0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    osc.connect(gain).connect(out);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  public playEnemyShot(distance: number) {
    const sfx = this.ensureSfxContext();
    if (!sfx) return;
    const { ctx, out, noiseBuffer } = sfx;
    const atten = Math.max(0.05, Math.min(0.45, 9 / Math.max(4, distance)));
    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(320, now + 0.12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(atten, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    noise.connect(filter).connect(gain).connect(out);
    noise.start(now);
    noise.stop(now + 0.15);
  }

  public playSniperTelegraph() {
    const sfx = this.ensureSfxContext();
    if (!sfx) return;
    const { ctx, out } = sfx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(700, now);
    osc.frequency.exponentialRampToValueAtTime(1550, now + 0.35);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    osc.connect(gain).connect(out);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  public playExplosion() {
    const sfx = this.ensureSfxContext();
    if (!sfx) return;
    const { ctx, out, noiseBuffer } = sfx;
    this.duckListener?.(0.45, 0.45);
    const now = ctx.currentTime;

    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(110, now);
    sub.frequency.exponentialRampToValueAtTime(22, now + 0.55);
    subGain.gain.setValueAtTime(0.75, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    sub.connect(subGain).connect(out);
    sub.start(now);
    sub.stop(now + 0.62);

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(950, now);
    lp.frequency.exponentialRampToValueAtTime(110, now + 0.85);
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.68, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    noise.connect(lp).connect(nGain).connect(out);
    noise.start(now);
    noise.stop(now + 0.92);
  }

  public playFootstep() {
    const sfx = this.ensureSfxContext();
    if (!sfx) return;
    const { ctx, out, noiseBuffer } = sfx;
    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 340 + Math.random() * 120;
    bp.Q.value = 1.5;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.075, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    noise.connect(bp).connect(gain).connect(out);
    noise.start(now);
    noise.stop(now + 0.07);
  }

  public playPlayerHurt() {
    const sfx = this.ensureSfxContext();
    if (!sfx) return;
    const { ctx, out } = sfx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain).connect(out);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  public playKnifeSlash(heavy = false) {
    const sfx = this.ensureSfxContext();
    if (!sfx) return;
    const { ctx, out, noiseBuffer } = sfx;
    const now = ctx.currentTime;

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(heavy ? 1800 : 2200, now);
    bp.frequency.exponentialRampToValueAtTime(heavy ? 320 : 480, now + (heavy ? 0.16 : 0.11));
    bp.Q.value = 1.4;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(heavy ? 0.34 : 0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.17 : 0.12));
    noise.connect(bp).connect(gain).connect(out);
    noise.start(now);
    noise.stop(now + 0.19);

    const ring = ctx.createOscillator();
    const ringGain = ctx.createGain();
    ring.type = 'sine';
    ring.frequency.setValueAtTime(heavy ? 3200 : 3800, now);
    ring.frequency.exponentialRampToValueAtTime(2400, now + 0.08);
    ringGain.gain.setValueAtTime(0.045, now);
    ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    ring.connect(ringGain).connect(out);
    ring.start(now);
    ring.stop(now + 0.1);
  }

  public playKnifeHit(lethal = false) {
    const sfx = this.ensureSfxContext();
    if (!sfx) return;
    const { ctx, out, noiseBuffer } = sfx;
    const now = ctx.currentTime;

    const thud = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(lethal ? 190 : 160, now);
    thud.frequency.exponentialRampToValueAtTime(38, now + 0.14);
    thudGain.gain.setValueAtTime(lethal ? 0.45 : 0.32, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    thud.connect(thudGain).connect(out);
    thud.start(now);
    thud.stop(now + 0.17);

    const slice = ctx.createBufferSource();
    slice.buffer = noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(1400, now);
    const sGain = ctx.createGain();
    sGain.gain.setValueAtTime(0.26, now);
    sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    slice.connect(hp).connect(sGain).connect(out);
    slice.start(now);
    slice.stop(now + 0.09);
  }

  public playWaveCue(victory = false) {
    const sfx = this.ensureSfxContext();
    if (!sfx) return;
    const { ctx, out } = sfx;
    const now = ctx.currentTime;
    const freqs = victory ? [330, 440, 554, 659] : [220, 293, 392];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + i * 0.09);
      gain.gain.setValueAtTime(0.14, now + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.35);
      osc.connect(gain).connect(out);
      osc.start(now + i * 0.09);
      osc.stop(now + i * 0.09 + 0.37);
    });
  }
}

export const tacticalAudio = new TacticalAudioEngine();
