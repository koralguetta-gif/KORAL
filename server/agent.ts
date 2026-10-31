// הסוכן: המוח של החבר. מקבל מה שהיא אמרה + איפה היא עכשיו + מה הוא כבר יודע עליה,
// ומחזיר תשובה קצרה בעברית ופעולה אחת על העץ.
import { me, recentMoments, agentNote, saveMoment, agentBudgetOk } from "./memory.ts";

// המפתח נשמר ב־Supabase בשם api_antro; ANTHROPIC_API_KEY נתמך גם הוא
const KEY = (Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("api_antro") || "").trim();
// ברירת מחדל: Haiku 5.5 – מהיר וזול פי 20 מ־Sonnet. אפשר להחליף בלי קוד: סוד AGENT_MODEL ב־Supabase.
const models = (fromCatalog?: string | null) => [...new Set([Deno.env.get("AGENT_MODEL") || fromCatalog || "claude-haiku-5-5", "claude-sonnet-5-5"])];
export const agentReady = () => KEY.length > 20;

// הקטלוג נבנה מ־styles.js ומוגש מהאתר (catalog.json) – מקור אמת אחד לאפליקציה ולסוכן
// גם ההוראות (prompt) והמודל יושבים שם – שינוי בהתנהגות הסוכן = git push, בלי פריסה מחדש
let CAT: { ids: string[]; catalog: string; prompt?: string; model?: string | null; t: number } | null = null;
async function catalog() {
  if (CAT && Date.now() - CAT.t < 36e5) return CAT;
  const r = await fetch("https://koralguetta-gif.github.io/KORAL/catalog.json", { headers: { "cache-control": "no-cache" } });
  if (!r.ok) { if (CAT) return CAT; throw new Error("catalog " + r.status); }
  const j = await r.json(); CAT = { ids: j.ids, catalog: j.catalog, prompt: j.prompt, model: j.model, t: Date.now() }; return CAT;
}

const DAY = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const system = (CATALOG: string) => `אתה "החבר" באפליקציה של קורל לגילוי מוזיקה. מדריך, לא מורה. אכפת לך שיהיה לה טוב, ואתה ישר איתה.

איך האפליקציה עובדת: היא לא עונה על שאלונים – היא מקשיבה ובוחרת. קודם הביט (9 משפחות), אחר כך מהירות, מה הבס עושה, צליל, ובסוף מילים. מקסימום 5 סבבים, ואז היא מקבלת שם של סגנון ושירים אמיתיים ביוטיוב.
אתה נכנס כשהיא כותבת או מדברת. התפקיד שלך: להבין מה בא לה עכשיו ולכוון את ההקשבה – לא להחליף אותה.

איך אתה מדבר:
- עברית מדוברת, בגוף שני נקבה, חם ופשוט. 1–2 משפטים קצרים. בלי רשימות, בלי אימוג׳ים, בלי מירכאות מסביב.
- ישר: אם אתה לא מכיר אותה מספיק – תגיד. אם אתה מנחש – תגיד שזה ניחוש.
- אל תשאל שאלות. אם חייבים – לכל היותר שאלה אחת קצרה, ורק כשאי אפשר לכוון בלעדיה. עדיף "בואי נקשיב" על פני שאלה.
- אל תסביר מוזיקה כמו מורה. שם של סגנון ומשפט על מה מרגישים – זה מספיק.
- "עכשיו", לא "בכלל": מה שבא לה היום לא אומר מה היא. אל תקבע לה זהות.

הפעולה (שדה action):
- keep – רק לענות, לא לשנות את מה שפתוח.
- narrow – לצמצם את ההקשבה לקבוצה של 2–12 סגנונות שמתאימים למה שאמרה. היא תמשיך לבחור באוזן מתוכם. זו ברירת המחדל כשהיא מתארת מצב, מקום או תחושה.
- show – לקפוץ ישר לסגנון אחד, רק כשהיא ביקשה משהו מאוד ספציפי או אמרה "תבחר אתה".
השתמש רק במזהים מהקטלוג. כשאתה מצמצם, הישען קודם על הביט והמהירות המורגשת (עייפה בנסיעה בלילה ≠ 140 bpm), אחר כך על הצליל והקול.
אם היא כבר במסך תוצאה ואומרת שזה לא זה – תציע כיוון אחר עם narrow או show.

זיכרון (שדה remember): רק אם אמרה או הראתה משהו שכדאי לזכור לפעמים הבאות – משפט קצר בגוף שלישי, עם ההקשר ("בנסיעות ארוכות בלילה בא לה ביט איטי ועמוק"). לא לרשום דברים חד־פעמיים או מובנים מאליהם. אחרת null.

תמיד תענה דרך הכלי respond.

הקטלוג (מזהה | שם | ביט | מהירות | בס | צליל | קול | צבע | מה מאפיין):
${CATALOG}`;

const TOOL = {
  name: "respond",
  description: "התשובה לקורל והפעולה על ההקשבה",
  input_schema: {
    type: "object",
    properties: {
      reply: { type: "string", description: "1–2 משפטים בעברית" },
      action: { type: "string", enum: ["keep", "narrow", "show"] },
      ids: { type: "array", items: { type: "string" }, description: "ל־narrow: 2–12 מזהים. ל־show: מזהה אחד." },
      remember: { type: ["string", "null"] },
    },
    required: ["reply", "action"],
  },
};

