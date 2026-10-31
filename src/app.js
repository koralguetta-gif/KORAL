/* ===================== VERSION & ERRORS ===================== */
const VERSION = 'v6';
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
const ytSearch = q => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

/* ===================== ONE PLAYER FOR EVERYTHING ===================== */
/* לופים מרונדרים וקטעי שירים אמיתיים עוברים באותו נגן – הדרך האמינה ביותר לנגן באייפון */
const aud = new Audio(); aud.setAttribute('playsinline', ''); aud.preload = 'auto';
let nowKey = null, clipStart = 0;
aud.addEventListener('timeupdate', () => { if (!aud.loop && clipStart && aud.currentTime > clipStart + 15) { try { aud.currentTime = clipStart; } catch (e) {} } });
aud.addEventListener('ended', () => { if (!aud.loop && nowKey) { try { aud.currentTime = clipStart; aud.play(); } catch (e) {} } });
aud.addEventListener('error', () => { if (nowKey) { alertish('הקטע לא נטען – נסי שוב'); stop(); } });
function playURL(url, key, isClip) {
  aud.loop = !isClip; clipStart = isClip ? 5 : 0;
  if (aud.src !== url) aud.src = url;
  const go = () => { try { aud.currentTime = clipStart; } catch (e) {} };
  if (aud.readyState >= 1) go(); else aud.addEventListener('loadedmetadata', go, { once: true });
  const p = aud.play(); if (p && p.catch) p.catch(e => { if (e.name !== 'AbortError') alertish('הדפדפן חסם את הצליל – לחצי שוב'); });
  nowKey = key; window.__nowPlaying = key;
}
function stop() { try { aud.pause(); } catch (e) {} nowKey = null; window.__nowPlaying = null; document.querySelectorAll('.playing').forEach(e => e.classList.remove('playing')); }
let primed = false;
function prime() { if (primed) return; primed = true; try { aud.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='; const p = aud.play(); p && p.catch(() => {}); } catch (e) {} }
document.addEventListener('touchstart', prime, { once: true, passive: true }); document.addEventListener('mousedown', prime, { once: true });

/* ===================== THE TREE ===================== */
const median = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor((b.length - 1) / 2)]; };
const majority = a => { const m = {}; a.forEach(x => m[x] = (m[x] || 0) + 1); return Object.entries(m).sort((x, y) => y[1] - x[1])[0][0]; };
const felt = s => s.groove === 'half' ? s.bpm / 2 : s.bpm;
function groupBy(ids, fn) { const g = {}; ids.forEach(id => { const k = fn(STYLE[id]); (g[k] = g[k] || []).push(id); }); return g; }
function tempoGroups(ids) {
  const arr = [...ids].sort((a, b) => STYLE[a].bpm - STYLE[b].bpm), bp = id => STYLE[id].bpm;
  if (bp(arr[arr.length - 1]) - bp(arr[0]) < 15) return [];
  let groups = [[arr[0]]];
  for (let i = 1; i < arr.length; i++) { if (bp(arr[i]) - bp(arr[i - 1]) >= 10) groups.push([arr[i]]); else groups[groups.length - 1].push(arr[i]); }
  while (groups.length > 3) { let bi = 0, bg = 1e9; for (let i = 0; i < groups.length - 1; i++) { const g = bp(groups[i + 1][0]) - bp(groups[i][groups[i].length - 1]); if (g < bg) { bg = g; bi = i; } } groups.splice(bi, 2, groups[bi].concat(groups[bi + 1])); }
  if (groups.length === 1) { const k = arr.length >= 6 ? 3 : 2, size = Math.ceil(arr.length / k); groups = []; for (let i = 0; i < arr.length; i += size) groups.push(arr.slice(i, i + size));
    for (let i = 1; i < groups.length; i++) while (groups[i].length > 1 && bp(groups[i][0]) === bp(groups[i - 1][groups[i - 1].length - 1])) groups[i - 1].push(groups[i].shift()); }
  return groups.filter(g => g.length);
}
const TEMPO_NAMES = { 2: ['רגוע יותר', 'מהיר יותר'], 3: ['רגוע', 'זורם', 'מהיר'] };
/* כל סבב מחזיר אפשרויות: {v, n, d, ids, kind:'loop'|'clip', mix?, rep?} */
function optionsFor(dim) {
  const c = S.cands, base = { mood: majority(c.map(id => STYLE[id].mood)) };
  const loop = ids => ({ groove: majority(ids.map(id => STYLE[id].groove)), bpm: Math.round(median(ids.map(id => STYLE[id].bpm))), bass: S.mix.bass || majority(ids.map(id => STYLE[id].bass)), mood: majority(ids.map(id => STYLE[id].mood)) });
  if (dim === 'groove') {
    const g = groupBy(c, s => s.family);
    return Object.keys(FAMILIES).filter(f => g[f]).map(f => ({ v: f, n: FAMILIES[f].n, d: FAMILIES[f].d, ids: g[f], kind: 'loop', mix: Object.assign(loop(g[f]), { bass: majority(g[f].map(id => STYLE[id].bass)) }, f === 'none' ? { palette: [majority(g[f].map(id => STYLE[id].palette[0]))] } : {}) }));
  }
  if (dim === 'tempo') {
    const gs = tempoGroups(c); if (gs.length < 2) return [];
    return gs.map((ids, i) => ({ v: 't' + i, n: TEMPO_NAMES[gs.length][i], d: `בערך ${Math.round(median(ids.map(id => felt(STYLE[id]))))} פעימות בדקה`, ids, kind: 'loop', mix: Object.assign({}, S.mix, { bpm: Math.round(median(ids.map(id => STYLE[id].bpm))), groove: majority(ids.map(id => STYLE[id].groove)) }) }));
  }
  if (dim === 'bass') {
    const g = groupBy(c, s => s.bass); if (Object.keys(g).length < 2) return [];
    return Object.entries(g).map(([b, ids]) => ({ v: b, n: LABELS.bass[b].n, d: LABELS.bass[b].d, ids, kind: 'loop', mix: Object.assign({}, S.mix, { bass: b, groove: majority(ids.map(id => STYLE[id].groove)), bpm: Math.round(median(ids.map(id => STYLE[id].bpm))) }) }));
  }
  if (dim === 'sound') {
    const g = groupBy(c, s => s.palette[0]); if (Object.keys(g).length < 2) return [];
    return Object.entries(g).map(([p, ids]) => ({ v: p, n: LABELS.palette[p].n, d: LABELS.palette[p].d, ids, kind: 'clip', rep: ids[0] }));
  }
  if (dim === 'songs') {
    if (c.length > 4) return [];
    const per = c.length === 1 ? 4 : c.length === 2 ? 2 : 1, out = [];
    c.forEach(id => STYLE[id].seeds.slice(0, per).forEach(sd => out.push({ v: 's' + out.length, n: sd[1], d: sd[0] + (c.length > 1 ? ' · ' + STYLE[id].he : ''), ids: [id], kind: 'clip', seed: sd })));
    return out.slice(0, 4);
  }
  if (dim === 'vocal') {
    const g = groupBy(c, s => s.vocal); if (Object.keys(g).length < 2) return [];
    return Object.entries(g).map(([v, ids]) => ({ v, n: LABELS.vocal[v].n, d: LABELS.vocal[v].d, ids, kind: 'clip', rep: ids[0] }));
  }
  return [];
}
function nextDim() {
  if (!S.asked.includes('groove')) { if (optionsFor('groove').length >= 2) return 'groove'; S.asked = [...S.asked, 'groove']; }
  if (S.asked.length >= 5) return null;
  if (S.cands.length >= 2 && S.asked.length < 4) {
    const fam = STYLE[S.cands[0]].family;
    for (const d of FAMILIES[fam].order) if (!S.asked.includes(d) && optionsFor(d).length >= 2) return d;
  }
  /* תמיד מסיימים בבחירה בין שירים אמיתיים – לא קופצים לתוצאה בלי לשמוע */
  if (!S.asked.includes('songs') && optionsFor('songs').length >= 2) return 'songs';
  return null;
}
const ROUND_TEXT = {
  groove: { q: 'איזה ביט הגוף שלך רוצה עכשיו?', sub: 'רק תופים ובס. תקשיבי עם הגוף, לא עם הראש.' },
  tempo:  { q: 'באיזו מהירות?', sub: 'אותו ביט. רק הדופק משתנה.' },
  bass:   { q: 'מה הבס עושה?', sub: 'אותו ביט ואותה מהירות. כאן נפרדים סגנונות קרובים.' },
  sound:  { q: 'איזה צליל?', sub: 'עכשיו קטעים אמיתיים. סמכי על השנייה הראשונה.' },
  vocal:  { q: 'ועל כל זה – מילים?', sub: 'קטעים אמיתיים. השכבה האחרונה.' },
  songs:  { q: 'איזה מאלה מרגיש כמו עכשיו?', sub: 'שירים אמיתיים. הקשיבי כמה שניות לכל אחד.' },
};

