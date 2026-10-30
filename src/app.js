/* אם משהו נשבר – מראים את זה על המסך, כדי שאפשר יהיה לצלם ולתקן */
window.addEventListener('error', e => { try { const d = document.getElementById('err') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'err' });
  d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99;background:#ff4f7b;color:#fff;font:13px system-ui;padding:8px 12px;direction:ltr;text-align:left';
  d.textContent = 'שגיאה: ' + (e.message || e) + ' @' + (e.lineno || ''); } catch (x) {} });
/* ===================== API & MEMORY ===================== */
const API_BASE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? location.origin : 'https://vofpzkcvncbvmnxrmhyc.supabase.co/functions/v1/tadar';
const api = (p, params) => { const u = new URL(API_BASE + '/api/' + p); Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v))); return fetch(u).then(r => { if (!r.ok) throw new Error('api ' + r.status); return r.json(); }); };
const post = (p, body) => fetch(API_BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.ok ? r.json() : null).catch(() => null);
function userKey() { try { let k = localStorage.getItem('tadar_user'); if (!k) { k = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join(''); localStorage.setItem('tadar_user', k); } return k; } catch (e) { return window.__k || (window.__k = 'tmp' + Math.random().toString(36).slice(2, 14)); } }
const UK = userKey();
const nowCtx = () => { const d = new Date(); return { local_hour: d.getHours(), weekday: d.getDay(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone || null }; };
let ME = null;
const loadMe = () => api('me', { u: UK }).then(r => (ME = r)).catch(() => (ME = { yes: 0, notes: [] }));
const moment = m => post('moment', Object.assign({ user_key: UK, context: S.context || null }, nowCtx(), m)).then(r => { if (r && r.yes != null) ME = r; return r; });
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = encodeURIComponent;
const ytSearch = q => `https://www.youtube.com/results?search_query=${enc(q)}`;

/* ===================== ENGINE OF CHOICES ===================== */
const median = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const majority = a => { const m = {}; a.forEach(x => m[x] = (m[x] || 0) + 1); return Object.entries(m).sort((x, y) => y[1] - x[1])[0]?.[0]; };
const MULTI = { palette: 1, palette2: 1, texture: 1 };

function valuesOf(dim, ids) {
  const cnt = {};
  ids.forEach(id => {
    const s = STYLE[id];
    const vals = dim === 'groove' ? [s.groove] : dim === 'mood' ? [s.mood] : dim === 'vocal' ? [s.vocal] : dim === 'tempo' ? [tempoBand(s.bpm)]
      : dim === 'texture' ? s.texture : dim === 'palette' ? s.palette : s.palette.filter(p => !S.mix.palette.includes(p));
    new Set(vals).forEach(v => cnt[v] = (cnt[v] || 0) + 1);
  });
  return Object.entries(cnt).sort((a, b) => b[1] - a[1]);
}
function matches(dim, val, s) {
  if (dim === 'groove') return s.groove === val; if (dim === 'mood') return s.mood === val; if (dim === 'vocal') return s.vocal === val;
  if (dim === 'tempo') return tempoBand(s.bpm) === val; if (dim === 'texture') return s.texture.includes(val);
  if (dim === 'palette2' && val === '_enough') return true; return s.palette.includes(val);
}
function score(dim, ids) {
  const v = valuesOf(dim, ids); if (v.length < 2) return 0;
  const tot = v.reduce((a, [, n]) => a + n, 0); let h = 0; v.forEach(([, n]) => { const p = n / tot; h -= p * Math.log2(p); });
  if (MULTI[dim] && v.every(([, n]) => n === ids.length)) return 0;
  return h * (dim === 'palette' ? 1.6 : dim === 'texture' ? 1.15 : dim === 'palette2' ? 0.5 : dim === 'mood' ? 1.2 : 1);
}
/* ביט קודם. צלילים ומרקם הם שכבות שתמיד בונים, בסדר שמשתנה לפי מה שנשאר פתוח.
   צבע / מהירות / עוד צליל נכנסים רק כשהם באמת מפצלים. מילים – אחרונות. עד 5 סבבים. */
const CORE = ['palette', 'texture'], OPTIONAL = ['mood', 'tempo', 'palette2'];
function nextDim() {
  const a = S.asked;
  if (!a.includes('groove')) return 'groove';
  const coreLeft = CORE.filter(d => !a.includes(d));
  const needed = coreLeft.length + (a.includes('vocal') ? 0 : 1), left = 5 - a.length;
  const elig = coreLeft.map(d => [d, score(d, S.cands) + 0.01]);
  OPTIONAL.forEach(d => { if (a.includes(d) || (d === 'palette2' && !a.includes('palette'))) return; const sc = score(d, S.cands); if (sc > 0 && left > needed) elig.push([d, sc]); });
  if (elig.length) return elig.sort((x, y) => y[1] - x[1])[0][0];
  return a.includes('vocal') ? null : 'vocal';
}
/* כשנשארה דרך אחת בלבד, השכבה עדיין נבנית: מציעים גם אפשרויות "קישוט" שלא סוגרות עולמות */
const DECOR = { texture: ['none', 'birds', 'rain', 'ocean', 'vinyl'], vocal: ['none', 'sing', 'rap'], palette: ['pad', 'piano', 'synth', 'guitar', 'strings'], palette2: ['pad', 'bell', 'strings', 'piano'] };
function optionsFor(dim) {
  const vals = valuesOf(dim, S.cands);
  const want = dim === 'vocal' ? 2 : 3;
  if (vals.length < want && DECOR[dim]) {
    const have = new Set(vals.map(v => v[0]).concat(dim === 'palette2' ? S.mix.palette : []));
    for (const d of DECOR[dim]) { if (vals.length >= want) break; if (!have.has(d)) { vals.push([d, 0]); have.add(d); } }
  }
  if (dim === 'palette2') vals.push(['_enough', S.cands.length]);
  return vals;
}
function mixWith(dim, val, ids) {
  const m = JSON.parse(JSON.stringify(S.mix));
  const sub = ids.filter(id => matches(dim, val, STYLE[id]));
  if (dim === 'groove') { m.groove = val; m.bpm = median(sub.map(id => STYLE[id].bpm)); m.palette = []; }
  else if (dim === 'palette' || dim === 'palette2') { if (val !== '_enough') m.palette = [...m.palette, val]; }
  else if (dim === 'texture') m.texture = val;
  else if (dim === 'mood') m.mood = val;
  else if (dim === 'tempo') m.bpm = median(sub.map(id => STYLE[id].bpm));
  else if (dim === 'vocal') m.vocal = val;
  if (!S.asked.includes('mood') && dim !== 'mood' && sub.length) m.mood = majority(sub.map(id => STYLE[id].mood));
  /* הביט מתקרב לעולם שנשאר: אם עוד לא בחרה מהירות, הטמפו זז למה שמתאים למה שנשאר פתוח */
  if (!S.asked.includes('tempo') && dim !== 'tempo' && dim !== 'groove' && sub.length) m.bpm = median(sub.map(id => STYLE[id].bpm));
  return m;
}

/* ===================== STATE ===================== */
let S;
function freshState(keep = {}) {
  return { screen: 'build', mix: { groove: null, bpm: 110, mood: 'dark', palette: [], texture: 'none', vocal: 'none' }, cands: STYLES.map(s => s.id),
    asked: [], picks: [], dim: 'groove', offset: 0, played: {}, hist: [], result: null, guide: null, context: keep.context || null };
}
S = freshState();
const $app = document.getElementById('app');
let nowKey = null;
function stop() { stopAll(); nowKey = null; document.querySelectorAll('.playing').forEach(e => e.classList.remove('playing')); }
function render() { stop(); if (S.screen === 'build') renderBuild(); else if (S.screen === 'result') renderResult(); else if (S.screen === 'trust') renderTrust(); window.scrollTo(0, 0); }

/* ===================== BUILD ===================== */
function stackChips() {
  const out = [];
  if (S.mix.groove) out.push(LABELS.groove[S.mix.groove].n);
  S.mix.palette.forEach(p => out.push(LABELS.palette[p].n));
  if (S.asked.includes('texture')) out.push(LABELS.texture[S.mix.texture].n);
  if (S.asked.includes('mood')) out.push(LABELS.mood[S.mix.mood].n);
  if (S.asked.includes('tempo')) out.push(LABELS.tempo[tempoBand(S.mix.bpm)].n);
  if (S.asked.includes('vocal')) out.push(LABELS.vocal[S.mix.vocal].n);
  return out;
}
function greeting() {
  if (!ME) return '';
  if (!ME.yes) return 'עוד לא מכיר אותך. אז לא אנחש – נתחיל מהביט, ונבנה משם ביחד.';
  return `בנינו ביחד ${ME.yes === 1 ? 'פעם אחת' : ME.yes + ' פעמים'}. אני מתחיל להכיר אותך.`;
}
function renderBuild() {
  const dim = S.dim, D = DIMS[dim], vals = optionsFor(dim);
  const shown = vals.slice(S.offset, S.offset + 4), more = vals.length > 4;
  const chips = stackChips(), first = !S.asked.length;
  const notes = (ME && ME.notes) || [];
  $app.innerHTML = `
    <div class="top">
      ${S.hist.length ? `<button class="back" onclick="goBack()">→ אחורה</button>` : `<span></span>`}
      <button class="chip" onclick="S.screen='trust';render()">🤝 תסמוך עליי</button>
    </div>
    ${first ? `<div class="hello">${esc(greeting())}</div>${notes.length ? `<div class="noted">שמתי לב: ${esc(notes[0].note)}</div>` : ''}` : ''}
    ${chips.length ? `<button class="stack" id="stack" onclick="toggleStack()"><span class="eqs"><i></i><i></i><i></i></span> ${chips.map(esc).join(' · ')}</button>` : ''}
    <div class="q">${D.q}</div><div class="sub">${D.sub}</div>
    ${S.guide ? `<div class="guide">${S.guide}</div>` : ''}
    <div class="opts">${shown.map(([v]) => {
      const L = v === '_enough' ? { n: 'מספיק ככה', d: 'לא להוסיף' } : LABELS[dim === 'palette2' ? 'palette' : dim][v];
      return `<div class="opt" id="o-${v}" onclick="tap('${v}')">
        <div class="row"><div class="play"><span class="tri">▶</span><span class="eq"><i></i><i></i><i></i><i></i></span></div>
        <div><div class="name">${L.n}</div><div class="desc">${L.d}</div></div></div>
        <button class="choose" onclick="event.stopPropagation();choose('${v}')">זה ✓</button></div>`; }).join('')}
    </div>
    ${more ? `<button class="btn ghost" onclick="S.offset=(S.offset+4)%${vals.length};renderBuild()">אחרים ↻</button>` : ''}
    <div class="tiny">${S.cands.length > 3 ? `עוד ${S.cands.length} עולמות פתוחים` : 'כמעט שם'}</div>`;
  S.guide = null;
}
function tap(v) {
  ensureCtx();
  if (nowKey === v) { stop(); return; }
  stop(); nowKey = v; S.played[v] = 1;
  document.getElementById('o-' + v).classList.add('playing');
  playMix(mixWith(S.dim, v, S.cands));
}
function toggleStack() { ensureCtx(); if (nowKey === '_stack') { stop(); return; } stop(); nowKey = '_stack'; document.getElementById('stack').classList.add('playing'); playMix(S.mix); }
function choose(v) {
  const dim = S.dim;
  Object.keys(S.played).forEach(k => moment({ action: 'listen', layer: dim, reaction: k === v ? 'yes' : 'no', meta: { dim, val: k } }));
  if (!S.played[v]) moment({ action: 'listen', layer: dim, reaction: 'yes', meta: { dim, val: v } });
  S.hist.push(JSON.stringify({ mix: S.mix, cands: S.cands, asked: S.asked, picks: S.picks, dim: S.dim }));
  S.mix = mixWith(dim, v, S.cands);
  const f = S.cands.filter(id => matches(dim, v, STYLE[id]));
  if (f.length) S.cands = f;
  S.asked = [...S.asked, dim]; S.picks = [...S.picks, [dim, v]];
  advance();
}
function advance() {
  S.played = {}; S.offset = 0;
  const nd = nextDim();
  if (!nd) return finish();
  S.dim = nd; render();
  if (nowKey === null && S.mix.groove) { /* keep building audible */ }
}
function goBack() { const h = S.hist.pop(); if (!h) return; Object.assign(S, JSON.parse(h)); S.screen = 'build'; S.played = {}; S.offset = 0; render(); }

/* ===================== WORDS & VOICE ===================== */
const RX = {
  noDrums: /בלי תופים|בלי ביט|בלי קצב/, faster: /מהר|אנרגי|לקפוץ|לרקוד|ריקוד|להתפרק|לזוז/, slower: /לאט|רגוע|להירגע|איטי|לנוח|שקט|לישון|שינה|מדיטציה/,
  dark: /עצוב|עמוק|אפל|חושך|מלנכול|לבכות|בוכה|כבד/, bright: /שמח|בהיר|קליל|מרים|אופטימי|אור/, east: /מזרח|ערבי|ים.?תיכונ|סלסול/,
  noWords: /בלי מילים|בלי קול|אינסטרומנט|בלי שירה/, rap: /ראפ|היפ ?הופ/, words: /מילים|לשיר|שירה|קול|זמר/,
};
const TEX_RX = [[/ציפור/, 'birds'], [/גשם/, 'rain'], [/\bים\b|גלים|חוף/, 'ocean'], [/תקליט|ויניל/, 'vinyl'], [/כפיים/, 'clap']];
const PAL_RX = [[/גיטרה חשמלית|דיסטורשן/, 'egtr'], [/גיטרה/, 'guitar'], [/פסנתר חשמלי|רודס/, 'rhodes'], [/פסנתר/, 'piano'], [/כינור|קשת|תזמורת/, 'strings'], [/סינת/, 'synth'], [/בס/, 'sub'], [/פעמונ/, 'bell'], [/ענן|רך ופתוח/, 'pad']];
function handleText(raw) {
  const txt = (raw || '').trim(); if (!txt) return;
  const t = txt.toLowerCase();
  const said = [];
  /* 1. ביקשה סגנון בשמו */
  const hits = []; STYLES.forEach(s => [...s.al, s.he].forEach(a => { const al = a.toLowerCase(); const i = t.indexOf(al); if (i >= 0 && !/[א-תa-z]/.test(t[i + al.length] || ' ')) hits.push([s, al.length]); }));
  const named = hits.sort((a, b) => b[1] - a[1]).map(h => h[0]);
  if (named.length) { const s = named[0]; S.guide = null; showStyle(s.id, `אה, ${s.he}. הנה איך זה בנוי – שכבה על שכבה:`); return; }
  /* 2. כיוונים */
  const before = S.cands.slice(); let c = S.cands.slice();
  const tryF = (fn, label, onOk) => { const n = c.filter(id => fn(STYLE[id])); if (n.length) { c = n; said.push(label); onOk && onOk(n); } else said.push(`(${label} – אין לי עדיין דבר כזה בדרך הזאת)`); };
  const mark = d => { if (!S.asked.includes(d)) S.asked = [...S.asked, d]; };
  if (RX.noDrums.test(t)) tryF(s => s.groove === 'pulse', 'בלי תופים', () => { S.mix.groove = 'pulse'; mark('groove'); });
  else if (RX.faster.test(t)) tryF(s => s.bpm > (S.mix.groove ? S.mix.bpm : 110), 'יותר מהר', n => { S.mix.bpm = median(n.map(id => STYLE[id].bpm)); mark('tempo'); });
  else if (RX.slower.test(t)) tryF(s => s.bpm < (S.mix.groove ? S.mix.bpm : 110), 'יותר לאט', n => { S.mix.bpm = median(n.map(id => STYLE[id].bpm)); mark('tempo'); });
  if (RX.east.test(t)) tryF(s => s.mood === 'east', 'מזרחי', () => { S.mix.mood = 'east'; mark('mood'); });
  else if (RX.dark.test(t)) tryF(s => s.mood === 'dark', 'עמוק', () => { S.mix.mood = 'dark'; mark('mood'); });
  else if (RX.bright.test(t)) tryF(s => s.mood === 'bright', 'בהיר', () => { S.mix.mood = 'bright'; mark('mood'); });
  if (RX.noWords.test(t)) tryF(s => s.vocal === 'none', 'בלי מילים', () => { S.mix.vocal = 'none'; mark('vocal'); });
  else if (RX.rap.test(t)) tryF(s => s.vocal === 'rap', 'ראפ', () => { S.mix.vocal = 'rap'; mark('vocal'); });
  else if (RX.words.test(t)) tryF(s => s.vocal !== 'none', 'עם קול', n => { S.mix.vocal = majority(n.map(id => STYLE[id].vocal)); mark('vocal'); });
  TEX_RX.forEach(([rx, v]) => { if (rx.test(t)) tryF(s => s.texture.includes(v), LABELS.texture[v].n, () => { S.mix.texture = v; mark('texture'); }); });
  PAL_RX.some(([rx, v]) => { if (rx.test(t)) { tryF(s => s.palette.includes(v), LABELS.palette[v].n, () => { if (!S.mix.palette.includes(v)) S.mix.palette = [...S.mix.palette, v]; mark('palette'); }); return true; } });
  if (said.length) {
    S.hist.push(JSON.stringify({ mix: S.mix, cands: before, asked: S.asked, picks: S.picks, dim: S.dim }));
    S.cands = c; if (!S.mix.groove) { S.mix.groove = majority(c.map(id => STYLE[id].groove)); S.mix.bpm = median(c.map(id => STYLE[id].bpm)); mark('groove'); }
    moment({ action: 'talk', layer: S.dim, reaction: null, meta: { text: txt, applied: said } });
    S.guide = `שמעתי: ${said.map(esc).join(' · ')}. ${c.length > 1 ? 'ממשיכים משם.' : ''}`;
    S.played = {}; S.offset = 0;
    const nd = nextDim(); if (!nd) return finish(); S.dim = nd; render(); return;
  }
  /* 3. סיפרה מה קורה איתה */
  S.context = txt;
  moment({ action: 'talk', layer: S.dim, reaction: null, meta: { text: txt } });
  S.guide = `רשמתי שאת "${esc(txt)}". אזכור מה עבד לך ברגע כזה. בואי נמשיך להקשיב.`;
  if (S.screen === 'build') renderBuild(); else render();
}
function sendText() { const i = document.getElementById('say'); const v = i.value; i.value = ''; i.blur(); handleText(v); }
let rec = null;
function micSupported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
function toggleMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
  const b = document.getElementById('mic');
  if (rec) { rec.stop(); return; }
  rec = new SR(); rec.lang = 'he-IL'; rec.interimResults = true; rec.maxAlternatives = 1;
  const i = document.getElementById('say'); b.classList.add('on'); i.placeholder = 'מקשיב…';
  rec.onresult = e => { i.value = Array.from(e.results).map(r => r[0].transcript).join(''); };
  rec.onend = () => { b.classList.remove('on'); i.placeholder = 'תכתבי או תגידי לי…'; rec = null; if (i.value.trim()) sendText(); };
  rec.onerror = () => { b.classList.remove('on'); rec = null; };
  try { rec.start(); } catch (e) { rec = null; b.classList.remove('on'); }
}

