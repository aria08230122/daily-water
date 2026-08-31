export const BOWEL_STORAGE_KEY = "daily-water/bowel-v1";
export const BOWEL_LOCK_NAME = "daily-water/bowel-write";

export const STOOL_SHAPES = [
  { value: 1, label: "硬颗粒", description: "分散的小硬块" },
  { value: 2, label: "结块条状", description: "连在一起的硬块" },
  { value: 3, label: "表面裂纹", description: "条状，表面有裂纹" },
  { value: 4, label: "光滑条状", description: "柔软、光滑的条状" },
  { value: 5, label: "柔软小块", description: "边缘清晰的软块" },
  { value: 6, label: "松散糊状", description: "边缘不整齐的松散软块" },
  { value: 7, label: "水样", description: "液体状，没有固体块" },
] as const;

export const EFFORT_OPTIONS = [
  { value: "easy", label: "顺畅" },
  { value: "some", label: "有点费力" },
  { value: "hard", label: "很费力" },
] as const;

export const COLOR_OPTIONS = [
  { value: "brown", label: "棕色", swatch: "#97745D" },
  { value: "yellow", label: "黄色", swatch: "#C5AA6D" },
  { value: "green", label: "绿色", swatch: "#8B9E79" },
  { value: "black", label: "黑色", swatch: "#535355" },
  { value: "red", label: "红色", swatch: "#AD7777" },
  { value: "pale", label: "灰白色", swatch: "#C7C2B9" },
] as const;

export const AMOUNT_OPTIONS = [
  { value: "small", label: "少量" },
  { value: "medium", label: "适中" },
  { value: "large", label: "较多" },
] as const;

export const PAIN_OPTIONS = [
  { value: "none", label: "没有腹痛" },
  { value: "mild", label: "轻微" },
  { value: "moderate", label: "明显" },
  { value: "severe", label: "剧烈" },
] as const;

export type BowelDetails = {
  shape: (typeof STOOL_SHAPES)[number]["value"] | null;
  effort: (typeof EFFORT_OPTIONS)[number]["value"] | null;
  color: (typeof COLOR_OPTIONS)[number]["value"] | null;
  amount: (typeof AMOUNT_OPTIONS)[number]["value"] | null;
  pain: (typeof PAIN_OPTIONS)[number]["value"] | null;
  notes: string;
};

export type BowelEntry = BowelDetails & {
  id: string;
  source: "quick" | "timer" | "manual";
  startedAt: string;
  endedAt: string | null;
  updatedAt: string;
};

export type BowelSession = { id: string; startedAt: string };
export type BowelStore = {
  version: 1;
  entries: BowelEntry[];
  activeSession: BowelSession | null;
  noBowelDays: string[];
};

export type LocalStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function emptyBowelStore(): BowelStore {
  return { version: 1, entries: [], activeSession: null, noBowelDays: [] };
}

export function emptyBowelDetails(): BowelDetails {
  return { shape: null, effort: null, color: null, amount: null, pain: null, notes: "" };
}

