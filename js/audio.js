// 효과음은 WebAudio로 합성한다 (외부 음원 없음)
export class Sound {
  constructor() {
    this.ctx = null;
    let m = false;
    try { m = localStorage.getItem('dokdo-muted') === '1'; } catch (e) { /* */ }
    this.muted = m;
    this.last = {};
  }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(this.ctx.destination);
    // 파도 소리
    const len = this.ctx.sampleRate * 4;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { b = b * 0.98 + (Math.random() * 2 - 1) * 0.02; d[i] = b * 3; }
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = this.ctx.createGain(); g.gain.value = 0.25;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.12;
    const lg = this.ctx.createGain(); lg.gain.value = 0.12;
    lfo.connect(lg); lg.connect(g.gain); lfo.start();
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }
  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('dokdo-muted', m ? '1' : '0'); } catch (e) { /* */ }
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  }
  noise(dur, type, freq, vol, pan = 0, q = 1) {
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const p = c.createStereoPanner ? c.createStereoPanner() : null;
    s.connect(f); f.connect(g);
    if (p) { p.pan.value = pan; g.connect(p); p.connect(this.master); } else g.connect(this.master);
    s.start(t); s.stop(t + dur);
    return f;
  }
  tone(freq, dur, vol, type = 'sine', when = 0, slide = 0) {
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  play(name, vol = 0.5, pan = 0) {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    if (this.last[name] && now - this.last[name] < 40) return;
    this.last[name] = now;
    switch (name) {
      case 'cannon': { const f = this.noise(0.5, 'lowpass', 900, vol, pan); f.frequency.exponentialRampToValueAtTime(120, this.ctx.currentTime + 0.4); this.tone(70, 0.3, vol * 0.8, 'sine', 0, 0.5); break; }
      case 'hit': this.noise(0.35, 'bandpass', 600, vol, pan, 0.8); this.tone(160, 0.2, vol * 0.5, 'square', 0, 0.4); break;
      case 'splash': this.noise(0.45, 'highpass', 1200, vol, pan); break;
      case 'explode': { const f = this.noise(1.2, 'lowpass', 1200, vol, pan); f.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 1); this.tone(55, 0.8, vol, 'sine', 0, 0.5); break; }
      case 'sink': this.noise(2, 'lowpass', 400, vol, pan); this.tone(110, 1.5, vol * 0.5, 'triangle', 0, 0.3); break;
      case 'coin': this.tone(1320, 0.12, vol * 0.4, 'square'); this.tone(1760, 0.18, vol * 0.4, 'square', 0.07); break;
      case 'fish': this.tone(660, 0.12, vol * 0.5, 'sine'); this.tone(990, 0.2, vol * 0.5, 'sine', 0.08); break;
      case 'buy': this.tone(880, 0.08, vol * 0.4, 'triangle'); break;
      case 'upgrade': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, vol * 0.45, 'triangle', i * 0.07)); break;
      case 'fanfare': [392, 523, 659, 784, 659, 784].forEach((f, i) => this.tone(f, 0.3, vol * 0.4, 'square', i * 0.11)); break;
      case 'horn': this.tone(110, 1.1, vol * 0.5, 'sawtooth', 0, 1.02); this.tone(165, 1.1, vol * 0.3, 'sawtooth', 0, 1.02); break;
      case 'bell': this.tone(1046, 0.6, vol * 0.4, 'sine'); this.tone(1568, 0.5, vol * 0.2, 'sine', 0.02); break;
      case 'error': this.tone(200, 0.15, vol * 0.4, 'square'); break;
    }
  }
}