/* ===================== STATE & SCREENS ===================== */
let S;
const freshState = (keep = {}) => ({ screen: 'build', dim: 'groove', cands: STYLES.map(s => s.id), asked: [], picks: [], mix: {}, opts: [], played: {}, hist: [], offset: 0, song: null, result: null, alts: [], guide: keep.guide || null, context: keep.context || null, chat: keep.chat || [] });
S = freshState();
const $app = document.getElementById('app');
function render() { stop(); if (S.screen === 'build') renderBuild(); else if (S.screen === 'result') renderResult(); else if (S.screen === 'trust') renderTrust(); window.scrollTo(0, 0); }
function alertish(m) { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2000); }

const CLIPS = {};
const clipFor = id => CLIPS[id] || (CLIPS[id] = api('pick', { s: STYLE[id].seeds }).then(t => { if (!t || !t.preview) throw new Error('no preview'); return t; }).catch(e => { delete CLIPS[id]; throw e; }));
const SEEDCLIP = {};
const seedClip = sd => SEEDCLIP[sd.join('|')] || (SEEDCLIP[sd.join('|')] = api('pick', { s: [sd] }).then(t => { if (!t || !t.preview) throw new Error('no preview'); return t; }).catch(e => { delete SEEDCLIP[sd.join('|')]; throw e; }));
/* "אף אחד מאלה": עוד שירים אמיתיים מאותו עולם, לא יציאה ממנו */
const PLAYLISTS = {};
const playlistFor = id => PLAYLISTS[id] || (PLAYLISTS[id] = api('playlist', { q: STYLE[id].q, s: STYLE[id].seeds }).catch(e => { delete PLAYLISTS[id]; throw e; }));
const songKey = (a, t) => (a + '|' + t).toLowerCase().replace(/\(.*?\)/g, '').trim();
async function moreSongs() {
  const ids = S.cands.slice(0, 4), shown = new Set(S.shownSongs || []);
  (S.opts || []).forEach(o => o.seed && shown.add(songKey(o.seed[0], o.seed[1])));
  sayGuide('<span class="think">מביא עוד שירים מהעולם הזה…</span>');
  const lists = await Promise.all(ids.map(id => playlistFor(id).then(r => (r.tracks || []).filter(t => t.preview && !shown.has(songKey(t.artist, t.title))).map(t => [id, t])).catch(() => [])));
  const out = []; for (let i = 0; out.length < 4 && lists.some(l => l[i]); i++) lists.forEach(l => { if (l[i] && out.length < 4) out.push(l[i]); });
  if (!out.length) { S.guide = 'אלה כל השירים שיש לי בעולם הזה. בואי נצא צעד אחד אחורה ונבחר כיוון קרוב.'; return S.hist.length ? goBack(true) : renderBuild(); }
  out.forEach(([, t]) => shown.add(songKey(t.artist, t.title)));
  S.shownSongs = [...shown];
  S.extra = out.map(([id, t], i) => ({ v: 'x' + (S.shownSongs.length) + i, n: t.title, d: t.artist + (ids.length > 1 ? ' · ' + STYLE[id].he : ''), ids: [id], kind: 'clip', url: t.preview, seed: [t.artist, t.title] }));
  S.guide = 'עוד כמה מאותו עולם:'; S.dim = 'songs'; renderBuild();
}
const PREP = {};
function prepare(o) { if (PREP[o.v + S.dim]) return PREP[o.v + S.dim]; return (PREP[o.v + S.dim] = o.url ? Promise.resolve({ url: o.url }) : o.kind === 'loop' ? renderMix(o.mix).then(url => ({ url })) : (o.seed ? seedClip(o.seed) : clipFor(o.rep)).then(t => ({ url: t.preview, track: o.seed ? null : t }))); }

