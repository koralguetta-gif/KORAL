// הזיכרון של החבר: רגעים, לא פרופיל.
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

export type Moment = {
  user_key: string; action: "listen" | "trust" | "talk" | "open";
  context?: string | null; cell?: string | null; layer?: string | null;
  track_id?: number | null; track_title?: string | null; track_artist?: string | null;
  reaction?: string | null; local_hour?: number | null; weekday?: number | null; tz?: string | null;
  meta?: Record<string, unknown>;
};

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
export function slotOf(h: number | null | undefined): string {
  if (h == null) return "unknown";
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 16) return "noon";
  if (h >= 16 && h < 21) return "evening";
  return "night";
}
const SLOT_HE: Record<string, string> = { morning: "בבוקר", noon: "בצהריים", evening: "בערב", night: "בלילה", unknown: "" };

/** אורך ההקשבה גדל עם האמון: 8 שניות בהתחלה, +2 על כל 8 "זה", עד 20. */
export const listenSeconds = (yes: number) => Math.min(20, 8 + Math.floor(yes / 8) * 2);

export async function touchUser(user_key: string) {
  await sb.from("tadar_users").upsert({ user_key, last_seen: new Date().toISOString() }, { onConflict: "user_key" });
}

export async function saveMoment(m: Moment) {
  const clean = (s: unknown, n = 300) => (typeof s === "string" ? s.slice(0, n) : null);
  const row = {
    user_key: m.user_key, action: m.action,
    context: clean(m.context), cell: clean(m.cell, 60), layer: clean(m.layer, 20),
    track_id: typeof m.track_id === "number" ? m.track_id : null,
    track_title: clean(m.track_title, 200), track_artist: clean(m.track_artist, 200),
    reaction: clean(m.reaction, 20),
    local_hour: typeof m.local_hour === "number" ? m.local_hour : null,
    weekday: typeof m.weekday === "number" ? m.weekday : null,
    tz: clean(m.tz, 60),
    meta: m.meta && typeof m.meta === "object" ? m.meta : {},
  };
  const { error } = await sb.from("tadar_moments").insert(row);
  if (error) throw new Error(error.message);
  await touchUser(m.user_key);
  if ((m.action === "listen" || m.action === "trust") && m.reaction === "yes" && (m.layer === "voice" || m.layer === "final")) {
    // תגובה "זה" על תא מלא – בודקים אם נולדה הערה
    await inferNotes(m.user_key, row.local_hour, row.weekday).catch(() => {});
  }
  return me(m.user_key);
}

type YesRow = { cell: string; local_hour: number | null; weekday: number | null; context: string | null; track_id: number | null; track_title: string | null; track_artist: string | null; created_at: string; meta: Record<string, unknown> };

async function yesMoments(user_key: string): Promise<YesRow[]> {
  const { data, error } = await sb.from("tadar_moments")
    .select("cell,local_hour,weekday,context,track_id,track_title,track_artist,created_at,meta")
    .eq("user_key", user_key).eq("reaction", "yes").in("layer", ["voice", "final"]).not("cell", "is", null)
    .order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as YesRow[];
}

export async function me(user_key: string) {
  const [{ data: user }, yes, { data: notes }, { count }] = await Promise.all([
    sb.from("tadar_users").select("*").eq("user_key", user_key).maybeSingle(),
    yesMoments(user_key),
    sb.from("tadar_profile_notes").select("note,confidence,created_at").eq("user_key", user_key).eq("active", true).order("created_at", { ascending: false }).limit(10),
    sb.from("tadar_moments").select("*", { count: "exact", head: true }).eq("user_key", user_key),
  ]);
  const ls = listenSeconds(yes.length);
  if (user && user.listen_seconds !== ls) await sb.from("tadar_users").update({ listen_seconds: ls }).eq("user_key", user_key);
  return { user: user ?? null, moments: count ?? 0, yes: yes.length, listen_seconds: ls, notes: notes ?? [] };
}

function topCell(rows: YesRow[]) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.cell, (m.get(r.cell) ?? 0) + 1);
  let best: string | null = null, n = 0;
  for (const [c, k] of m) if (k > n) { best = c; n = k; }
  return { cell: best, count: n };
}

