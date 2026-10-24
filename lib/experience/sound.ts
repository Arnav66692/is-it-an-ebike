// The site's sound, made in the browser with the Web Audio API. No audio file is loaded: a warm
// ambient chord breathes slowly through a soft filter and a reverb built from noise, an airy layer
// sits under it like distant water, and short soft tones answer hovers and clicks. It starts on the
// first press of Enter, since browsers allow sound only after a gesture, and the corner button
// turns it off and on. The choice is kept for this tab.

const MUTED_KEY = "sound-muted";
const MASTER_LEVEL = 0.16;
const FADE_S = 1.6;
/** A soft major ninth on A, low and wide, so it sits under speech and never nags. */
const CHORD_HZ = [110, 164.81, 220, 277.18, 329.63, 493.88];
const REVERB_S = 3.2;

interface Engine {
  ctx: AudioContext;
  master: GainNode;
  ui: GainNode;
}

let engine: Engine | null = null;
let muted = readMuted();
const listeners = new Set<(on: boolean) => void>();

function readMuted(): boolean {
  try {
    return typeof window !== "undefined" && window.sessionStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

function saveMuted(value: boolean): void {
  try {
    window.sessionStorage.setItem(MUTED_KEY, value ? "1" : "0");
  } catch {
    // Storage refused, as in some private windows. The choice then lasts until the page reloads.
  }
}

/** A reverb tail: two channels of noise that fade out, shaped like a large soft room. */
function impulse(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * REVERB_S);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch += 1) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2.4;
  }
  return buffer;
}

/** A slow wobble on a parameter, for breathing levels and a moving filter. */
function lfo(ctx: AudioContext, target: AudioParam, hz: number, depth: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = hz;
  gain.gain.value = depth;
  osc.connect(gain).connect(target);
  osc.start();
}

function build(): Engine | null {
  const Ctor = typeof window !== "undefined" ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
  if (!Ctor) return null;
  const ctx = new Ctor();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.55;
  reverb.connect(wet).connect(master);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 950;
  filter.Q.value = 0.6;
  lfo(ctx, filter.frequency, 0.04, 380);
  const dry = ctx.createGain();
  dry.gain.value = 0.5;
  filter.connect(dry).connect(master);
  filter.connect(reverb);

  CHORD_HZ.forEach((hz, i) => {
    for (const cents of [-5, 5]) {
      const osc = ctx.createOscillator();
      osc.type = i < 2 ? "sine" : "triangle";
      osc.frequency.value = hz;
      osc.detune.value = cents;
      const voice = ctx.createGain();
      voice.gain.value = 0.05 / (1 + i * 0.35);
      lfo(ctx, voice.gain, 0.05 + i * 0.013, voice.gain.value * 0.8);
      osc.connect(voice).connect(filter);
      osc.start();
    }
  });

  // Air, like water far off: noise through a narrow moving band.
  const noise = ctx.createBufferSource();
  const seconds = 4;
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  noise.buffer = buf;
  noise.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 600;
  band.Q.value = 0.8;
  lfo(ctx, band.frequency, 0.03, 260);
  const air = ctx.createGain();
  air.gain.value = 0.035;
  noise.connect(band).connect(air).connect(reverb);
  noise.start();

  const ui = ctx.createGain();
  ui.gain.value = 1;
  ui.connect(master);
  ui.connect(reverb);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) void ctx.suspend();
    else if (!muted) void ctx.resume();
  });
  return { ctx, master, ui };
}

function fadeTo(level: number): void {
  if (!engine) return;
  const { ctx, master } = engine;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
  master.gain.linearRampToValueAtTime(level, ctx.currentTime + FADE_S);
}

/** Starts the sound on the user's gesture. Safe to call again. */
export function startSound(): void {
  engine ??= build();
  if (!engine) return;
  void engine.ctx.resume();
  if (!muted) fadeTo(MASTER_LEVEL);
  whoosh();
}

export function isSoundOn(): boolean {
  return engine !== null && !muted;
}

export function setSoundOn(on: boolean): void {
  muted = !on;
  saveMuted(muted);
  if (on) startSound();
  else fadeTo(0);
  listeners.forEach((fn) => fn(on));
}

export function onSoundChange(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** A short soft tone for the interface. */
function tone(fromHz: number, toHz: number, seconds: number, level: number, type: OscillatorType = "sine"): void {
  if (!engine || muted) return;
  const { ctx, ui } = engine;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(fromHz, t);
  osc.frequency.exponentialRampToValueAtTime(toHz, t + seconds);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(level, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  osc.connect(gain).connect(ui);
  osc.start(t);
  osc.stop(t + seconds + 0.02);
}

export function hoverSound(): void {
  tone(1320, 1180, 0.09, 0.018);
}

export function clickSound(): void {
  tone(740, 370, 0.16, 0.05, "triangle");
}

/** A soft rush of air for entering the site. */
function whoosh(): void {
  if (!engine || muted) return;
  const { ctx, ui } = engine;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  const buf = ctx.createBuffer(1, ctx.sampleRate * 1.4, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  src.buffer = buf;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 1.2;
  band.frequency.setValueAtTime(300, t);
  band.frequency.exponentialRampToValueAtTime(2400, t + 1.2);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.12, t + 0.35);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.35);
  src.connect(band).connect(gain).connect(ui);
  src.start(t);
}
