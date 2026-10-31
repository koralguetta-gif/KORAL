// הסוכן החוקר: מנווט במסד הז׳אנרים (tadar_genres, מוויקינתונים) ומתחקר אותה דרך האוזן.
// בכל צעד: מסתכל במסד (look), ואז מציג 2–4 כיוונים עם שיר אמיתי לכל אחד (present), או מסיים (done).
import { sb, me, recentMoments, saveMoment, agentNote, agentBudgetOk } from "./memory.ts";

const KEY = (Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("api_antro") || "").trim();
type Track = { id: number; title: string; artist: string; preview: string; cover: string; link: string; duration: number };
type Deps = { playlist: (q: string, seeds: [string, string][], opts?: { strict?: boolean; alt?: string | null }) => Promise<{ tracks: Track[] }> };

// ההוראות, המודל וההגדרות יושבים ב־catalog.json באתר – שינוי = git push
let CFG: { prompt?: string; model?: string; effort?: string; t: number } | null = null;
async function cfg() {
  if (CFG && Date.now() - CFG.t < 3e5) return CFG;
  try {
    const j = await (await fetch("https://koralguetta-gif.github.io/KORAL/catalog.json", { headers: { "cache-control": "no-cache" } })).json();
    CFG = { prompt: j.explore_prompt, model: j.explore_model, effort: j.explore_effort, t: Date.now() };
  } catch { CFG = CFG ?? { t: Date.now() }; }
  return CFG;
}

const label = (g: any) => g.he ? `${g.he} (${g.en})` : g.en;
const deezerQuery = (en: string) => en.replace(/^music of (the )?(.+)$/i, "$2 music").replace(/ music$/i, "").trim();

async function lookGenre(input: { qid?: string; query?: string }) {
  if (input.query) {
    const q = input.query.replace(/[%_,()]/g, " ").trim().slice(0, 60);
    const { data } = await sb.from("tadar_genres").select("qid,en,he,sitelinks,parents").or(`en.ilike.%${q}%,he.ilike.%${q}%`).order("sitelinks", { ascending: false }).limit(15);
    return { matches: (data ?? []).map((g: any) => ({ qid: g.qid, name: label(g), popularity: g.sitelinks })) };
  }
  const qid = String(input.qid ?? "").replace(/[^Q0-9]/g, "");
  const { data: g } = await sb.from("tadar_genres").select("qid,en,he,sitelinks,parents").eq("qid", qid).maybeSingle();
  if (!g) return { error: "not found" };
  const [{ data: kids }, { data: pars }] = await Promise.all([
    sb.from("tadar_genres").select("qid,en,he,sitelinks").contains("parents", [qid]).order("sitelinks", { ascending: false }).limit(30),
    sb.from("tadar_genres").select("qid,en,he,sitelinks").in("qid", g.parents ?? []).limit(10),
  ]);
  const kidIds = (kids ?? []).map((k: any) => k.qid);
  const counts: Record<string, number> = {};
  if (kidIds.length) {
    const { data: gk } = await sb.from("tadar_genres").select("parents").overlaps("parents", kidIds).limit(2000);
    (gk ?? []).forEach((r: any) => r.parents.forEach((p: string) => { if (kidIds.includes(p)) counts[p] = (counts[p] ?? 0) + 1; }));
  }
  return {
    genre: { qid: g.qid, name: label(g), popularity: g.sitelinks },
    parents: (pars ?? []).map((p: any) => ({ qid: p.qid, name: label(p) })),
    children: (kids ?? []).map((k: any) => ({ qid: k.qid, name: label(k), popularity: k.sitelinks, subgenres: counts[k.qid] ?? 0 })),
  };
}

const TOOLS = [
  { name: "look", description: "מסתכל במסד הז׳אנרים. עם qid: הז׳אנר, ההורים שלו והילדים שלו (תתי־ז׳אנרים, ממוינים לפי פופולריות, עם מספר תתי־הז׳אנרים של כל אחד). עם query: חיפוש לפי שם באנגלית או בעברית.",
    input_schema: { type: "object", properties: { qid: { type: "string" }, query: { type: "string" } } } },
  { name: "present", description: "מציג לה 2–4 כיוונים להקשבה. לכל כיוון יתנגן שיר אמיתי מהז׳אנר. או done=true עם כיוון אחד – זו התוצאה.",
    input_schema: { type: "object", required: ["reply", "options"], properties: {
      reply: { type: "string", description: "משפט אחד בעברית, לשון נקבה" },
      options: { type: "array", items: { type: "object", required: ["label"], properties: {
        qid: { type: "string", description: "ז׳אנר מהמסד" }, query: { type: "string", description: "במקום qid: טעם בתוך ז׳אנר לחיפוש שירים – עידן, אווירה או אמן, באנגלית או בעברית (\"mizrahi 80s\", \"zohar argov\", \"מזרחית שמחה\")" }, label: { type: "string", description: "שם קצר בעברית" }, hint: { type: "string", description: "עד 6 מילים: מה מרגישים" } } } },
      done: { type: "boolean" },
      remember: { type: ["string", "null"] } } } },
];