/** "תסמוך עליי": יושר לפני נוחות. */
export async function trust(user_key: string, hour: number | null, weekday: number | null, context: string | null) {
  const yes = await yesMoments(user_key);
  const total = yes.length;
  const base = { total, hour, weekday, slot: slotOf(hour) };
  if (total < 6) {
    return { ...base, status: "unknown", cell: null, track: null,
      message: total === 0
        ? "עוד לא מכיר אותך בכלל – לא יודע מה את אוהבת בבוקר, מה בערב, מה כשאת עצבנית. את לא יכולה לסמוך עליי עדיין. בואי נקשיב ביחד דקה, ואני מבטיח שזה ישתנה."
        : `אני עוד לא שם. שמעתי אותך אומרת "זה" ${total} פעמים – זה לא מספיק בשביל לסמוך עליי. עוד כמה הקשבות קצרות ואני אדע.` };
  }
  // 1. אותו הקשר שסיפרה (אם יש) – הכי חזק
  const ctx = (context ?? "").trim();
  if (ctx) {
    const same = yes.filter((r) => r.context && ctx.length > 1 && (r.context.includes(ctx) || ctx.includes(r.context)));
    const t = topCell(same);
    if (t.count >= 2) return { ...base, status: "confident", cell: t.cell, track: lastTrack(same, t.cell!), evidence: { kind: "context", count: t.count },
      message: `כשסיפרת לי "${ctx}" בפעמים קודמות, זה מה שעבד. ${t.count} פעמים.` };
  }
  // 2. אותו חלק של היום (±2 שעות), ואם אפשר גם אותו יום בשבוע
  const slot = slotOf(hour);
  const near = yes.filter((r) => r.local_hour != null && hour != null && Math.abs(((r.local_hour - hour) + 36) % 24 - 12) <= 2 || (r.local_hour != null && slotOf(r.local_hour) === slot));
  const sameDay = near.filter((r) => weekday != null && r.weekday === weekday);
  const td = topCell(sameDay);
  if (td.count >= 3) return { ...base, status: "confident", cell: td.cell, track: lastTrack(sameDay, td.cell!), evidence: { kind: "slot+weekday", count: td.count },
    message: `ימי ${DAY_NAMES[weekday!]} ${SLOT_HE[slot]} – ${td.count} פעמים זה היה המקום שלך. מביא.` };
  const ts = topCell(near);
  if (ts.count >= 3) return { ...base, status: "confident", cell: ts.cell, track: lastTrack(near, ts.cell!), evidence: { kind: "slot", count: ts.count },
    message: `${SLOT_HE[slot]} את בדרך כלל כאן – ${ts.count} פעמים. מביא.` };
  // 3. ניחוש כללי – ואומרים שזה ניחוש
  const ta = topCell(yes);
  return { ...base, status: "guess", cell: ta.cell, track: lastTrack(yes, ta.cell!), evidence: { kind: "overall", count: ta.count },
    message: `${SLOT_HE[slot]} אני עוד לא מכיר אותך מספיק, אז זה ניחוש: המקום שהכי חזרת אליו בכלל. תגידי לי אם פגעתי.` };
}

function lastTrack(rows: YesRow[], cell: string) {
  const r = rows.find((x) => x.cell === cell && x.track_id);
  return r ? { id: r.track_id, title: r.track_title, artist: r.track_artist } : null;
}

/** הערות שהחבר כותב לעצמו, רק כשיש דפוס אמיתי. */
async function inferNotes(user_key: string, hour: number | null, weekday: number | null) {
  if (hour == null || weekday == null) return;
  const yes = await yesMoments(user_key);
  const slot = slotOf(hour);
  const same = yes.filter((r) => r.weekday === weekday && slotOf(r.local_hour) === slot);
  const t = topCell(same);
  if (t.count < 3) return;
  const sample = same.find((r) => r.cell === t.cell);
  const cellName = (sample?.meta?.cell_name as string | undefined) ?? t.cell;
  const note = `ימי ${DAY_NAMES[weekday]} ${SLOT_HE[slot]} מגיע לך בדרך כלל ${cellName}.`;
  const { data: exists } = await sb.from("tadar_profile_notes").select("id").eq("user_key", user_key).eq("note", note).maybeSingle();
  const confidence = Math.min(0.95, 0.5 + t.count * 0.1);
  if (exists) await sb.from("tadar_profile_notes").update({ confidence, active: true }).eq("id", exists.id);
  else await sb.from("tadar_profile_notes").insert({ user_key, note, confidence, source: "inferred" });
}

export async function tellNote(user_key: string, note: string) {
  const n = note.trim().slice(0, 300);
  if (!n) return;
  await sb.from("tadar_profile_notes").insert({ user_key, note: n, confidence: 0.9, source: "told" });
}
