// Sound effects synthesized at runtime with the WebAudio API — no asset files.
// Each effect is a short procedural noise/tone burst. The audio context is
// created lazily and resumed on first user gesture (browser autoplay policy).

let ctx = null;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

// Call once on a user gesture (e.g. clicking "Play") to unlock audio.
export function unlockAudio() {
  const c = ac();
  if (c.state === "suspended") c.resume();
}

// Short burst of filtered white noise — the basis for gunshots/impacts.
function noiseBurst({ duration = 0.15, freq = 1000, q = 1, gain = 0.4, type = "lowpass" }) {
  const c = ac();
  const frames = Math.floor(c.sampleRate * duration);
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames); // decaying noise
  }
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(c.destination);
  src.start();
}

// Simple oscillator beep with an envelope.
function tone({ freq = 440, duration = 0.1, type = "square", gain = 0.2, slideTo = null }) {
  const c = ac();
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + duration);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  osc.connect(g).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + duration);
}

export const Sound = {
  shoot() {
    noiseBurst({ duration: 0.12, freq: 1800, q: 0.7, gain: 0.35, type: "lowpass" });
    tone({ freq: 220, slideTo: 90, duration: 0.08, type: "sawtooth", gain: 0.15 });
  },
  reload() {
    tone({ freq: 600, duration: 0.05, type: "square", gain: 0.12 });
    setTimeout(() => tone({ freq: 400, duration: 0.06, type: "square", gain: 0.12 }), 180);
    setTimeout(() => tone({ freq: 800, duration: 0.05, type: "square", gain: 0.12 }), 380);
  },
  hitMark() {
    tone({ freq: 1200, duration: 0.04, type: "sine", gain: 0.18 });
  },
  hurt() {
    noiseBurst({ duration: 0.18, freq: 500, q: 1, gain: 0.4, type: "lowpass" });
    tone({ freq: 160, slideTo: 80, duration: 0.18, type: "sawtooth", gain: 0.18 });
  },
  jump() {
    tone({ freq: 300, slideTo: 480, duration: 0.09, type: "sine", gain: 0.1 });
  },
  step() {
    noiseBurst({ duration: 0.05, freq: 350, q: 1, gain: 0.08, type: "lowpass" });
  },
  death() {
    tone({ freq: 400, slideTo: 60, duration: 0.7, type: "sawtooth", gain: 0.22 });
  },
  place() {
    noiseBurst({ duration: 0.07, freq: 600, q: 1, gain: 0.14, type: "lowpass" });
  },
  breakBlock() {
    noiseBurst({ duration: 0.12, freq: 900, q: 0.8, gain: 0.18, type: "lowpass" });
  },
};
