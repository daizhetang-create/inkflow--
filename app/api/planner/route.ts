import { env } from "cloudflare:workers";

type PlanStatus = "planned" | "active" | "paused" | "completed";

type PlanItemInput = {
  id: string;
  title: string;
  plannedStart: string;
  durationMinutes: number;
  status: PlanStatus;
  startedAt: string | null;
  elapsedSeconds: number;
  completedAt: string | null;
  updatedAt: string;
};

type Action =
  | { action: "upsert"; item: PlanItemInput }
  | { action: "delete"; id: string }
  | { action: "clearCompleted" };

const ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;
const STATUSES = new Set<PlanStatus>(["planned", "active", "paused", "completed"]);

function ownerFrom(request: Request) {
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (email) return email;
  return process.env.NODE_ENV === "development" || request.headers.get("host")?.startsWith("localhost")
    ? "local-preview"
    : null;
}

async function ensureSchema(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS plan_items (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      title TEXT NOT NULL,
      planned_start TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'planned',
      started_at TEXT,
      elapsed_seconds INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS plan_items_owner_start_idx ON plan_items(owner_id, planned_start)"),
  ]);
}

function unauthorized() {
  return Response.json({ error: "请先登录，再跨设备同步计划。" }, { status: 401 });
}

function invalid(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

function validIso(value: string | null) {
  return value === null || (typeof value === "string" && Number.isFinite(new Date(value).getTime()));
}

export async function GET(request: Request) {
  const owner = ownerFrom(request);
  if (!owner) return unauthorized();

  try {
    const db = env.DB;
    await ensureSchema(db);
    const url = new URL(request.url);
    const from = url.searchParams.get("from") ?? new Date(Date.now() - 14 * 86400000).toISOString();
    const to = url.searchParams.get("to") ?? new Date(Date.now() + 21 * 86400000).toISOString();
    const items = await db.prepare(
      "SELECT id, title, planned_start AS plannedStart, duration_minutes AS durationMinutes, status, started_at AS startedAt, elapsed_seconds AS elapsedSeconds, completed_at AS completedAt, updated_at AS updatedAt FROM plan_items WHERE owner_id = ? AND planned_start >= ? AND planned_start <= ? ORDER BY planned_start ASC LIMIT 480"
    ).bind(owner, from, to).all();
    return Response.json({ items: items.results, owner });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "计划暂时无法读取。" }, { status: 500 });
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

    if (payload.action === "upsert") {
      const item = payload.item;
      if (!ID_PATTERN.test(item.id) || !item.title?.trim() || item.title.trim().length > 120) return invalid("请写下这段时间要做的事。");
      if (!validIso(item.plannedStart) || !validIso(item.startedAt) || !validIso(item.completedAt) || !validIso(item.updatedAt)) return invalid("计划时间无效。");
      if (!Number.isInteger(item.durationMinutes) || item.durationMinutes < 5 || item.durationMinutes > 480) return invalid("计划时长需要在 5 到 480 分钟之间。");
      if (!Number.isInteger(item.elapsedSeconds) || item.elapsedSeconds < 0 || item.elapsedSeconds > 172800) return invalid("计时数据无效。");
      if (!STATUSES.has(item.status)) return invalid("计划状态无效。");

      await db.prepare(`INSERT INTO plan_items (
        id, owner_id, title, planned_start, duration_minutes, status, started_at, elapsed_seconds, completed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        planned_start = excluded.planned_start,
        duration_minutes = excluded.duration_minutes,
        status = excluded.status,
        started_at = excluded.started_at,
        elapsed_seconds = excluded.elapsed_seconds,
        completed_at = excluded.completed_at,
        updated_at = excluded.updated_at
      WHERE plan_items.owner_id = excluded.owner_id`).bind(
        item.id,
        owner,
        item.title.trim(),
        item.plannedStart,
        item.durationMinutes,
        item.status,
        item.startedAt,
        item.elapsedSeconds,
        item.completedAt,
        item.updatedAt,
      ).run();
      return Response.json({ ok: true, id: item.id }, { status: 201 });
    }

    if (payload.action === "delete") {
      if (!ID_PATTERN.test(payload.id)) return invalid("计划编号无效。");
      await db.prepare("DELETE FROM plan_items WHERE id = ? AND owner_id = ?").bind(payload.id, owner).run();
      return Response.json({ ok: true });
    }

    if (payload.action === "clearCompleted") {
      await db.prepare("DELETE FROM plan_items WHERE owner_id = ? AND status = 'completed'").bind(owner).run();
      return Response.json({ ok: true });
    }

    return invalid("未知操作。");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "计划暂时无法保存。" }, { status: 500 });
  }
}