function renderBuild() {
  const dim = S.dim, R = ROUND_TEXT[dim], all = dim === 'songs' && S.extra ? S.extra : optionsFor(dim);
  S.opts = all; Object.keys(PREP).forEach(k => delete PREP[k]);
  const shown = all.length > 4 && dim !== 'groove' ? all.slice(S.offset, S.offset + 4) : all;
  const first = !S.asked.length;
  const greet = !ME ? '' : !ME.yes ? 'עוד לא מכיר אותך. אז לא אנחש – נתחיל מהביט, ואלמד ממה שתבחרי.' : `בחרנו ביחד ${ME.yes === 1 ? 'פעם אחת' : ME.yes + ' פעמים'}. אני מתחיל להכיר אותך.`;
  $app.innerHTML = `
    <div class="top">${S.hist.length ? `<button class="back" onclick="goBack()">→ אחורה</button>` : `<span class="tiny" style="margin:0">${VERSION}</span>`}
      <button class="chip" onclick="S.screen='trust';render()">🤝 תסמוך עליי</button></div>
    ${first && greet ? `<div class="hello">${esc(greet)}</div>` : ''}
    <div class="dots">${[0, 1, 2, 3, 4].map(i => `<i class="${i <= S.asked.length ? 'on' : ''}"></i>`).join('')}</div>
    ${S.picks.length ? `<div class="trail">${S.picks.map(p => esc(p.n)).join(' · ')}</div>` : ''}
    <div class="q">${R.q}</div><div class="sub">${R.sub}</div>
    <div class="guide" id="agent" style="${S.guide ? '' : 'display:none'}">${S.guide || ''}</div>
    <div class="opts ${dim === 'groove' ? 'grid' : ''}">${shown.map(o => `
      <div class="opt loading" id="o-${o.v}" onclick="tap('${o.v}')">
        <div class="row"><div class="play"><span class="tri">▶</span><span class="eq"><i></i><i></i><i></i><i></i></span></div>
        <div style="min-width:0;flex:1"><div class="name">${esc(o.n)}</div><div class="desc">${esc(o.d)}</div>${o.kind === 'clip' ? `<div class="trk" id="k-${o.v}"></div>` : ''}</div></div>
        <button class="choose" onclick="event.stopPropagation();choose('${o.v}')">זה ✓</button></div>`).join('')}
    </div>
    ${all.length > 4 && dim !== 'groove' ? `<button class="btn ghost" onclick="S.offset=(S.offset+4)%${all.length};renderBuild()">עוד אפשרויות ↻</button>` : ''}
    ${dim === 'songs' ? `<button class="btn ghost" onclick="moreSongs()">אף אחד מאלה – עוד שירים ↻</button>` : ''}
    <div class="tiny">${S.cands.length > 1 ? `עוד ${S.cands.length} סגנונות פתוחים` : 'כמעט שם'}</div>`;
  S.guide = null;
  const at = S.dim + S.asked.length;
  (async () => { for (const o of shown) { try { const r = await prepare(o); if (S.dim + S.asked.length !== at) return; const el = document.getElementById('o-' + o.v); if (!el) continue; el.classList.remove('loading');
        if (r.track) { const k = document.getElementById('k-' + o.v); if (k) k.textContent = `${r.track.artist} · ${r.track.title}`; } }
      catch (e) { const el = document.getElementById('o-' + o.v); if (el) { el.classList.remove('loading'); el.classList.add('broken'); } } } })();
}
async function tap(v) {
  prime();
  if (nowKey === v) { stop(); return; }
  const o = S.opts.find(x => x.v === v); if (!o) return;
  stop(); const el = document.getElementById('o-' + v); el.classList.add('playing'); S.played[v] = 1;
  try { const r = await prepare(o); if (!el.classList.contains('playing')) return; playURL(r.url, v, o.kind === 'clip'); }
  catch (e) { el.classList.remove('playing'); alertish(o.kind === 'clip' ? 'לא מצאתי קטע לזה כרגע' : 'לא הצלחתי לבנות את הצליל'); }
}
function choose(v) {
  const o = S.opts.find(x => x.v === v); if (!o) return;
  const dim = S.dim;
  Object.keys(S.played).concat(S.played[v] ? [] : [v]).forEach(k => { const ok = S.opts.find(x => x.v === k); moment({ action: 'listen', layer: dim, reaction: k === v ? 'yes' : 'no', meta: { dim, val: k, label: ok ? ok.n : k } }); });
  S.hist.push(JSON.stringify({ dim: S.dim, cands: S.cands, asked: S.asked, picks: S.picks, mix: S.mix }));
  S.cands = o.ids; S.asked = [...S.asked, dim]; S.picks = [...S.picks, { dim, v, n: o.n }];
  if (o.mix) S.mix = o.mix;
  if (o.seed) S.song = o.seed;
  S.extra = null; S.shownSongs = [];
  S.played = {}; S.offset = 0;
  const nd = nextDim(); if (!nd) return finish(); S.dim = nd; render();
}
function goBack(keepGuide) { const h = S.hist.pop(); if (!h) return; const g = S.guide; Object.assign(S, JSON.parse(h)); S.screen = 'build'; S.played = {}; S.offset = 0; S.extra = null; S.shownSongs = []; if (keepGuide === true) S.guide = g; render(); }

