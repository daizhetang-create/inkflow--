import { env } from "cloudflare:workers";

type Action =
  | { action: "start"; session: SessionInput }
  | { action: "event"; event: EventInput }
  | { action: "finish"; id: string; endedAt: string; outcome: string; energyEnd: string; note?: string }
  | { action: "clear" };

type SessionInput = {
  id: string;
  intention: string;
  energyStart: string;
  targetMinutes: number | null;
  startedAt: string;
};

type EventInput = {
  id: string;
  sessionId: string;
  kind: string;
  note?: string;
  createdAt: string;
};

const ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;
const ENERGY = new Set(["clear", "steady", "scattered", "tired"]);
const OUTCOMES = new Set(["complete", "progress", "pause"]);
const EVENT_KINDS = new Set(["drift", "interrupt", "idea", "recovery", "return"]);

function ownerFrom(request: Request) {
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (email) return email;
  return process.env.NODE_ENV === "development" || request.headers.get("host")?.startsWith("localhost")
    ? "local-preview"
    : null;
}

async function ensureSchema(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS attention_sessions (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      intention TEXT NOT NULL,
      energy_start TEXT NOT NULL,
      energy_end TEXT,
      target_minutes INTEGER,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      outcome TEXT,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS attention_sessions_owner_started_idx ON attention_sessions(owner_id, started_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS attention_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS attention_events_session_created_idx ON attention_events(session_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS attention_events_owner_created_idx ON attention_events(owner_id, created_at)"),
  ]);
}

function unauthorized() {
  return Response.json({ error: "请先登录，再同步你的墨流记录。" }, { status: 401 });
}

function invalid(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

export async function GET(request: Request) {
  const owner = ownerFrom(request);
  if (!owner) return unauthorized();

  try {
    const db = env.DB;
    await ensureSchema(db);
    const url = new URL(request.url);
    const from = url.searchParams.get("from") ?? new Date(Date.now() - 8 * 86400000).toISOString();
    const sessions = await db.prepare(
      "SELECT id, intention, energy_start AS energyStart, energy_end AS energyEnd, target_minutes AS targetMinutes, started_at AS startedAt, ended_at AS endedAt, outcome, note, status, updated_at AS updatedAt FROM attention_sessions WHERE owner_id = ? AND started_at >= ? ORDER BY started_at DESC LIMIT 240"
    ).bind(owner, from).all();
    const events = await db.prepare(
      "SELECT id, session_id AS sessionId, kind, note, created_at AS createdAt FROM attention_events WHERE owner_id = ? AND created_at >= ? ORDER BY created_at ASC LIMIT 1200"
    ).bind(owner, from).all();
    return Response.json({ sessions: sessions.results, events: events.results, owner });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "记录暂时无法读取。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const owner = ownerFrom(request);
  if (!owner) return unauthorized();

  let payload: Action;
  try {
    payload = await request.json() as Action;
  } catch {
    return invalid("请求内容无法读取。");
  }

  try {
    const db = env.DB;
    await ensureSchema(db);
    const now = new Date().toISOString();

    if (payload.action === "start") {
      const value = payload.session;
      if (!ID_PATTERN.test(value.id) || !value.intention?.trim() || value.intention.trim().length > 160) return invalid("请写下这一刻真正要做的事。");
      if (!ENERGY.has(value.energyStart)) return invalid("当前状态无效。");
      if (value.targetMinutes !== null && ![5, 10, 25, 45].includes(value.targetMinutes)) return invalid("时间目标无效。");
      await db.prepare(
        "INSERT OR IGNORE INTO attention_sessions (id, owner_id, intention, energy_start, target_minutes, started_at, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?)"
      ).bind(value.id, owner, value.intention.trim(), value.energyStart, value.targetMinutes, value.startedAt, now).run();
      return Response.json({ ok: true, id: value.id }, { status: 201 });
    }

    if (payload.action === "event") {
      const value = payload.event;
      if (!ID_PATTERN.test(value.id) || !ID_PATTERN.test(value.sessionId) || !EVENT_KINDS.has(value.kind)) return invalid("记录事件无效。");
      const owns = await db.prepare("SELECT id FROM attention_sessions WHERE id = ? AND owner_id = ?").bind(value.sessionId, owner).first();
      if (!owns) return Response.json({ error: "找不到对应记录。" }, { status: 404 });
      await db.prepare(
        "INSERT OR IGNORE INTO attention_events (id, session_id, owner_id, kind, note, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(value.id, value.sessionId, owner, value.kind, value.note?.trim().slice(0, 200) || null, value.createdAt).run();
      await db.prepare("UPDATE attention_sessions SET updated_at = ? WHERE id = ? AND owner_id = ?").bind(now, value.sessionId, owner).run();
      return Response.json({ ok: true, id: value.id }, { status: 201 });
    }

    if (payload.action === "finish") {
      if (!ID_PATTERN.test(payload.id) || !OUTCOMES.has(payload.outcome) || !ENERGY.has(payload.energyEnd)) return invalid("结束记录的信息不完整。");
      const result = await db.prepare(
        "UPDATE attention_sessions SET ended_at = ?, outcome = ?, energy_end = ?, note = ?, status = 'completed', updated_at = ? WHERE id = ? AND owner_id = ?"
      ).bind(payload.endedAt, payload.outcome, payload.energyEnd, payload.note?.trim().slice(0, 240) || null, now, payload.id, owner).run();
      if (!result.meta.changes) return Response.json({ error: "找不到对应记录。" }, { status: 404 });
      return Response.json({ ok: true });
    }

    if (payload.action === "clear") {
      await db.batch([
        db.prepare("DELETE FROM attention_events WHERE owner_id = ?").bind(owner),
        db.prepare("DELETE FROM attention_sessions WHERE owner_id = ?").bind(owner),
      ]);
      return Response.json({ ok: true });
    }

    return invalid("未知操作。");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "记录暂时无法保存。" }, { status: 500 });
  }
}
