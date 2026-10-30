/* מנוע צליל חי: הכול מסונתז בדפדפן, שכבה על שכבה, על שעון אחד. */
let ctx, master, analyser, reverbIn, noiseBuf;
const KS = {};
function ensureCtx(){
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createDynamicsCompressor(); master.threshold.value = -16; master.ratio.value = 4;
  const out = ctx.createGain(); out.gain.value = 0.9;
  analyser = ctx.createAnalyser(); analyser.fftSize = 512;
  master.connect(out); out.connect(analyser); analyser.connect(ctx.destination);
  const rv = ctx.createConvolver(); const len = Math.floor(ctx.sampleRate * 2.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  rv.buffer = ir; reverbIn = ctx.createGain(); reverbIn.gain.value = 0.3; reverbIn.connect(rv); rv.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
}
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function env(g, t, a, peak, d, sus = 0) {
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus), t + a + d);
}
function osc(type, f, t, dur, dest, detune = 0) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
  o.connect(dest); o.start(t); o.stop(t + dur + 0.05); return o;
}
function lp(f, q = 0.7) { const b = ctx.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = f; b.Q.value = q; return b; }
function bp(f, q = 1) { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; return b; }
function hp(f) { const b = ctx.createBiquadFilter(); b.type = 'highpass'; b.frequency.value = f; return b; }
function chain(...n) { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[0]; }
function noise(t, dur, filt, vol, bus, a = 0.001) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const g = ctx.createGain(); env(g, t, a, vol, dur);
  chain(s, filt, g, bus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
function send(node, amt) { const g = ctx.createGain(); g.gain.value = amt; node.connect(g); g.connect(reverbIn); }

/* ---------- drums ---------- */
function kick(t, bus, v = 1, long = false) {
  const g = ctx.createGain(); const o = ctx.createOscillator();
  o.frequency.setValueAtTime(long ? 120 : 160, t); o.frequency.exponentialRampToValueAtTime(long ? 38 : 45, t + (long ? 0.25 : 0.1));
  env(g, t, 0.002, v, long ? 0.9 : 0.35); o.connect(g); g.connect(bus); o.start(t); o.stop(t + (long ? 1 : 0.4));
}
const snare = (t, bus, v = 0.5) => { noise(t, 0.18, bp(1800, 0.8), v, bus); const g = ctx.createGain(); env(g, t, 0.001, v * 0.7, 0.1); osc('triangle', 190, t, 0.12, g); g.connect(bus); };
const clap = (t, bus, v = 0.5) => { [0, 0.012, 0.024].forEach(o => noise(t + o, 0.03, bp(1400, 1.5), v * 0.8, bus)); noise(t + 0.03, 0.2, bp(1500, 1.2), v, bus); };
const hat = (t, bus, v = 0.18, d = 0.04) => noise(t, d, hp(7500), v, bus);
const rim = (t, bus, v = 0.35) => { noise(t, 0.03, bp(2500, 4), v, bus); const g = ctx.createGain(); env(g, t, 0.001, v * 0.5, 0.04); osc('square', 800, t, 0.05, g); g.connect(bus); };
const tom = (t, bus, f = 140, v = 0.5) => { const g = ctx.createGain(); env(g, t, 0.002, v, 0.25); const o = osc('sine', f, t, 0.3, g); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.25); g.connect(bus); };
const doum = (t, bus, v = 0.8) => { const g = ctx.createGain(); env(g, t, 0.002, v, 0.4); const o = osc('sine', 110, t, 0.45, g); o.frequency.exponentialRampToValueAtTime(70, t + 0.3); g.connect(bus); };
const tek = (t, bus, v = 0.4) => { noise(t, 0.04, bp(3500, 3), v, bus); const g = ctx.createGain(); env(g, t, 0.001, v * 0.6, 0.05); osc('sine', 650, t, 0.06, g); g.connect(bus); };
const ride = (t, bus, v = 0.12) => { noise(t, 0.35, hp(5000), v, bus); const g = ctx.createGain(); env(g, t, 0.001, v * 0.4, 0.4); osc('square', 5100, t, 0.4, g); g.connect(bus); };
const brush = (t, bus, v = 0.18) => noise(t, 0.16, lp(4000), v, bus, 0.03);
const shakerHit = (t, bus, v = 0.08) => noise(t, 0.05, hp(6000), v, bus, 0.01);