/* ===================== WORDS & VOICE ===================== */
function handleText(raw) {
  const txt = (raw || '').trim(); if (!txt) return; const t = txt.toLowerCase();
  const hits = []; STYLES.forEach(s => [...s.al, s.he].forEach(a => { const al = a.toLowerCase(), i = t.indexOf(al); if (i >= 0 && !/[א-תa-z]/.test(t[i + al.length] || ' ')) hits.push([s, al.length]); }));
  /* שם סגנון קצר ("טכנו") – ישר לשם, בלי לחכות למוח */
  if (hits.length && txt.length <= 25) { const s = hits.sort((a, b) => b[1] - a[1])[0][0]; moment({ action: 'talk', layer: S.dim, meta: { text: txt, named: s.id } }); return showStyle(s.id, `${s.he}. ככה הוא בנוי:`); }
  askAgent(txt);
}
let thinking = false;
function sayGuide(html) { const g = document.getElementById('agent'); if (g) { g.innerHTML = html; g.style.display = 'block'; } else { S.guide = html; if (S.screen === 'build') renderBuild(); else render(); } }
async function askAgent(txt) {
  if (thinking) return; thinking = true;
  S.chat.push({ who: 'her', text: txt });
  if (S.screen === 'trust') { S.screen = 'build'; render(); }
  sayGuide(`<span class="her">${esc(txt)}</span><span class="think">רגע, חושב…</span>`);
  let r = null;
  try {
    const res = await fetch(API_BASE + '/api/talk', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ user_key: UK, text: txt, context: S.context, chat: S.chat.slice(-7, -1),
      state: { screen: S.screen, cands: S.cands, picks: S.picks.map(p => p.n), rounds: S.asked.length, result: S.screen === 'result' && STYLE[S.result] ? STYLE[S.result].he : null, result_id: S.screen === 'result' ? S.result : null } }, nowCtx())) });
    r = res.ok ? await res.json() : null;
  } catch (e) {}
  thinking = false;
  if (!r || r.error || !r.reply) { /* בלי מוח – לפחות זוכרים את ההקשר */
    S.context = txt; moment({ action: 'talk', layer: S.dim, meta: { text: txt } });
    return sayGuide(`רשמתי שאת "${esc(txt)}". בואי נמשיך להקשיב.`);
  }
  S.chat.push({ who: 'me', text: r.reply }); S.context = txt;
  const reply = esc(r.reply) + (r.remember ? `<span class="mem">רשמתי לי: ${esc(r.remember)}</span>` : '');
  if (r.action === 'show' && r.ids[0] && STYLE[r.ids[0]]) { S.guideNext = reply; return showStyle(r.ids[0]); }
  if (r.action === 'more') {
    sayGuide(reply);
    if (S.screen === 'result') { S.hist.push(JSON.stringify({ dim: S.dim, cands: S.cands, asked: S.asked, picks: S.picks, mix: S.mix })); S.screen = 'build'; S.cands = [S.result]; S.dim = 'songs'; S.asked = S.asked.filter(d => d !== 'songs').concat('songs'); }
    if (S.dim === 'songs' || S.cands.length <= 4) { S.dim = 'songs'; return moreSongs().then(() => sayGuide(reply)); }
    return;
  }
  if (r.action === 'narrow') {
    const ids = r.ids.filter(id => STYLE[id]); if (ids.length >= 2) {
      S.hist.push(JSON.stringify({ dim: S.dim, cands: S.cands, asked: S.asked, picks: S.picks, mix: S.mix }));
      S.screen = 'build'; S.cands = ids; S.asked = []; S.picks = []; S.mix = {}; S.played = {}; S.offset = 0; S.extra = null; S.shownSongs = [];
      const nd = nextDim(); S.guide = reply; if (!nd) return finish(); S.dim = nd; return render();
    }
  }
  sayGuide(reply);
}
function sendText() { const i = document.getElementById('say'); const v = i.value; i.value = ''; i.blur(); handleText(v); }
let rec = null;
function toggleMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return; const b = document.getElementById('mic'), i = document.getElementById('say');
  if (rec) { rec.stop(); return; }
  rec = new SR(); rec.lang = 'he-IL'; rec.interimResults = true; b.classList.add('on'); i.placeholder = 'מקשיב…';
  rec.onresult = e => { i.value = Array.from(e.results).map(r => r[0].transcript).join(''); };
  rec.onend = () => { b.classList.remove('on'); i.placeholder = 'תכתבי או תגידי לי…'; rec = null; if (i.value.trim()) sendText(); };
  rec.onerror = () => { b.classList.remove('on'); rec = null; };
  try { rec.start(); } catch (e) { rec = null; b.classList.remove('on'); }
}

