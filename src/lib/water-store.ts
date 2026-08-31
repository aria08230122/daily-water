import { DEFAULT_QUICK_AMOUNTS_ML, normalizeQuickAmounts } from "./quick-amounts.ts";

export type ThemeId = "cream" | "blue" | "sage" | "berry" | "custom";
export type WaterEntry = { id: string; amountMl: number; drankAt: string };
export type WaterStore = {
  version: 1;
  theme: ThemeId;
  customColor: string;
  dailyGoalMl: number;
  quickAmountsMl: number[];
  entries: WaterEntry[];
};

export const THEMES: Array<{ id: ThemeId; name: string }> = [
  { id: "cream", name: "奶油杏" },
  { id: "blue", name: "雾霾蓝" },
  { id: "sage", name: "鼠尾草" },
  { id: "berry", name: "豆沙莓" },
];

export const STORAGE_KEY = "daily-water/store-v1";
export const DEFAULT_STORE: WaterStore = {
  version: 1,
  theme: "cream",
  customColor: "#89A7A2",
  dailyGoalMl: 2000,
  quickAmountsMl: [...DEFAULT_QUICK_AMOUNTS_ML],
  entries: [],
};

export function isThemeId(value: unknown): value is ThemeId {
  return value === "custom" || THEMES.some((theme) => theme.id === value);
}

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export function normalizeWaterStore(value: unknown): WaterStore | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<WaterStore>;
  if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return null;
  const entries = parsed.entries.filter(
    (entry): entry is WaterEntry =>
      typeof entry?.id === "string" &&
      typeof entry?.amountMl === "number" &&
      Number.isFinite(entry.amountMl) &&
      entry.amountMl > 0 && entry.amountMl <= 5000 &&
      typeof entry?.drankAt === "string" && !Number.isNaN(Date.parse(entry.drankAt)),
  );
  return {
    version: 1,
    theme: isThemeId(parsed.theme) ? parsed.theme : DEFAULT_STORE.theme,
    customColor: isHexColor(parsed.customColor) ? parsed.customColor.toUpperCase() : DEFAULT_STORE.customColor,
    dailyGoalMl: typeof parsed.dailyGoalMl === "number" && Number.isFinite(parsed.dailyGoalMl) && parsed.dailyGoalMl > 0
      ? parsed.dailyGoalMl : DEFAULT_STORE.dailyGoalMl,
    quickAmountsMl: normalizeQuickAmounts(parsed.quickAmountsMl),
    entries,
  };
}
