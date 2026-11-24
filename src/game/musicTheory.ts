import type { GamePhase, MapId, MusicIntensity } from './types';

export const TRACK_BPM = 126;
export const STEPS_PER_BAR = 16;
export const TOTAL_BARS = 4;
export const TOTAL_STEPS = STEPS_PER_BAR * TOTAL_BARS; // 64-step evolving 4-bar loop (~7.62s)
export const STEP_DURATION_SEC = 60 / TRACK_BPM / 4; // 16th-note step duration

// Pre-computed MIDI-to-Frequency Lookup Table (MIDI 0..127) for zero runtime Math.pow overhead
export const MIDI_FREQ_LUT = new Float32Array(128);
for (let m = 0; m < 128; m++) {
  MIDI_FREQ_LUT[m] = 440 * Math.pow(2, (m - 69) / 12);
}

export function midiToFreq(midi: number): number {
  const idx = Math.max(0, Math.min(127, Math.round(midi)));
  return MIDI_FREQ_LUT[idx];
}

// Track: "IRONCLAD PROTOCOL" — Key of D Minor / D Phrygian Tactical Industrial Score
// 64 steps across 4 bars: D minor (bar 1) -> Bb major/sus (bar 2) -> C minor/sus (bar 3) -> A phrygian tension (bar 4)
// 0 = rest, positive = MIDI note number

export const BASS_PATTERN = new Uint8Array([
  // Bar 1: D2 (38) driving pulse
  38, 0, 38, 0, 38, 38, 0, 38, 38, 0, 38, 0, 41, 0, 38, 0,
  // Bar 2: Bb1 (34) gritty low drop
  34, 0, 34, 0, 34, 34, 0, 34, 34, 0, 36, 0, 38, 0, 34, 0,
  // Bar 3: C2 (36) -> Eb2 (39)
  36, 0, 36, 0, 36, 36, 0, 36, 39, 0, 39, 0, 36, 0, 34, 0,
  // Bar 4: A1 (33) -> C#2 (37) / Eb2 (39) phrygian turnaround
  33, 0, 33, 0, 33, 33, 0, 33, 39, 0, 38, 0, 37, 0, 33, 0,
]);

export const LEAD_PATTERN = new Uint8Array([
  // Bar 1: Tactical arpeggio D4(62) - F4(65) - A4(69) - Bb4(70)
  62, 0, 65, 0, 69, 0, 65, 0, 70, 0, 69, 0, 65, 0, 64, 0,
  // Bar 2: Tension motif over Bb
  62, 0, 65, 0, 70, 0, 69, 0, 65, 0, 67, 0, 65, 0, 62, 0,
  // Bar 3: Escalating C4(60) - Eb4(63) - G4(67)
  60, 0, 63, 0, 67, 0, 63, 0, 72, 0, 70, 0, 67, 0, 65, 0,
  // Bar 4: Climax hook A4(69) - G4(67) - F4(65) - E4(64) -> D4
  69, 0, 67, 0, 65, 0, 64, 0, 65, 0, 64, 0, 61, 0, 62, 0,
]);

// Chord root MIDI per bar (triggers sustained brass/string pad at step 0 of each bar)
export const PAD_CHORDS: ReadonlyArray<readonly [number, number, number]> = [
  [50, 57, 62], // Dm (D3, A3, D4)
  [46, 53, 58], // Bb5 (Bb2, F3, Bb3)
  [48, 55, 60], // Cm/5 (C3, G3, C4)
  [45, 52, 57], // A5 phrygian resolve (A2, E3, A3)
];

// Drum hits per 16-step bar (repeated with bar-4 fills):
// 0 = none, 1 = normal, 2 = accent
export const KICK_BAR_A = new Uint8Array([2, 0, 0, 0, 1, 0, 1, 0, 2, 0, 0, 1, 1, 0, 0, 0]);
export const KICK_BAR_FILL = new Uint8Array([2, 0, 0, 0, 1, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 1]);

export const SNARE_BAR_A = new Uint8Array([0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 1]);
export const SNARE_BAR_FILL = new Uint8Array([0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 1, 0, 2, 1, 2, 2]);

export const HAT_BAR_GROOVE = new Uint8Array([1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 2, 1]);
export const HAT_BAR_CLIMAX = new Uint8Array([2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 2, 1]);