/* ===================== RESULT – המדריך ===================== */
function fit(s) { let f = 0; S.picks.forEach(p => { if (p.dim === 'tempo' || p.dim === 'groove') f -= Math.abs(s.bpm - (S.mix.bpm || s.bpm)) / 20; }); return f; }
function finish() {
  const ranked = S.cands.map(id => [id, fit(STYLE[id])]).sort((a, b) => b[1] - a[1]);
  S.result = ranked[0][0]; S.alts = ranked.slice(1, 3).map(r => r[0]); S.screen = 'result';
  moment({ action: 'listen', layer: 'final', cell: S.result, reaction: 'yes', meta: { cell_name: STYLE[S.result].he, picks: S.picks.map(p => p.n) } });
  render();
}
function showStyle(id, intro) {
  const s = STYLE[id];
  S.hist.push(JSON.stringify({ dim: S.dim, cands: S.cands, asked: S.asked, picks: S.picks, mix: S.mix }));
  S.cands = [id]; S.alts = []; S.result = id; S.screen = 'result'; S.intro = intro || null;
  S.picks = [{ dim: 'groove', n: FAMILIES[s.family].n }, { dim: 'bass', n: LABELS.bass[s.bass].n }, { dim: 'sound', n: LABELS.palette[s.palette[0]].n }, { dim: 'vocal', n: LABELS.vocal[s.vocal].n }];
  S.mix = { groove: s.groove, bpm: s.bpm, bass: s.bass, mood: s.mood };
  moment({ action: 'listen', layer: 'final', cell: id, reaction: 'yes', meta: { cell_name: s.he, via: 'named' } });
  render();
}
const neighbors = id => { const s = STYLE[id]; return STYLES.filter(x => x.id !== id && !S.alts.includes(x.id)).map(x => [x, (x.family === s.family ? 3 : 0) - Math.abs(felt(x) - felt(s)) / 15 + (x.bass === s.bass ? 1 : 0) + (x.palette[0] === s.palette[0] ? 1 : 0)]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]); };
let PL = null;
function renderResult() {
  const s = STYLE[S.result], nb = S.alts.map(a => STYLE[a]).concat(neighbors(s.id)).slice(0, 3);
  $app.innerHTML = `
    <div class="top"><button class="back" onclick="goBack()">→ לשנות</button><button class="chip" onclick="S=freshState(S);render()">↺ מההתחלה</button></div>
    <div class="guide" id="agent" style="${S.intro || S.guideNext ? '' : 'display:none'}">${S.guideNext || esc(S.intro || '')}</div>
    <div class="res"><div class="k">מה שבחרת עכשיו קוראים לו</div>
      <div class="name">${s.he}</div><div class="en">${s.en}</div>
      <div class="trail" style="margin:12px 0 0">${S.picks.map(p => esc(p.n)).join(' · ')}</div>
      <button class="stack" id="stack" onclick="playStack()"><span class="eqs"><i></i><i></i><i></i></span> הביט שבחרת</button>
      <div class="tell"><b>שימי לב:</b> ${s.tell}</div></div>
    ${S.alts.length ? `<div class="guide">היה צמוד גם ל<b>${STYLE[S.alts[0]].he}</b>. <a href="#" onclick="event.preventDefault();showStyle('${S.alts[0]}')" style="color:var(--ok)">לשמוע גם אותו ←</a></div>` : ''}
    <div class="pl" id="pl"><h2>ככה זה נשמע באמת</h2><div class="shim"></div></div>
    <div class="fb" id="fb"><button class="btn ok" onclick="feedback(true)">פגעת ✓</button><button class="btn ghost" onclick="feedback(false)">לא בדיוק</button></div>
    <div class="alt"><div class="k">קרובים לזה</div><div class="nbs">${nb.map(n => `<button class="nb" onclick="showStyle('${n.id}')">${n.he}</button>`).join('')}</div></div>
    <div class="tiny">מחר זה יכול להיות משהו אחר לגמרי. ככה זה אמור לעבוד.</div>`;
  S.intro = null; S.guideNext = null; loadPlaylist(s);
}
async function playStack() { const b = document.getElementById('stack'); if (nowKey === '_stack') { stop(); return; } stop(); b.classList.add('playing'); try { const url = await renderMix(S.mix); if (b.classList.contains('playing')) playURL(url, '_stack', false); } catch (e) { b.classList.remove('playing'); } }
async function loadPlaylist(s) {
  const box = document.getElementById('pl'); PL = null;
  try {
    const r = await api('playlist', { q: s.q, s: s.seeds }); if (!document.getElementById('pl') || S.result !== s.id) return;
    PL = r; if (S.song) { const n = x => String(x).toLowerCase().replace(/\(.*?\)/g, '').trim(), i = (r.tracks || []).findIndex(t => n(t.title).startsWith(n(S.song[1]))); if (i > 0) r.tracks.unshift(r.tracks.splice(i, 1)[0]); }
    const tr = (r.tracks || []).slice(0, 8); if (!tr.length) throw 0;
    box.innerHTML = `<h2>ככה זה נשמע באמת</h2>${tr.map((t, i) => `
      <div class="tr" id="tr-${i}" onclick="playTr(${i})"><div class="cv">${t.cover ? `<img src="${esc(t.cover)}" alt="" onerror="this.remove()">` : ''}<span>▶</span></div>
      <div class="t"><b>${esc(t.title)}</b><span>${esc(t.artist)}</span></div>
      <a class="yt" href="${ytSearch(t.artist + ' ' + t.title)}" target="_blank" rel="noopener" onclick="event.stopPropagation();openYT(${i})">▶ יוטיוב</a></div>`).join('')}
      <a class="mix" href="${ytSearch(s.en + ' mix')}" target="_blank" rel="noopener">מיקס ${esc(s.he)} ביוטיוב ↗</a>`;
  } catch (e) { if (box) box.innerHTML = `<h2>ככה זה נשמע באמת</h2><div class="desc">לא הצלחתי לטעון שירים כרגע.</div><a class="mix" href="${ytSearch(s.en + ' mix')}" target="_blank" rel="noopener">מיקס ${esc(s.he)} ביוטיוב ↗</a>`; }
}
function playTr(i) { const t = PL && PL.tracks[i]; if (!t || !t.preview) return; const key = 'tr' + i; if (nowKey === key) { stop(); return; } stop(); document.getElementById('tr-' + i).classList.add('playing'); playURL(t.preview, key, true); }
function openYT(i) { const t = PL.tracks[i]; moment({ action: 'open', layer: 'final', cell: S.result, track_id: t.id, track_title: t.title, track_artist: t.artist, reaction: 'opened' }); }
function feedback(ok) {
  const fb = document.getElementById('fb');
  if (ok) { fb.innerHTML = `<div class="guide">רשמתי לי. ככה אני לומד אותך – רגע אחרי רגע.</div>`; return; }
  moment({ action: 'listen', layer: 'final', cell: S.result, reaction: 'no', meta: { cell_name: STYLE[S.result].he } });
  fb.innerHTML = `<div class="guide">תודה שאמרת. תגידי לי במילים מה חסר – אני אכוון מחדש.</div>`; document.getElementById('say').focus();
}