/* דפוסי ביט: 16 צעדים לתיבה */
const GROOVES = {
  four:   (s, t, b, d) => { if (s % 4 === 0) kick(t, b); if (s === 4 || s === 12) clap(t, b, 0.4); if (s % 4 === 2) hat(t, b, 0.22, 0.12); else if (s % 2 === 0) hat(t, b, 0.08); },
  half:   (s, t, b, d) => { if (s === 0 || s === 10) kick(t, b, 1, true); if (s === 8) { clap(t, b, 0.45); snare(t, b, 0.3); } hat(t, b, s % 2 ? 0.06 : 0.12); if (s >= 12 && s % 2 === 1) hat(t + d / 2, b, 0.08); },
  boombap:(s, t, b, d) => { const sw = s % 2 ? d * 0.18 : 0; if (s === 0 || s === 7 || s === 10) kick(t + sw, b, 0.9); if (s === 4 || s === 12) snare(t + sw, b, 0.55); if (s % 2 === 0) hat(t + sw, b, 0.12); },
  break:  (s, t, b, d) => { if (s === 0 || s === 10) kick(t, b); if (s === 4 || s === 12) snare(t, b, 0.55); if (s === 7 || s === 15) snare(t, b, 0.15); if (s % 2 === 0) hat(t, b, 0.14); },
  dembow: (s, t, b, d) => { if (s % 4 === 0) kick(t, b, 0.9); if ([3, 6, 11, 14].includes(s)) snare(t, b, 0.4); if (s % 2 === 0) hat(t, b, 0.1); },
  afro:   (s, t, b, d) => { if (s === 0 || s === 6 || s === 10) kick(t, b, 0.85); if ([3, 7, 11, 14].includes(s)) rim(t, b, 0.3); if (s === 13) tom(t, b, 180, 0.35); if (s === 15) tom(t, b, 130, 0.35); shakerHit(t, b, s % 4 === 2 ? 0.12 : 0.06); },
  rock:   (s, t, b, d) => { if (s === 0 || s === 8 || s === 10) kick(t, b, 0.9); if (s === 4 || s === 12) snare(t, b, 0.6); if (s % 2 === 0) hat(t, b, 0.15); },
  swing:  (s, t, b, d) => { if ([0, 4, 8, 12].includes(s)) ride(t, b); if (s === 7 || s === 15) ride(t + d * 0.33, b, 0.08); if (s === 4 || s === 12) brush(t, b); if (s === 0) kick(t, b, 0.35); },
  pulse:  (s, t, b, d) => { if (s === 0) kick(t, b, 0.35); if (s === 3) kick(t, b, 0.18); },
  dnb:    (s, t, b, d) => { if (s === 0 || s === 10) kick(t, b); if (s === 4 || s === 12) snare(t, b, 0.6); if (s === 7) snare(t, b, 0.15); if (s % 2 === 0) hat(t, b, 0.13); },
  maqsum: (s, t, b, d) => { if (s === 0 || s === 8) doum(t, b); if ([2, 6, 12].includes(s)) tek(t, b); if (s % 2 === 1) tek(t, b, 0.1); if (s % 2 === 0) shakerHit(t, b, 0.05); },
  onedrop:(s, t, b, d) => { if (s === 8) { kick(t, b, 0.9); rim(t, b, 0.45); } if (s % 2 === 0) hat(t + (s % 4 ? d * 0.15 : 0), b, 0.1); },
  bossa:  (s, t, b, d) => { if ([0, 3, 6, 10, 12].includes(s)) rim(t, b, 0.25); if (s === 0 || s === 6 || s === 8 || s === 14) kick(t, b, 0.4); shakerHit(t, b, 0.05); },
  rumba:  (s, t, b, d) => { if (s === 0 || s === 6 || s === 10) kick(t, b, 0.55); if (s === 4 || s === 12) clap(t, b, 0.45); if (s === 14) clap(t, b, 0.2); },
};

/* ---------- harmony ---------- */
const HARM = {
  bright: { ch: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]], sc: [60, 62, 64, 65, 67, 69, 71] },
  dark:   { ch: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], sc: [57, 59, 60, 62, 64, 65, 67] },
  east:   { ch: [[52, 56, 59], [53, 57, 60], [50, 53, 57], [52, 56, 59]], sc: [52, 53, 56, 57, 59, 60, 62] },
};