type Step = { reply?: string; options?: { qid: string; label: string }[]; chose?: string | null; said?: string | null; none?: boolean };
type Body = { user_key: string; family?: string | null; start?: string | null; history?: Step[]; text?: string | null; played?: number[]; local_hour?: number; weekday?: number; tz?: string; context?: string | null };

async function claude(c: { model: string; effort: string }, system: string, messages: any[]) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: c.model, max_tokens: 4000, output_config: { effort: c.effort }, system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], tools: TOOLS, tool_choice: { type: "auto" }, messages }),
  });
  if (!r.ok) throw new Error(`claude ${r.status} ${(await r.text()).slice(0, 300)}`);
  return await r.json();
}

async function sampleTrack(deps: Deps, o: { qid?: string; query?: string }, played: Set<number>) {
  // כיוון יכול להיות ז׳אנר מהמסד (qid), או "טעם" חופשי בתוך ז׳אנר (query) – עידן, אווירה, אמן
  const { data: g } = o.qid ? await sb.from("tadar_genres").select("qid,en,he").eq("qid", String(o.qid)).maybeSingle() : { data: null };
  let pl: { tracks: Track[] } = { tracks: [] };
  if (o.query) {
    pl = await deps.playlist(String(o.query).slice(0, 60), [], { strict: true }).catch(() => ({ tracks: [] as Track[] }));
    if (!pl.tracks?.length) pl = await deps.playlist(String(o.query).slice(0, 60), []).catch(() => ({ tracks: [] as Track[] }));
  } else if (g) {
    pl = await deps.playlist(deezerQuery(g.en), [], { strict: true, alt: g.he ? g.he.replace(/^מוזיק(ה|ת) /, "") : null }).catch(() => ({ tracks: [] as Track[] }));
    await sb.from("tadar_genres").update({ deezer_ok: (pl.tracks ?? []).some((t) => t.preview), updated_at: new Date().toISOString() }).eq("qid", g.qid);
  }
  const tracks = (pl.tracks ?? []).filter((t) => t.preview);
  if (!tracks.length) return null;
  const fresh = tracks.filter((t) => !played.has(t.id));
  const pickFrom = fresh.length ? fresh.slice(0, 5) : tracks;
  return { genre: g ?? { qid: "q:" + String(o.query), en: String(o.query), he: null }, track: pickFrom[Math.floor(Math.random() * pickFrom.length)], tracks };
}