/* ===================== RESULT – המדריך ===================== */
function similarity(a, b) {
  let s = 0; if (a.groove === b.groove) s += 3; s += Math.max(0, 2 - Math.abs(a.bpm - b.bpm) / 20); if (a.mood === b.mood) s += 2; if (a.vocal === b.vocal) s += 1;
  const pa = new Set(a.palette); s += 2 * b.palette.filter(p => pa.has(p)).length / Math.max(a.palette.length, b.palette.length);
  if (a.texture.some(x => b.texture.includes(x) && x !== 'none')) s += 1; return s;
}
const neighbors = id => (S.alts && S.alts.length ? S.alts.map(a => STYLE[a]).concat(STYLES.filter(s => s.id !== id && !S.alts.includes(s.id)).map(s => [s, similarity(STYLE[id], s)]).sort((a, b) => b[1] - a[1]).map(x => x[0])).slice(0, 3) : null) || STYLES.filter(s => s.id !== id).map(s => [s, similarity(STYLE[id], s)]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
/* כשנשארו כמה עולמות – בוחרים את מה שהכי קרוב למה שנבנה בפועל */
function fit(s, m) {
  let f = 0; if (s.groove === m.groove) f += 3; f -= Math.abs(s.bpm - m.bpm) / 15; if (s.mood === m.mood) f += 1.5; if (s.vocal === m.vocal) f += 1;
  f += m.palette.filter(p => s.palette.includes(p)).length * 1.2; if (s.texture.includes(m.texture)) f += 0.8;
  f -= Math.max(0, s.palette.length - m.palette.length) * 0.3; return f;
}
function finish() {
  const ranked = S.cands.map(id => [id, fit(STYLE[id], S.mix)]).sort((a, b) => b[1] - a[1]);
  const pick = ranked.length ? ranked[0][0] : STYLES[0].id; S.result = pick; S.screen = 'result';
  S.alts = ranked.slice(1, 4).map(r => r[0]);
  moment({ action: 'listen', layer: 'final', cell: pick, reaction: 'yes', meta: { cell_name: STYLE[pick].he, picks: S.picks } });
  render();
}
function showStyle(id, intro) {
  const s = STYLE[id];
  S.hist.push(JSON.stringify({ mix: S.mix, cands: S.cands, asked: S.asked, picks: S.picks, dim: S.dim }));
  S.mix = { groove: s.groove, bpm: s.bpm, mood: s.mood, palette: s.palette.slice(0, 2), texture: s.texture[0], vocal: s.vocal };
  S.cands = [id]; S.alts = []; S.asked = ['groove', 'palette', 'texture', 'mood', 'vocal']; S.result = id; S.screen = 'result'; S.intro = intro || null;
  moment({ action: 'listen', layer: 'final', cell: id, reaction: 'yes', meta: { cell_name: s.he, via: 'named' } });
  render();
}
let PL = null;
function renderResult() {
  const s = STYLE[S.result], nb = neighbors(s.id), chips = stackChips();
  $app.innerHTML = `
    <div class="top"><button class="back" onclick="goBack()">→ לשנות</button><button class="chip" onclick="S=freshState(S);render()">↺ לבנות מחדש</button></div>
    ${S.intro ? `<div class="guide">${esc(S.intro)}</div>` : ''}
    <div class="res">
      <div class="k">מה שבנית עכשיו קוראים לו</div>
      <div class="name">${s.he}</div><div class="en">${s.en}</div>
      <button class="stack big" id="stack" onclick="toggleStack()"><span class="eqs"><i></i><i></i><i></i></span> ${chips.map(esc).join(' · ')}</button>
      <div class="tell"><b>שימי לב:</b> ${s.tell}</div>
    </div>
    ${S.alts && S.alts.length ? `<div class="guide">היה צמוד בינו לבין <b>${STYLE[S.alts[0]].he}</b> – מה שבנית יושב בדיוק על הגבול. <a href="#" onclick="event.preventDefault();showStyle('${S.alts[0]}')" style="color:var(--ok)">לשמוע גם אותו ←</a></div>` : ''}
    <div class="pl" id="pl"><h2>ככה זה נשמע באמת</h2><div class="shim"></div></div>
    <div class="fb" id="fb"><button class="btn ok" onclick="feedback(true)">פגעת ✓</button><button class="btn ghost" onclick="feedback(false)">לא בדיוק</button></div>
    <div class="alt"><div class="k">קרובים לזה – אם תרצי לזוז קצת</div>
      <div class="nbs">${nb.map(n => `<button class="nb" onclick="showStyle('${n.id}')">${n.he}</button>`).join('')}</div></div>
    <div class="tiny">מחר זה יכול להיות משהו אחר לגמרי. ככה זה אמור לעבוד.</div>`;
  S.intro = null; loadPlaylist(s);
}
async function loadPlaylist(s) {
  const box = document.getElementById('pl'); PL = null;
  try {
    const r = await api('playlist', { q: s.q, s: s.seeds }); if (!document.getElementById('pl') || S.result !== s.id) return;
    PL = r; const tr = (r.tracks || []).slice(0, 8); if (!tr.length) throw 0;
    box.innerHTML = `<h2>ככה זה נשמע באמת</h2>${tr.map((t, i) => `
      <div class="tr" id="tr-${i}" onclick="playTr(${i})"><div class="cv">${t.cover ? `<img src="${esc(t.cover)}" alt="" onerror="this.remove()">` : ''}<span>▶</span></div>
      <div class="t"><b>${esc(t.title)}</b><span>${esc(t.artist)}</span></div>
      <a class="yt" href="${ytSearch(t.artist + ' ' + t.title)}" target="_blank" rel="noopener" onclick="event.stopPropagation();openYT(${i})">▶ יוטיוב</a></div>`).join('')}
      <a class="mix" href="${ytSearch(s.en + ' mix')}" target="_blank" rel="noopener">מיקס ${esc(s.he)} ביוטיוב ↗</a>`;
  } catch (e) { if (box) box.innerHTML = `<h2>ככה זה נשמע באמת</h2><div class="desc">לא הצלחתי לטעון שירים כרגע.</div><a class="mix" href="${ytSearch(s.en + ' mix')}" target="_blank" rel="noopener">מיקס ${esc(s.he)} ביוטיוב ↗</a>`; }
}
let audioEl = null;
function playTr(i) {
  const t = PL && PL.tracks[i]; if (!t || !t.preview) return; const key = 'tr' + i;
  if (nowKey === key) { stop(); audioEl && audioEl.pause(); return; }
  stop(); audioEl && audioEl.pause(); nowKey = key; document.getElementById('tr-' + i).classList.add('playing');
  if (!audioEl) audioEl = new Audio(); audioEl.src = t.preview; audioEl.currentTime = 0; const p = audioEl.play(); p && p.catch(() => {});
  window.__nowPlaying = key;
}
const _stop = stop; stop = function () { _stop(); if (audioEl) audioEl.pause(); window.__nowPlaying = null; };
function openYT(i) { const t = PL.tracks[i]; moment({ action: 'open', layer: 'final', cell: S.result, track_id: t.id, track_title: t.title, track_artist: t.artist, reaction: 'opened' }); }
function feedback(ok) {
  const fb = document.getElementById('fb');
  if (ok) { fb.innerHTML = `<div class="guide">רשמתי לי. ככה אני לומד אותך – רגע אחרי רגע.</div>`; return; }
  moment({ action: 'listen', layer: 'final', cell: S.result, reaction: 'no', meta: { cell_name: STYLE[S.result].he } });
  fb.innerHTML = `<div class="guide">תודה שאמרת. תגידי לי במילים מה חסר, או תנסי את אחד הקרובים למטה.</div>`;
  document.getElementById('say').focus();
}

/* ===================== TRUST ===================== */
async function renderTrust() {
  $app.innerHTML = `<div class="top"><button class="back" onclick="S.screen='build';render()">→ חזרה</button><span></span></div>
    <div class="res"><div class="k">תסמוך עליי</div><div class="desc">רגע, חושב…</div></div>`;
  let r = null; try { const c = nowCtx(); r = await api('trust', { u: UK, hour: String(c.local_hour), weekday: String(c.weekday), context: S.context || '' }); } catch (e) {}
  if (S.screen !== 'trust') return;
  const s = r && r.cell && STYLE[r.cell];
  moment({ action: 'trust', layer: 'ask', cell: s ? s.id : null, reaction: null, meta: { status: r ? r.status : 'offline' } });
  if (!s) {
    const msg = !r ? 'אין לי חיבור לזיכרון כרגע.' : r.status === 'unknown' ? r.message : 'עוד לא בנינו מספיק ביחד בשביל שאדע. בואי נבנה.';
    $app.querySelector('.res').innerHTML = `<div class="k">ביושר</div><div class="desc big">${esc(msg)}</div><button class="btn primary" onclick="S=freshState(S);render()">בואי נבנה ביחד</button>`;
    return;
  }
  $app.querySelector('.res').outerHTML = `<div class="res"><div class="k">${r.status === 'confident' ? 'מביא' : 'ניחוש – ואני אומר שזה ניחוש'}</div>
    <div class="name">${s.he}</div><div class="desc">${esc(r.message)}</div>
    <div class="fb"><button class="btn ok" onclick="trustFb('${s.id}',true)">פגעת ✓</button><button class="btn ghost" onclick="trustFb('${s.id}',false)">לא זה</button></div></div>
    <div class="pl" id="pl"><h2>הנה</h2><div class="shim"></div></div>`;
  S.result = s.id; S.mix = { groove: s.groove, bpm: s.bpm, mood: s.mood, palette: s.palette.slice(0, 2), texture: s.texture[0], vocal: s.vocal };
  loadPlaylist(s);
}
function trustFb(id, ok) {
  moment({ action: 'trust', layer: 'final', cell: id, reaction: ok ? 'yes' : 'no', meta: { cell_name: STYLE[id].he } });
  if (ok) { S.screen = 'result'; render(); } else { S = freshState(S); S.guide = 'בסדר. בואי נבנה מהביט, ואני אלמד.'; render(); }
}

/* ===================== BOOT ===================== */
document.addEventListener('touchend', function first() { ensureCtx(); document.removeEventListener('touchend', first); }, { passive: true });
document.getElementById('say').addEventListener('keydown', e => { if (e.key === 'Enter') sendText(); });
if (!micSupported()) document.getElementById('mic').style.display = 'none';
window.__S = () => S;
render(); loadMe().then(() => { if (S.screen === 'build' && !S.asked.length) renderBuild(); });
