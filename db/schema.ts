import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const attentionSessions = sqliteTable("attention_sessions", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  intention: text("intention").notNull(),
  energyStart: text("energy_start").notNull(),
  energyEnd: text("energy_end"),
  targetMinutes: integer("target_minutes"),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
  outcome: text("outcome"),
  note: text("note"),
  status: text("status").notNull().default("active"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("attention_sessions_owner_started_idx").on(table.ownerId, table.startedAt),
]);

export const attentionEvents = sqliteTable("attention_events", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  ownerId: text("owner_id").notNull(),
  kind: text("kind").notNull(),
  note: text("note"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("attention_events_session_created_idx").on(table.sessionId, table.createdAt),
  index("attention_events_owner_created_idx").on(table.ownerId, table.createdAt),
]);

export const planItems = sqliteTable("plan_items", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull(),
  plannedStart: text("planned_start").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  status: text("status").notNull().default("planned"),
  startedAt: text("started_at"),
  elapsedSeconds: integer("elapsed_seconds").notNull().default(0),
  completedAt: text("completed_at"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("plan_items_owner_start_idx").on(table.ownerId, table.plannedStart),
]);