/* ---------- instruments ---------- */
function ksBuf(f, bright) {
  const k = Math.round(f) + (bright ? 'b' : ''); if (KS[k]) return KS[k];
  const sr = ctx.sampleRate, N = Math.round(sr / f), len = Math.floor(sr * 1.6), buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0), r = new Float32Array(N);
  for (let i = 0; i < N; i++) r[i] = Math.random() * 2 - 1;
  const damp = bright ? 0.997 : 0.994; let x = 0;
  for (let i = 0; i < len; i++) { const c = r[x], n = r[(x + 1) % N]; d[i] = c; r[x] = damp * 0.5 * (c + n); x = (x + 1) % N; }
  return KS[k] = buf;
}
function pluck(m, t, v, bus, bright = false) {
  const s = ctx.createBufferSource(); s.buffer = ksBuf(mtof(m), bright); const g = ctx.createGain(); g.gain.value = v;
  chain(s, lp(bright ? 6000 : 3500), g, bus); send(g, 0.25); s.start(t);
}
function voiceSynth(m, t, dur, bus, v, formants) {
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m);
  const l = ctx.createOscillator(); l.frequency.value = 5.3; const lg = ctx.createGain(); lg.gain.value = 8; l.connect(lg); lg.connect(o.detune);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + Math.min(0.15, dur / 3)); g.gain.setValueAtTime(v, t + dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + dur);
  formants.forEach(([f, a], i) => { const b = bp(f, 9 + i * 2); const fg = ctx.createGain(); fg.gain.value = a * 1.7; o.connect(b); b.connect(fg); fg.connect(g); });
  g.connect(bus); send(g, 0.5); o.start(t); l.start(t); o.stop(t + dur + 0.05); l.stop(t + dur + 0.05);
}
const VOWELS = [[[700, 1], [1150, .5], [2600, .25]], [[400, 1], [1900, .4], [2600, .2]], [[300, 1], [870, .4], [2250, .2]], [[500, 1], [900, .5], [2400, .2]]];