export interface MusicMixParameters {
  intensity: MusicIntensity;
  cutoffHz: number;
  bassLevel: number;
  drumsLevel: number;
  hatLevel: number;
  padLevel: number;
  leadLevel: number;
  transposeSemitones: number;
}

export function resolveMusicIntensity(
  phase: GamePhase,
  wave: number,
  hp: number,
  enemiesRemaining: number,
  waveBreakActive: boolean,
): MusicIntensity {
  if (phase === 'paused') return 'paused';
  if (phase === 'title' || phase === 'gameover') return 'briefing';
  if (waveBreakActive || enemiesRemaining <= 0) return 'stealth';
  if (wave >= 4 || hp <= 35) return 'climax';
  return 'combat';
}

export function getMapKeyTranspose(mapId: MapId): number {
  if (mapId === 'harbor') return -2; // C Minor dusk weight
  if (mapId === 'quarry') return 2; // E Phrygian night-ops tension
  return 0; // D Minor FOB Ironclad
}

export function computeMusicMixParameters(
  intensity: MusicIntensity,
  mapId: MapId = 'ironclad',
): MusicMixParameters {
  const transposeSemitones = getMapKeyTranspose(mapId);
  switch (intensity) {
    case 'paused':
      return {
        intensity,
        cutoffHz: 460,
        bassLevel: 0.3,
        drumsLevel: 0.15,
        hatLevel: 0.0,
        padLevel: 0.45,
        leadLevel: 0.0,
        transposeSemitones,
      };
    case 'briefing':
      return {
        intensity,
        cutoffHz: 1450,
        bassLevel: 0.34,
        drumsLevel: 0.18,
        hatLevel: 0.08,
        padLevel: 0.52,
        leadLevel: 0.14,
        transposeSemitones,
      };
    case 'stealth':
      return {
        intensity,
        cutoffHz: 2400,
        bassLevel: 0.5,
        drumsLevel: 0.36,
        hatLevel: 0.24,
        padLevel: 0.48,
        leadLevel: 0.22,
        transposeSemitones,
      };
    case 'combat':
      return {
        intensity,
        cutoffHz: 7500,
        bassLevel: 0.72,
        drumsLevel: 0.85,
        hatLevel: 0.44,
        padLevel: 0.46,
        leadLevel: 0.48,
        transposeSemitones,
      };
    case 'climax':
      return {
        intensity,
        cutoffHz: 11500,
        bassLevel: 0.86,
        drumsLevel: 1.0,
        hatLevel: 0.62,
        padLevel: 0.56,
        leadLevel: 0.66,
        transposeSemitones,
      };
  }
}

export interface ScheduledStepEvent {
  stepIndex: number;
  timeSec: number;
}

/**
 * Pure lookahead window computation so tests can verify drift-free step scheduling.
 */
export function computeSchedulerSteps(
  currentTimeSec: number,
  nextNoteTimeSec: number,
  currentStepIndex: number,
  scheduleAheadSec = 0.12,
  stepDurationSec = STEP_DURATION_SEC,
): { events: ScheduledStepEvent[]; nextNoteTimeSec: number; nextStepIndex: number } {
  const events: ScheduledStepEvent[] = [];
  let cursorTime = nextNoteTimeSec;
  let cursorStep = currentStepIndex;
  const horizon = currentTimeSec + scheduleAheadSec;

  // Guard against runaway catch-up if main thread stalled > 0.5s
  if (cursorTime < currentTimeSec - 0.35) {
    cursorTime = currentTimeSec;
  }

  while (cursorTime < horizon) {
    events.push({ stepIndex: cursorStep, timeSec: cursorTime });
    cursorTime += stepDurationSec;
    cursorStep = (cursorStep + 1) % TOTAL_STEPS;
  }

  return {
    events,
    nextNoteTimeSec: cursorTime,
    nextStepIndex: cursorStep,
  };
}

/**
 * Generates a smooth tanh soft-clipping WaveShaper lookup curve once at startup.
 */
export function createSoftClipCurve(samples = 1024, drive = 1.65): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(samples);
  const norm = Math.tanh(drive);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    curve[i] = Math.tanh(x * drive) / norm;
  }
  return curve;
}
