// SOLMARIS — procedural WebAudio: engine, siren, gunshot, pickup, UI blips.
// No audio files, no network. Everything is synthesized with oscillators + noise.
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = null;
    this.sirenHigh = false;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      // Engine: sawtooth through lowpass, pitch follows speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 50;
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 400;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
    } catch (e) { this.ctx = null; }
  }
  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.value = m ? 0 : 0.5;
  }
  setEngine(speedNorm, driving) {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    const target = driving ? 0.03 + speedNorm * 0.06 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(45 + speedNorm * 160, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(300 + speedNorm * 1400, t, 0.1);
  }
  blip(freq, dur, type, vol) {
    if (!this.ctx || this.muted) return;
    try {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'square';
      o.frequency.value = freq || 660;
      g.gain.setValueAtTime(vol || 0.15, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + (dur || 0.12));
      o.connect(g); g.connect(this.master);
      o.start(); o.stop(this.ctx.currentTime + (dur || 0.12));
    } catch (e) { /* audio is best-effort */ }
  }
  pickup() { this.blip(880, 0.09, 'sine', 0.2); setTimeout(() => this.blip(1320, 0.14, 'sine', 0.2), 90); }
  cash() { this.blip(990, 0.08, 'triangle', 0.2); setTimeout(() => this.blip(1240, 0.08, 'triangle', 0.2), 70); setTimeout(() => this.blip(1560, 0.16, 'triangle', 0.22), 140); }
  crash() { this.noiseBurst(0.25, 0.5); this.blip(90, 0.2, 'sawtooth', 0.3); }
  gunshot() { this.noiseBurst(0.12, 0.45); }
  horn() { this.blip(370, 0.18, 'square', 0.12); setTimeout(() => this.blip(370, 0.18, 'square', 0.12), 200); }
  success() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'triangle', 0.2), i * 110)); }
  fail() { [330, 262, 196].forEach((f, i) => setTimeout(() => this.blip(f, 0.2, 'sawtooth', 0.14), i * 130)); }
  noiseBurst(dur, vol) {
    if (!this.ctx || this.muted) return;
    try {
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      const g = this.ctx.createGain();
      src.buffer = buf; g.gain.value = vol || 0.3;
      src.connect(g); g.connect(this.master); src.start();
    } catch (e) { /* best-effort */ }
  }
  startSiren() {
    if (!this.ctx || this.sirenOsc) return;
    try {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'sine';
      this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.05;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.sirenTimer = setInterval(() => {
        if (!this.sirenOsc) return;
        this.sirenHigh = !this.sirenHigh;
        this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 950 : 650, this.ctx.currentTime, 0.05);
      }, 420);
    } catch (e) { this.sirenOsc = null; }
  }
  stopSiren() {
    if (this.sirenTimer) { clearInterval(this.sirenTimer); this.sirenTimer = null; }
    if (this.sirenOsc) { try { this.sirenOsc.stop(); } catch (e) {} this.sirenOsc = null; }
    this.sirenGain = null;
  }
}