const INSTR = {
  pad(s, t, c, sc, bus, d, bar) { if (s) return; c.forEach(n => { const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.5); g.gain.setValueAtTime(0.05, t + d * 14); g.gain.linearRampToValueAtTime(0.0001, t + d * 16); const f = lp(900); f.connect(g); g.connect(bus); send(g, 0.6); osc('sawtooth', mtof(n), t, d * 16, f, -7); osc('triangle', mtof(n + 12), t, d * 16, f, 6); }); },
  rhodes(s, t, c, sc, bus, d) { if (s !== 0 && s !== 6 && s !== 10) return; const v = s ? 0.05 : 0.07; c.forEach(n => { const g = ctx.createGain(); env(g, t, 0.005, v, d * 7); const tr = ctx.createOscillator(); tr.frequency.value = 4.5; const tg = ctx.createGain(); tg.gain.value = v * 0.4; tr.connect(tg); tg.connect(g.gain); tr.start(t); tr.stop(t + d * 8); osc('sine', mtof(n), t, d * 8, g); osc('sine', mtof(n + 12), t, d * 2, g); g.connect(bus); send(g, 0.3); }); },
  sub(s, t, c, sc, bus, d, bar, groove) { const hits = groove === 'half' ? [0, 10] : groove === 'pulse' ? [0] : groove === 'onedrop' ? [0, 6, 8] : [0, 4, 8, 12]; if (!hits.includes(s)) return; const len = groove === 'half' ? d * 9 : groove === 'pulse' ? d * 15 : d * 3.5; const g = ctx.createGain(); env(g, t, 0.01, 0.22, len, 0.0001); osc('sine', mtof(c[0] - 24), t, len, g); g.connect(bus); },
  synth(s, t, c, sc, bus, d) { if (s % 2) return; const arp = [c[0], c[2], c[1], c[2] + 12, c[0] + 12, c[2], c[1] + 12, c[2]]; const n = arp[(s / 2) % 8] + 12; const g = ctx.createGain(); env(g, t, 0.005, 0.07, d * 1.6); const f = lp(2800, 4); f.frequency.setValueAtTime(3500, t); f.frequency.exponentialRampToValueAtTime(900, t + d * 1.8); chain(f, g, bus); send(g, 0.35); osc('sawtooth', mtof(n), t, d * 2, f); osc('sawtooth', mtof(n), t, d * 2, f, 10); },
  piano(s, t, c, sc, bus, d, bar) { const note = (m, v, len) => { const g = ctx.createGain(); env(g, t, 0.003, v, len); const f = lp(3200); chain(f, g, bus); send(g, 0.25); osc('triangle', mtof(m), t, len, f); osc('sine', mtof(m + 12), t, len * 0.5, f); };
    if (s === 0 || s === 10) c.forEach(n => note(n, 0.08, 1.6)); if (s === 6 || s === 14) note(sc[(bar * 3 + s) % 7] + 12, 0.07, 1); },
  guitar(s, t, c, sc, bus, d, bar, groove) {
    if (groove === 'onedrop') { if (s === 4 || s === 12) c.forEach((n, i) => pluck(n + 12, t + i * 0.008, 0.35, bus, true)); return; }
    if (groove === 'swing') { if (s % 4 === 0) c.forEach((n, i) => pluck(n, t + i * 0.01, 0.4, bus)); return; }
    const notes = [c[0] - 12, c[0], c[1], c[2], c[0] + 12];
    if (s === 0 || s === 8) notes.forEach((n, i) => pluck(n, t + i * 0.022, 0.5, bus));
    if (s === 6 || s === 14 || s === 4 || s === 12) [c[1] + 12, c[2], c[0] + 12].forEach((n, i) => pluck(n, t + i * 0.015, 0.28, bus)); },
  egtr(s, t, c, sc, bus, d) { if (s % 2) return; const ws = ctx.createWaveShaper(); const cv = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; cv[i] = Math.tanh(x * 4); } ws.curve = cv;
    const g = ctx.createGain(); env(g, t, 0.004, 0.05, d * 1.8); const f = lp(2400); chain(ws, f, g, bus); send(g, 0.2); [c[0] - 12, c[0] - 5].forEach(n => osc('sawtooth', mtof(n), t, d * 2, ws, Math.random() * 8)); },
  strings(s, t, c, sc, bus, d) { if (s) return; [c[0] - 12, ...c].forEach(n => { const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.035, t + 0.6); g.gain.setValueAtTime(0.035, t + d * 14); g.gain.linearRampToValueAtTime(0.0001, t + d * 16); const f = lp(1600); chain(f, g, bus); send(g, 0.6); [-9, 0, 8].forEach(dt => osc('sawtooth', mtof(n), t, d * 16, f, dt)); }); },
  oud(s, t, c, sc, bus, d, bar) { if (s % 2 && s !== 15) return; const phrase = [0, 1, 2, 1, 3, 2, 1, 0]; const i = phrase[(s >> 1) % 8]; const m = sc[(i + bar) % 7] + 12; pluck(m, t, 0.42, bus, true); if (s === 14) pluck(m - 1, t + d / 2, 0.25, bus, true); },
  bell(s, t, c, sc, bus, d, bar) { if (s % 4) return; const m = c[(s / 4 + bar) % 3] + 24; const g = ctx.createGain(); g.connect(bus); send(g, 0.5); [[1, 0.06, 2.2], [2.76, 0.025, 1], [5.4, 0.012, 0.5]].forEach(([r, v, len]) => { const gg = ctx.createGain(); env(gg, t, 0.002, v, len); gg.connect(g); osc('sine', mtof(m) * r, t, len, gg); }); },
};