type TalkBody = {
  user_key: string; text: string; local_hour?: number; weekday?: number; tz?: string; context?: string | null;
  state?: { screen?: string; cands?: string[]; picks?: string[]; result?: string | null; result_id?: string | null; rounds?: number };
  chat?: { who: "her" | "me"; text: string }[];
};

async function callClaude(system: string, messages: unknown[], modelList: string[]) {
  let last = "";
  for (const model of modelList) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 1500, system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], messages, tools: [TOOL], tool_choice: { type: "auto" } }),
    });
    if (r.ok) { const j = await r.json(); const t = (j.content ?? []).find((c: any) => c.type === "tool_use"); if (t) return { ...t.input, model, usage: j.usage };
      const txt = (j.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join(" ").trim();
      if (txt) return { reply: txt, action: "keep", model, usage: j.usage }; last = "empty"; continue; }
    last = `${r.status} ${(await r.text()).slice(0, 200)}`;
    if (r.status !== 404 && r.status !== 400) break; // מפתח/מכסה – אין טעם לנסות מודל אחר
  }
  throw new Error("claude " + last);
}

export async function talk(b: TalkBody) {
  const u = b.user_key, text = String(b.text ?? "").trim().slice(0, 500);
  if (!text) return { error: "empty" };
  if (!agentReady()) return { error: "no key" };
  if (!(await agentBudgetOk(u))) return { reply: "דיברנו המון היום – בואי נמשיך באוזן, ומחר נדבר שוב.", action: "keep", ids: [] };

  const cat = await catalog();
  const { ids: IDS, catalog: CATALOG } = cat;
  const [mem, recent] = await Promise.all([me(u).catch(() => null), recentMoments(u, 30).catch(() => [])]);
  const st = b.state ?? {};
  const cands = (st.cands ?? []).filter((id) => IDS.includes(id));
  const now = `${b.weekday != null ? "יום " + DAY[b.weekday] : ""}, השעה ${b.local_hour ?? "?"}:00`;
  const about = [
    `עכשיו: ${now}.`,
    `כמה פעמים בחרנו ביחד עד היום: ${mem?.yes ?? 0}.`,
    mem?.notes?.length ? `מה אני כבר יודע עליה:\n- ${mem.notes.map((n: any) => n.note).join("\n- ")}` : "עוד אין לי הערות עליה.",
    recent.length ? `הרגעים האחרונים (חדש למעלה):\n${recent.join("\n")}` : "אין רגעים קודמים – זו הפעם הראשונה.",
    `איפה היא עכשיו: ${st.screen === "result" ? `קיבלה תוצאה – ${st.result}${st.result_id ? ` (${st.result_id})` : ""}, אחרי ${st.rounds ?? "?"} בחירות` : `באמצע ההקשבה, אחרי ${st.rounds ?? 0} בחירות`}.`,
    st.picks?.length ? `מה בחרה בסבב הזה: ${st.picks.join(" · ")}` : "עוד לא בחרה כלום בסבב הזה.",
    st.screen !== "result" && cands.length && cands.length < IDS.length ? `סגנונות שעדיין פתוחים: ${cands.join(", ")}` : "",
    b.context ? `הקשר שאמרה קודם: ${b.context}` : "",
  ].filter(Boolean).join("\n\n");

  const msgs: { role: string; content: string }[] = [];
  for (const m of (b.chat ?? []).slice(-6)) {
    const role = m.who === "me" ? "assistant" : "user";
    const content = String(m.text ?? "").slice(0, 400);
    if (!content) continue;
    if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += "\n" + content; else msgs.push({ role, content });
  }
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  const final = `[מה שאני יודע עכשיו]\n${about}\n\n[מה שהיא אמרה עכשיו]\n${text}`;
  if (msgs.length && msgs[msgs.length - 1].role === "user") msgs[msgs.length - 1].content += "\n\n" + final; else msgs.push({ role: "user", content: final });

  const sys = cat.prompt ? cat.prompt.replace("{{CATALOG}}", CATALOG) : system(CATALOG);
  const out: any = await callClaude(sys, msgs, models(cat.model));
  let action = ["keep", "narrow", "show"].includes(out.action) ? out.action : "keep";
  let ids = (Array.isArray(out.ids) ? out.ids : []).filter((id: string) => IDS.includes(id));
  if (action === "show" && !ids.length) action = "keep";
  if (action === "show") ids = ids.slice(0, 1);
  if (action === "narrow" && ids.length < 2) action = ids.length === 1 ? "show" : "keep";
  if (action === "narrow") ids = ids.slice(0, 12);
  const reply = String(out.reply ?? "").slice(0, 400);
  const remember = typeof out.remember === "string" && out.remember.trim() ? out.remember.trim() : null;
  if (remember) await agentNote(u, remember).catch(() => {});
  await saveMoment({
    user_key: u, action: "talk", layer: st.screen === "result" ? "final" : "build", context: b.context ?? text,
    local_hour: b.local_hour ?? null, weekday: b.weekday ?? null, tz: b.tz ?? null,
    meta: { agent: "1", text, reply, act: action, ids, remember, model: out.model, usage: out.usage },
  }).catch(() => {});
  return { reply, action, ids, remember };
}
