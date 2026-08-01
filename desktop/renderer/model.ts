export type RoutineId =
  | "breakfast-medicine"
  | "lunch-medicine"
  | "midday-meditation"
  | "dinner-medicine"
  | "evening-review"
  | "bedtime-meditation";

export type RoutineStatus = "done" | "skipped";
export type TimerKind = "focus" | "rest" | "meditation";

export type Settings = {
  focusMinutes: number;
  breakMinutes: number;
  meals: { breakfast: string; lunch: string; dinner: string };
  medicationOffset: number;
  middayMeditation: { time: string; minutes: number };
  bedtimeMeditation: { time: string; minutes: number };
  reviewTime: string;
  autoStart: boolean;
  minimizeToTray: boolean;
};

export type RoutineLog = { status: RoutineStatus; completedAt: string };

export type Review = {
  completed: string;
  unfinished: string;
  result: string;
  savedAt: string;
};

export type DayLog = {
  routines: Partial<Record<RoutineId, RoutineLog>>;
  snoozes: Partial<Record<RoutineId, number>>;
  systemNotified: Record<string, string>;
  review: Review | null;
};

export type Session = {
  id: string;
  kind: TimerKind;
  label: string;
  startedAt: string;
  completedAt: string;
  minutes: number;
};

export type ActiveTimer = {
  id: string;
  kind: TimerKind;
  label: string;
  routineId?: RoutineId;
  startedAt: number;
  endAt: number;
  remainingSeconds: number;
  totalSeconds: number;
  status: "running" | "paused";
};

export type AppState = {
  schemaVersion: 1;
  onboarded: boolean;
  settings: Settings;
  days: Record<string, DayLog>;
  sessions: Session[];
  activeTimer: ActiveTimer | null;
};

export type Routine = {
  id: RoutineId;
  kind: "medicine" | "meditation" | "review";
  title: string;
  detail: string;
  time: string;
  dueAt: number;
  durationMinutes?: number;
};

export const DEFAULT_STATE: AppState = {
  schemaVersion: 1,
  onboarded: false,
  settings: {
    focusMinutes: 45,
    breakMinutes: 8,
    meals: { breakfast: "08:00", lunch: "12:00", dinner: "18:30" },
    medicationOffset: 30,
    middayMeditation: { time: "15:00", minutes: 5 },
    bedtimeMeditation: { time: "23:00", minutes: 10 },
    reviewTime: "21:30",
    autoStart: false,
    minimizeToTray: true,
  },
  days: {},
  sessions: [],
  activeTimer: null,
};

export function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function emptyDay(): DayLog {
  return { routines: {}, snoozes: {}, systemNotified: {}, review: null };
}

export function timeOn(date: Date, time: string) {
  const [hour, minute] = time.split(":").map(Number);
  const result = new Date(date);
  result.setHours(hour || 0, minute || 0, 0, 0);
  return result.getTime();
}

export function withOffset(time: string, offset: number) {
  const date = new Date(2000, 0, 1);
  const [hour, minute] = time.split(":").map(Number);
  date.setHours(hour || 0, (minute || 0) + offset, 0, 0);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function routinesFor(settings: Settings, date = new Date()): Routine[] {
  const medicine = (id: RoutineId, mealName: string, mealTime: string): Routine => {
    const time = withOffset(mealTime, settings.medicationOffset);
    return {
      id,
      kind: "medicine",
      title: `${mealName}后用药`,
      detail: `饭后 ${settings.medicationOffset} 分钟提醒`,
      time,
      dueAt: timeOn(date, time),
    };
  };

  return [
    medicine("breakfast-medicine", "早餐", settings.meals.breakfast),
    medicine("lunch-medicine", "午餐", settings.meals.lunch),
    {
      id: "midday-meditation",
      kind: "meditation",
      title: "工作中间，停一下",
      detail: `${settings.middayMeditation.minutes} 分钟呼吸休息`,
      time: settings.middayMeditation.time,
      dueAt: timeOn(date, settings.middayMeditation.time),
      durationMinutes: settings.middayMeditation.minutes,
    },
    medicine("dinner-medicine", "晚餐", settings.meals.dinner),
    {
      id: "evening-review",
      kind: "review",
      title: "收好今天",
      detail: "完成、未完成和今天的结果",
      time: settings.reviewTime,
      dueAt: timeOn(date, settings.reviewTime),
    },
    {
      id: "bedtime-meditation",
      kind: "meditation",
      title: "睡前冥想",
      detail: `${settings.bedtimeMeditation.minutes} 分钟，结束今天`,
      time: settings.bedtimeMeditation.time,
      dueAt: timeOn(date, settings.bedtimeMeditation.time),
      durationMinutes: settings.bedtimeMeditation.minutes,
    },
  ].sort((a, b) => a.dueAt - b.dueAt);
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(date);
}

export function formatClock(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

export function formatTimer(seconds: number) {
  const safe = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = safe % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function relativeTime(dueAt: number, now: number) {
  const minutes = Math.round((dueAt - now) / 60000);
  if (minutes > 90) return `${Math.floor(minutes / 60)} 小时后`;
  if (minutes > 0) return `${minutes} 分钟后`;
  if (minutes >= -4) return "现在";
  if (minutes > -90) return `已到点 ${Math.abs(minutes)} 分钟`;
  return "等待记录";
}

export function nextId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}