export async function explore(b: Body, deps: Deps) {
  if (KEY.length < 20) return { error: "no key" };
  const u = b.user_key;
  if (!(await agentBudgetOk(u))) return { error: "budget", reply: "חקרנו המון היום – בואי נמשיך מחר." };
  const c = await cfg();
  const conf = { model: Deno.env.get("EXPLORE_MODEL") || c.model || "claude-sonnet-5-5", effort: c.effort || "medium" };
  const system = c.prompt || "אתה חבר שמתחקר את קורל דרך האוזן ומנווט במסד ז׳אנרים. השתמש ב־look ואז present. עברית, משפט אחד.";
  const played = new Set((b.played ?? []).filter((n) => typeof n === "number"));

  const [mem, recent] = await Promise.all([me(u).catch(() => null), recentMoments(u, 25).catch(() => [])]);
  const hist = (b.history ?? []).slice(-12).map((s, i) => {
    const opts = (s.options ?? []).map((o: any) => `${o.label} [${o.qid}]`).join(" / ");
    const act = s.chose ? `בחרה: ${(s.options ?? []).find((o) => o.qid === s.chose)?.label ?? s.chose} [${s.chose}]` : s.none ? "אמרה: אף אחד מאלה" : "";
    return `${i + 1}. הצגת: ${opts}${act ? " → " + act : ""}${s.said ? ` · אמרה: "${String(s.said).slice(0, 200)}"` : ""}`;
  }).join("\n");
  const DAY = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  const user = [
    `עכשיו: ${b.weekday != null ? "יום " + DAY[b.weekday] : ""} בשעה ${b.local_hour ?? "?"}.`,
    mem?.notes?.length ? `מה אני כבר יודע עליה:\n- ${mem.notes.map((n: any) => n.note).join("\n- ")}` : "עוד אין לי הערות עליה – אני לא מכיר אותה עדיין.",
    recent.length ? `רגעים אחרונים:\n${recent.slice(0, 15).join("\n")}` : "",
    b.family ? `הביט שבחרה בהתחלה: ${b.family}` : "",
    b.start ? `נקודת התחלה: ${b.start}` : "",
    hist ? `החקירה עד עכשיו:\n${hist}` : "זו תחילת החקירה.",
    b.text ? `מה שהיא אמרה עכשיו: "${String(b.text).slice(0, 400)}"` : "",
    "עכשיו: תסתכל במסד ותציג את הצעד הבא.",
  ].filter(Boolean).join("\n\n");

  const messages: any[] = [{ role: "user", content: user }];
  let usage: any[] = [];
  for (let turn = 0; turn < 7; turn++) {
    const res = await claude(conf, system, messages);
    usage.push(res.usage);
    messages.push({ role: "assistant", content: res.content });
    const calls = (res.content ?? []).filter((x: any) => x.type === "tool_use");
    if (!calls.length) {
      const txt = (res.content ?? []).filter((x: any) => x.type === "text").map((x: any) => x.text).join(" ").trim();
      return { reply: txt || "רגע, משהו התבלבל לי. נסי שוב.", options: [], done: false };
    }
    const pres = calls.find((x: any) => x.name === "present");
    if (pres) {
      const inp = pres.input ?? {};
      const opts = (Array.isArray(inp.options) ? inp.options : []).slice(0, 4);
      const filled = (await Promise.all(opts.map(async (o: any) => {
        const s = await sampleTrack(deps, { qid: o.qid ? String(o.qid) : undefined, query: o.query ? String(o.query) : undefined }, played).catch(() => null);
        return s ? { qid: s.genre.qid, query: o.query ?? null, label: String(o.label || s.genre.he || s.genre.en).slice(0, 40), hint: String(o.hint ?? "").slice(0, 60), en: s.genre.en, he: s.genre.he, track: s.track, tracks: inp.done ? s.tracks.slice(0, 10) : undefined } : null;
      }))).filter(Boolean) as any[];
      const missing = opts.length - filled.length;
      if (!filled.length || (!inp.done && filled.length < 2 && turn < 5)) {
        // אין שירים לכיוונים האלה – מבקשים מהסוכן כיוונים אחרים
        messages.push({ role: "user", content: [
          ...calls.map((x: any) => ({ type: "tool_result", tool_use_id: x.id, content: x.name === "present" ? `ל־${missing} מהכיוונים אין שירים להשמיע ב־Deezer. תבחר כיוונים אחרים (ז׳אנרים מוכרים יותר או אחים שלהם).` : "skipped" })),
        ] });
        continue;
      }
      const remember = typeof inp.remember === "string" && inp.remember.trim() ? inp.remember.trim() : null;
      if (remember) await agentNote(u, remember).catch(() => {});
      await saveMoment({ user_key: u, action: "talk", layer: "explore", context: b.context ?? b.text ?? null, local_hour: b.local_hour ?? null, weekday: b.weekday ?? null, tz: b.tz ?? null,
        meta: { agent: "1", explore: "1", text: b.text ?? null, reply: inp.reply, options: filled.map((f) => ({ qid: f.qid, label: f.label })), done: !!inp.done, model: conf.model, usage } }).catch(() => {});
      return { reply: String(inp.reply ?? "").slice(0, 300), options: filled, done: !!inp.done && filled.length >= 1, remember };
    }
    // look calls
    const results = await Promise.all(calls.map(async (x: any) => ({ type: "tool_result", tool_use_id: x.id, content: JSON.stringify(x.name === "look" ? await lookGenre(x.input ?? {}).catch((e) => ({ error: String(e) })) : { error: "unknown tool" }) })));
    messages.push({ role: "user", content: results });
  }
  return { reply: "הלכתי לאיבוד במפה לרגע. נסי שוב.", options: [], done: false };
}
