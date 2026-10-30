// "התדר שלך עכשיו" – edge function: serves the app and proxies Deezer previews.
// GET  <fn>/              → redirect to the app on GitHub Pages (Supabase does not render HTML)
// GET  <fn>/api/pick?s=[[artist,title],...]       → first seed that has a 30s preview
// GET  <fn>/api/playlist?q=<query>&s=[[a,t],...]  → playlist + up to 12 tracks with previews
// GET  <fn>/api/health
import { saveMoment, me, trust, tellNote, type Moment } from "./memory.ts";

const DZ = Deno.env.get("DEEZER_BASE") ?? "https://api.deezer.com";
const TTL = 1000 * 60 * 60 * 12;
const cache = new Map<string, { t: number; v: unknown }>();

type Track = {
  id: number; title: string; artist: string; preview: string;
  cover: string; link: string; duration: number;
};

const json = (v: unknown, status = 200, nocache = false) =>
  new Response(JSON.stringify(v), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "cache-control": nocache ? "no-store" : "public, max-age=3600",
    },
  });
const userKey = (s: string | null | undefined) => (typeof s === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(s) ? s : null);
const num = (s: string | null) => (s == null || s === "" || isNaN(+s) ? null : Math.trunc(+s));

function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return Promise.resolve(hit.v as T);
  // תוצאה ריקה לא נשמרת – תקלה זמנית ב-Deezer לא תרעיל את המטמון ל-12 שעות
  return fn().then((v) => {
    // deno-lint-ignore no-explicit-any
    const empty = v == null || (typeof v === "object" && Array.isArray((v as any).tracks) && (v as any).tracks.length === 0);
    if (!empty) cache.set(key, { t: Date.now(), v });
    return v;
  });
}

async function dz(path: string, params: Record<string, string>) {
  const u = new URL(DZ + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { "accept": "application/json" } });
  if (!r.ok) throw new Error(`deezer ${r.status}`);
  const j = await r.json();
  if (j && j.error) throw new Error(`deezer ${j.error.code}: ${j.error.message}`);
  return j;
}

// deno-lint-ignore no-explicit-any
const toTrack = (t: any): Track => ({
  id: t.id,
  title: t.title_short || t.title,
  artist: t.artist?.name ?? "",
  preview: t.preview ?? "",
  cover: t.album?.cover_medium ?? t.album?.cover ?? "",
  link: t.link ?? `https://www.deezer.com/track/${t.id}`,
  duration: t.duration ?? 0,
});

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^a-z0-9֐-׿ ]+/g, " ").replace(/\s+/g, " ").trim();

async function findSeed(artist: string, title: string): Promise<Track | null> {
  return cached(`seed:${artist}|${title}`, async () => {
    const want = norm(title), wantA = norm(artist);
    // deno-lint-ignore no-explicit-any
    const pickFrom = (data: any[]) => {
      const ok = data.map(toTrack).filter((t) => t.preview);
      const a0 = wantA.split(" ")[0];
      const exact = ok.find((t) => norm(t.title).startsWith(want) && norm(t.artist).includes(a0));
      // never accept a track whose title doesn't match the seed – fall through to the next seed instead
      // only the real artist counts – covers / karaoke / MIDI versions fall through to the next seed
      return exact ?? ok.find((t) => { const n = norm(t.title); return n.length > 2 && (n.includes(want) || want.includes(n)) && norm(t.artist).includes(a0); }) ?? null;
    };
    try {
      const strict = await dz("/search", { q: `artist:"${artist}" track:"${title}"`, limit: "8" });
      const t = pickFrom(strict.data ?? []);
      if (t) return t;
    } catch { /* fall through */ }
    try {
      const loose = await dz("/search", { q: `${artist} ${title}`, limit: "8" });
      return pickFrom(loose.data ?? []);
    } catch { return null; }
  });
}

async function pick(seeds: [string, string][]): Promise<Track | null> {
  for (const [a, t] of seeds) {
    const tr = await findSeed(a, t);
    if (tr) return tr;
  }
  return null;
}