/* ---------- textures ---------- */
const TEX = {
  none() {},
  birds(s, t, bus, d) { if (s % 2 || Math.random() > 0.28) return; const n = 2 + Math.floor(Math.random() * 4), base = 2600 + Math.random() * 2200;
    for (let i = 0; i < n; i++) { const tt = t + i * (0.07 + Math.random() * 0.05); const g = ctx.createGain(); env(g, tt, 0.005, 0.035, 0.07); const o = osc('sine', base, tt, 0.09, g); o.frequency.setValueAtTime(base * (1 + Math.random() * 0.3), tt); o.frequency.exponentialRampToValueAtTime(base * (0.7 + Math.random() * 0.5), tt + 0.07); g.connect(bus); send(g, 0.4); } },
  rain(s, t, bus, d) { if (s === 0) { const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06, t + 0.3); g.gain.setValueAtTime(0.06, t + d * 15); g.gain.linearRampToValueAtTime(0.0001, t + d * 16.5); const s2 = ctx.createBufferSource(); s2.buffer = noiseBuf; s2.loop = true; chain(s2, bp(2500, 0.5), g, bus); s2.start(t); s2.stop(t + d * 17); } if (Math.random() < 0.5) noise(t + Math.random() * d, 0.015, bp(4000 + Math.random() * 3000, 6), 0.05, bus); },
  ocean(s, t, bus, d) { if (s !== 0) return; const len = d * 16; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.11, t + len * 0.45); g.gain.linearRampToValueAtTime(0.0001, t + len * 1.05); const s2 = ctx.createBufferSource(); s2.buffer = noiseBuf; s2.loop = true; const f = lp(500); f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(1200, t + len * 0.45); f.frequency.linearRampToValueAtTime(300, t + len); chain(s2, f, g, bus); s2.start(t); s2.stop(t + len * 1.1); },
  vinyl(s, t, bus, d) { if (s === 0) noise(t, d * 16, bp(5000, 0.3), 0.012, bus, 0.2); for (let i = 0; i < 2; i++) if (Math.random() < 0.35) noise(t + Math.random() * d, 0.004, hp(2000), 0.12, bus); },
  shaker(s, t, bus, d) { shakerHit(t, bus, s % 4 === 2 ? 0.1 : 0.05); },
  clap(s, t, bus, d) { if (s === 4 || s === 12) clap(t, bus, 0.35); if (s === 10 || s === 15) clap(t, bus, 0.15); },
};

/* ---------- vocals ---------- */
function vocal(kind, s, t, c, sc, bus, d, bar) {
  if (kind === 'sing') { if (s === 0 || s === 8) { const pool = [c[2] + 12, c[1] + 12, c[0] + 12, sc[(bar + 4) % 7] + 12]; voiceSynth(pool[(bar * 2 + (s ? 1 : 0)) % 4], t, d * 7.5, bus, 0.35, VOWELS[bar % 2 ? 0 : 3]); } }
  else if (kind === 'rap') { if ([0, 2, 3, 5, 6, 8, 10, 11, 13].includes(s)) voiceSynth(c[0] + 12 + [0, 2, -1, 3][s % 4], t, d * 0.8, bus, 0.32, VOWELS[(s + bar) % 4]); }
}

/* ---------- transport ---------- */
let player = null;
function stopAll(fade = 0.12) {
  if (!player) return; clearInterval(player.timer);
  const g = player.bus, t = ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0.0001, t + fade);
  setTimeout(() => { try { g.disconnect(); } catch (e) {} }, fade * 1000 + 300); player = null;
}
/* mix = {groove,bpm,mood,palette:[],texture,vocal} */
function playMix(mix) {
  ensureCtx(); stopAll();
  const bus = ctx.createGain(); bus.gain.value = 0.9; bus.connect(master);
  const bpm = mix.bpm || 110, d = 60 / bpm / 4, H = HARM[mix.mood || 'dark'];
  let step = 0, next = ctx.currentTime + 0.06;
  const p = { bus, timer: null, mix };
  p.timer = setInterval(() => {
    while (next < ctx.currentTime + 0.2) {
      const s = step % 16, bar = Math.floor(step / 16) % 4, c = H.ch[bar];
      if (mix.groove) GROOVES[mix.groove](s, next, bus, d);
      (mix.palette || []).forEach(n => INSTR[n] && INSTR[n](s, next, c, H.sc, bus, d, bar, mix.groove));
      if (mix.texture && TEX[mix.texture]) TEX[mix.texture](s, next, bus, d);
      if (mix.vocal && mix.vocal !== 'none') vocal(mix.vocal, s, next, c, H.sc, bus, d, bar);
      next += d; step++;
    }
  }, 25);
  player = p; return p;
}
window.__level = () => { if (!analyser) return 0; const a = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(a); let s = 0; for (const x of a) s += x * x; return Math.sqrt(s / a.length); };