/* ===================== TRUST ===================== */
async function renderTrust() {
  $app.innerHTML = `<div class="top"><button class="back" onclick="S.screen='build';render()">→ חזרה</button><span></span></div><div class="res"><div class="k">תסמוך עליי</div><div class="desc">רגע, חושב…</div></div>`;
  let r = null; try { const c = nowCtx(); r = await api('trust', { u: UK, hour: String(c.local_hour), weekday: String(c.weekday), context: S.context || '' }); } catch (e) {}
  if (S.screen !== 'trust') return;
  const s = r && r.cell && STYLE[r.cell];
  moment({ action: 'trust', layer: 'ask', cell: s ? s.id : null, meta: { status: r ? r.status : 'offline' } });
  if (!s) {
    const msg = !r ? 'אין לי חיבור לזיכרון כרגע.' : r.status === 'unknown' ? r.message : 'עוד לא בחרנו מספיק ביחד בשביל שאדע. בואי נקשיב.';
    $app.querySelector('.res').innerHTML = `<div class="k">ביושר</div><div class="desc big">${esc(msg)}</div><button class="btn primary" onclick="S=freshState(S);render()">בואי נקשיב ביחד</button>`; return;
  }
  S.result = s.id; S.alts = []; S.picks = [{ n: FAMILIES[s.family].n }]; S.mix = { groove: s.groove, bpm: s.bpm, bass: s.bass, mood: s.mood };
  S.screen = 'result'; S.intro = (r.status === 'confident' ? '' : 'ניחוש – ואני אומר שזה ניחוש. ') + r.message; render();
}

/* ===================== BOOT ===================== */
document.getElementById('say').addEventListener('keydown', e => { if (e.key === 'Enter') sendText(); });
if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) document.getElementById('mic').style.display = 'none';
window.__S = () => S; window.__player = aud;
render(); loadMe().then(() => { if (S.screen === 'build' && !S.asked.length) renderBuild(); });