async function playlist(q: string, seeds: [string, string][]) {
  return cached(`pl:${q}|${JSON.stringify(seeds)}`, async () => {
    const out: Track[] = [];
    const seen = new Set<string>();
    const add = (t: Track | null) => {
      if (!t || !t.preview) return;
      const k = norm(t.artist) + "|" + norm(t.title);
      if (seen.has(k)) return;
      seen.add(k); out.push(t);
    };
    // seeds first – they define the cell
    const seedTracks = await Promise.all(seeds.slice(0, 3).map(([a, t]) => findSeed(a, t)));
    seedTracks.forEach(add);

    // deno-lint-ignore no-explicit-any
    let pl: any = null;
    try {
      const s = await dz("/search/playlist", { q, limit: "10" });
      // deno-lint-ignore no-explicit-any
      const cands = (s.data ?? []).filter((p: any) => (p.nb_tracks ?? 0) >= 15 && p.public !== false);
      // deno-lint-ignore no-explicit-any
      cands.sort((a: any, b: any) => (b.fans ?? 0) - (a.fans ?? 0));
      pl = cands[0] ?? null;
      if (pl) {
        const tr = await dz(`/playlist/${pl.id}/tracks`, { limit: "60" });
        const artistCount = new Map<string, number>();
        for (const raw of tr.data ?? []) {
          const t = toTrack(raw);
          const c = artistCount.get(norm(t.artist)) ?? 0;
          if (c >= 2) continue;
          artistCount.set(norm(t.artist), c + 1);
          add(t);
          if (out.length >= 12) break;
        }
      }
    } catch { /* playlist optional */ }
    return {
      playlist: pl ? { id: pl.id, title: pl.title, link: pl.link, picture: pl.picture_medium } : null,
      tracks: out.slice(0, 12),
    };
  });
}

function parseSeeds(raw: string | null): [string, string][] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter((x) => Array.isArray(x) && typeof x[0] === "string" && typeof x[1] === "string")
      .slice(0, 6).map((x) => [x[0].slice(0, 80), x[1].slice(0, 80)] as [string, string]);
  } catch { return []; }
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET, POST, OPTIONS" } });
  }
  const m = url.pathname.match(/\/api\/([a-z]+)\/?$/);
  if (!m) {
    return new Response(null, { status: 302, headers: { location: "https://koralguetta-gif.github.io/KORAL/", "cache-control": "no-cache" } });
  }
  try {
    switch (m[1]) {
      case "health":
        return json({ ok: true, cache: cache.size, deezer: DZ });
      case "pick": {
        const seeds = parseSeeds(url.searchParams.get("s"));
        if (!seeds.length) return json({ error: "no seeds" }, 400);
        return json(await pick(seeds));
      }
      case "track": {
        const id = (url.searchParams.get("id") ?? "").replace(/\D/g, "");
        if (!id) return json({ error: "no id" }, 400);
        const t = await cached(`track:${id}`, () => dz(`/track/${id}`, {}));
        return json(toTrack(t));
      }
      case "me": {
        const u = userKey(url.searchParams.get("u"));
        if (!u) return json({ error: "no user" }, 400);
        return json(await me(u), 200, true);
      }
      case "trust": {
        const u = userKey(url.searchParams.get("u"));
        if (!u) return json({ error: "no user" }, 400);
        const h = num(url.searchParams.get("hour")), wd = num(url.searchParams.get("weekday"));
        return json(await trust(u, h, wd, url.searchParams.get("context")), 200, true);
      }
      case "moment": {
        if (req.method !== "POST") return json({ error: "POST" }, 405);
        const body = await req.json().catch(() => null) as Moment | null;
        const u = body && userKey(body.user_key);
        if (!body || !u || !["listen", "trust", "talk", "open"].includes(body.action)) return json({ error: "bad moment" }, 400);
        return json(await saveMoment({ ...body, user_key: u }), 200, true);
      }
      case "note": {
        if (req.method !== "POST") return json({ error: "POST" }, 405);
        const body = await req.json().catch(() => null) as { user_key?: string; note?: string } | null;
        const u = body && userKey(body.user_key);
        if (!u || !body?.note) return json({ error: "bad note" }, 400);
        await tellNote(u, body.note);
        return json({ ok: true }, 200, true);
      }
      case "playlist": {
        const q = (url.searchParams.get("q") ?? "").slice(0, 80);
        const seeds = parseSeeds(url.searchParams.get("s"));
        if (!q) return json({ error: "no q" }, 400);
        return json(await playlist(q, seeds));
      }
      default:
        return json({ error: "not found" }, 404);
    }
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
});