export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function dateFromDayKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function dateTimeInputValue(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${localDayKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}

export function elapsedSeconds(startedAt: string, now: number): number {
  const start = Date.parse(startedAt);
  return Number.isFinite(start) && Number.isFinite(now)
    ? Math.max(0, Math.floor((now - start) / 1000))
    : 0;
}

export function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const clock = `${String(hours >= 100 ? hours % 24 : hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return hours >= 100 ? `${Math.floor(hours / 24)}天 ${clock}` : clock;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

function isDayKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && localDayKey(dateFromDayKey(value)) === value;
}

function isOption<T extends string | number>(
  value: unknown,
  options: readonly { value: T }[],
): value is T | null | undefined {
  return value === null || value === undefined || options.some((option) => option.value === value);
}

export function normalizeBowelEntry(value: unknown): BowelEntry | null {
  if (!isObject(value) || typeof value.id !== "string" || !value.id || !isTimestamp(value.startedAt)) return null;
  if (value.source !== "quick" && value.source !== "timer" && value.source !== "manual") return null;
  const endedAt = value.endedAt ?? null;
  if (endedAt !== null && (!isTimestamp(endedAt) || Date.parse(endedAt) < Date.parse(value.startedAt))) return null;
  if (value.source === "timer" && endedAt === null) return null;
  if (!isOption(value.shape, STOOL_SHAPES) || !isOption(value.effort, EFFORT_OPTIONS) ||
      !isOption(value.color, COLOR_OPTIONS) || !isOption(value.amount, AMOUNT_OPTIONS) || !isOption(value.pain, PAIN_OPTIONS)) return null;
  if (value.notes !== undefined && (typeof value.notes !== "string" || value.notes.length > 2000)) return null;
  if (value.updatedAt !== undefined && !isTimestamp(value.updatedAt)) return null;
  return {
    id: value.id,
    source: value.source,
    startedAt: value.startedAt,
    endedAt,
    updatedAt: (value.updatedAt as string | undefined) ?? value.startedAt,
    shape: value.shape ?? null,
    effort: value.effort ?? null,
    color: value.color ?? null,
    amount: value.amount ?? null,
    pain: value.pain ?? null,
    notes: (value.notes as string | undefined) ?? "",
  };
}

export function normalizeBowelStore(value: unknown): BowelStore | null {
  if (!isObject(value) || value.version !== 1 || !Array.isArray(value.entries)) return null;
  const entries: BowelEntry[] = [];
  const ids = new Set<string>();
  for (const raw of value.entries) {
    const entry = normalizeBowelEntry(raw);
    if (!entry || ids.has(entry.id)) return null;
    ids.add(entry.id);
    entries.push(entry);
  }
  const days = value.noBowelDays ?? [];
  if (!Array.isArray(days) || !days.every(isDayKey)) return null;
  const active = value.activeSession ?? null;
  if (active !== null && (!isObject(active) || typeof active.id !== "string" || !active.id || !isTimestamp(active.startedAt))) return null;
  const recordedDays = new Set(entries.map((entry) => localDayKey(new Date(entry.startedAt))));
  return {
    version: 1,
    entries,
    activeSession: active && !ids.has(active.id as string)
      ? { id: active.id as string, startedAt: active.startedAt as string }
      : null,
    noBowelDays: [...new Set(days)].filter((day) => !recordedDays.has(day)),
  };
}

export function readBowelStore(storage: LocalStorageLike): BowelStore {
  const raw = storage.getItem(BOWEL_STORAGE_KEY);
  if (raw === null) return emptyBowelStore();
  const value = normalizeBowelStore(JSON.parse(raw));
  if (!value) throw new Error("便便记录暂时无法读取，原始数据未被修改。请先保留现有数据，不要清除浏览器存储。");
  return value;
}

export function writeBowelStore(storage: LocalStorageLike, value: BowelStore): void {
  if (!normalizeBowelStore(value)) throw new Error("这次记录包含无效内容，尚未保存。");
  storage.setItem(BOWEL_STORAGE_KEY, JSON.stringify(value));
}

export function newRecordId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function makeBowelEntry(id: string, startedAt: string, source: "quick" | "manual" = "quick"): BowelEntry {
  return { id, source, startedAt, endedAt: null, updatedAt: startedAt, ...emptyBowelDetails() };
}

export function addBowelEntry(store: BowelStore, entry: BowelEntry): BowelStore {
  if (!normalizeBowelEntry(entry)) throw new Error("这次记录的时间或内容无效。");
  if (store.entries.some((item) => item.id === entry.id)) return store;
  const day = localDayKey(new Date(entry.startedAt));
  return { ...store, entries: [...store.entries, entry], noBowelDays: store.noBowelDays.filter((key) => key !== day) };
}

export function startBowelSession(store: BowelStore, session: BowelSession): BowelStore {
  if (store.activeSession) return store;
  if (!session.id || !isTimestamp(session.startedAt)) throw new Error("开始时间无效，请重试。");
  if (store.entries.some((entry) => entry.id === session.id)) throw new Error("这次记录已经完成，请重新开始一次计时。");
  return { ...store, activeSession: session };
}

export function cancelBowelSession(store: BowelStore, sessionId: string): BowelStore {
  if (store.activeSession?.id !== sessionId) throw new Error("计时状态已经变化，请查看最新状态。");
  return { ...store, activeSession: null };
}

export function finishBowelSession(store: BowelStore, sessionId: string, endedAt: string): BowelStore {
  if (store.entries.some((entry) => entry.id === sessionId)) return store;
  const session = store.activeSession;
  if (!session || session.id !== sessionId) throw new Error("这次计时已在其他页面结束或取消，请查看最新记录。");
  if (!isTimestamp(endedAt) || Date.parse(endedAt) < Date.parse(session.startedAt)) throw new Error("设备时间发生了变化，结束时间不能早于开始时间。");
  const entry: BowelEntry = {
    ...makeBowelEntry(session.id, session.startedAt),
    source: "timer",
    endedAt,
    updatedAt: endedAt,
  };
  return { ...addBowelEntry(store, entry), activeSession: null };
}

export function updateBowelEntry(store: BowelStore, entry: BowelEntry, expectedUpdatedAt: string): BowelStore {
  const existing = store.entries.find((item) => item.id === entry.id);
  if (!existing) throw new Error("这条记录已经被删除，请关闭后查看最新记录。");
  if (existing.updatedAt !== expectedUpdatedAt) throw new Error("这条记录已在其他页面更新，请关闭后重新打开。");
  if (!normalizeBowelEntry(entry)) throw new Error("请检查这次记录的时间和选项。");
  const day = localDayKey(new Date(entry.startedAt));
  return {
    ...store,
    entries: store.entries.map((item) => item.id === entry.id ? entry : item),
    noBowelDays: store.noBowelDays.filter((key) => key !== day),
  };
}

export function setNoBowelDay(store: BowelStore, day: string, marked: boolean): BowelStore {
  if (!isDayKey(day)) throw new Error("日期无效。");
  if (marked && store.entries.some((entry) => localDayKey(new Date(entry.startedAt)) === day)) throw new Error("这一天已经有记录，不能同时标记为没有。");
  if (marked && store.activeSession) throw new Error("请先结束或取消当前计时，再标记没有。");
  return {
    ...store,
    noBowelDays: marked ? [...new Set([...store.noBowelDays, day])] : store.noBowelDays.filter((key) => key !== day),
  };
}
