// בונה את catalog.json – הקטלוג וההוראות של הסוכן – מתוך styles.js ו־agent_prompt.md
const fs = require('fs'), path = require('path'), d = __dirname;
const { STYLES, LABELS, FAMILIES } = require(path.join(d, 'styles.js'));
const L = (k, v) => (LABELS[k] && LABELS[k][v] && LABELS[k][v].n) || v;
const lines = STYLES.map(s => [s.id, `${s.he} (${s.en})`, 'ביט: ' + FAMILIES[s.family].n, (s.groove === 'half' ? `${s.bpm} כתוב / ${s.bpm / 2} מורגש` : s.bpm) + ' bpm', 'בס: ' + L('bass', s.bass), 'צליל: ' + s.palette.map(p => L('palette', p)).join('/'), 'קול: ' + L('vocal', s.vocal), 'צבע: ' + L('mood', s.mood), '— ' + s.tell].join(' | '));
const out = { ids: STYLES.map(s => s.id), catalog: lines.join('\n'), prompt: fs.readFileSync(path.join(d, 'agent_prompt.md'), 'utf8'), model: process.env.AGENT_MODEL || null,
  actions: ['keep', 'narrow', 'show', 'more'],
  explore_prompt: fs.readFileSync(path.join(d, 'explore_prompt.md'), 'utf8'),
  explore_model: 'claude-sonnet-5-5',
  explore_effort: 'medium',
  tool: { name: 'respond', description: 'התשובה לקורל והפעולה על ההקשבה', input_schema: { type: 'object', required: ['reply', 'action'], properties: {
    reply: { type: 'string', description: 'משפט אחד בעברית' },
    action: { type: 'string', enum: ['keep', 'narrow', 'show', 'more'] },
    ids: { type: 'array', items: { type: 'string' }, description: 'ל־narrow: 3–10 מזהים. ל־show: מזהה אחד. ל־more ו־keep: ריק.' },
    remember: { type: ['string', 'null'] } } } } };
fs.writeFileSync(process.argv[2] || path.join(d, 'catalog.json'), JSON.stringify(out));
console.log('catalog.json', out.ids.length, 'styles');
