"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, FormEvent } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Droplets,
  GlassWater,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  Smartphone,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import {
  DEFAULT_QUICK_AMOUNTS_ML,
  MAX_QUICK_AMOUNTS,
  MAX_QUICK_AMOUNT_ML,
  normalizeQuickAmounts,
  validateQuickAmountDrafts,
} from "@/lib/quick-amounts";

type ThemeId = "cream" | "blue" | "sage" | "berry" | "custom";

type WaterEntry = {
  id: string;
  amountMl: number;
  drankAt: string;
};

type WaterStore = {
  version: 1;
  theme: ThemeId;
  customColor: string;
  dailyGoalMl: number;
  quickAmountsMl: number[];
  entries: WaterEntry[];
};

type DaySummary = {
  key: string;
  label: string;
  totalMl: number;
};

type CalendarDay = {
  key: string;
  date: Date;
  dayNumber: number;
  isCurrentMonth: boolean;
  totalMl: number;
};

const THEMES: Array<{ id: ThemeId; name: string }> = [
  { id: "cream", name: "奶油杏" },
  { id: "blue", name: "雾霾蓝" },
  { id: "sage", name: "鼠尾草" },
  { id: "berry", name: "豆沙莓" },
];

const STORAGE_KEY = "daily-water/store-v1";
const DEFAULT_STORE: WaterStore = {
  version: 1,
  theme: "cream",
  customColor: "#89A7A2",
  dailyGoalMl: 2000,
  quickAmountsMl: [...DEFAULT_QUICK_AMOUNTS_ML],
  entries: [],
};

function isThemeId(value: unknown): value is ThemeId {
  return value === "custom" || THEMES.some((theme) => theme.id === value);
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function normalizeWaterStore(value: unknown): WaterStore | null {
  if (!value || typeof value !== "object") return null;

  const parsed = value as Partial<WaterStore>;
  if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return null;

  const entries = parsed.entries.filter(
    (entry): entry is WaterEntry =>
      typeof entry?.id === "string" &&
      typeof entry?.amountMl === "number" &&
      Number.isFinite(entry.amountMl) &&
      entry.amountMl > 0 &&
      entry.amountMl <= 5000 &&
      typeof entry?.drankAt === "string" &&
      !Number.isNaN(Date.parse(entry.drankAt)),
  );

  return {
    version: 1,
    theme: isThemeId(parsed.theme) ? parsed.theme : DEFAULT_STORE.theme,
    customColor: isHexColor(parsed.customColor)
      ? parsed.customColor.toUpperCase()
      : DEFAULT_STORE.customColor,
    dailyGoalMl:
      typeof parsed.dailyGoalMl === "number" &&
      Number.isFinite(parsed.dailyGoalMl) &&
      parsed.dailyGoalMl > 0
        ? parsed.dailyGoalMl
        : DEFAULT_STORE.dailyGoalMl,
    quickAmountsMl: normalizeQuickAmounts(parsed.quickAmountsMl),
    entries,
  };
}

// Persistence stays behind a small adapter so a cloud sync repository can be
// added later without rewriting the page or the data model.
const localWaterRepository = {
  load(): WaterStore | null {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    try {
      return normalizeWaterStore(JSON.parse(raw));
    } catch {
      return null;
    }
  },
  save(store: WaterStore) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  },
};

function localDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromDayKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function dateTimeInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function buildWeek(now: Date, entries: WaterEntry[]): DaySummary[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const key = localDayKey(date);

    return {
      key,
      label:
        index === 6
          ? "今天"
          : new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(
              date,
            ),
      totalMl: entries
        .filter((entry) => localDayKey(new Date(entry.drankAt)) === key)
        .reduce((sum, entry) => sum + entry.amountMl, 0),
    };
  });
}

function buildMonth(
  cursor: Date,
  entries: WaterEntry[],
): CalendarDay[] {
  const firstDay = new Date(
    cursor.getFullYear(),
    cursor.getMonth(),
    1,
    12,
  );
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - mondayOffset);

  const totals = new Map<string, number>();
  entries.forEach((entry) => {
    const key = localDayKey(new Date(entry.drankAt));
    totals.set(key, (totals.get(key) ?? 0) + entry.amountMl);
  });

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const key = localDayKey(date);

    return {
      key,
      date,
      dayNumber: date.getDate(),
      isCurrentMonth: date.getMonth() === cursor.getMonth(),
      totalMl: totals.get(key) ?? 0,
    };
  });
}

function createEntry(amountMl: number, drankAt = new Date()): WaterEntry {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    amountMl,
    drankAt: drankAt.toISOString(),
  };
}

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function Home() {
  const [store, setStore] = useState<WaterStore>(DEFAULT_STORE);
  const [customAmount, setCustomAmount] = useState("");
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState("2000");
  const [quickAmountDrafts, setQuickAmountDrafts] = useState<string[]>(
    DEFAULT_QUICK_AMOUNTS_ML.map(String),
  );
  const [quickAmountError, setQuickAmountError] = useState("");
  const [customColorDraft, setCustomColorDraft] = useState(
    DEFAULT_STORE.customColor,
  );
  const [selectedDayKey, setSelectedDayKey] = useState("");
  const [calendarCursor, setCalendarCursor] = useState<Date | null>(null);
  const [isEntryDialogOpen, setIsEntryDialogOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [entryAmountDraft, setEntryAmountDraft] = useState("");
  const [entryTimeDraft, setEntryTimeDraft] = useState("");
  const [installPrompt, setInstallPrompt] =
    useState<InstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const quickSettingsTriggerRef = useRef<HTMLButtonElement>(null);
  const quickSettingsHeadingRef = useRef<HTMLHeadingElement>(null);
  const settingsOpenedFromQuickRef = useRef(false);
  const pendingQuickFocusRef = useRef<number | null>(null);

  useEffect(() => {
    const index = pendingQuickFocusRef.current;
    if (index === null) return;
    document.getElementById(`quick-amount-${index}`)?.focus();
    pendingQuickFocusRef.current = null;
  }, [quickAmountDrafts]);

  useEffect(() => {
    const currentDate = new Date();
    setStore(localWaterRepository.load() ?? DEFAULT_STORE);
    setNow(currentDate);
    setSelectedDayKey(localDayKey(currentDate));
    setCalendarCursor(
      new Date(currentDate.getFullYear(), currentDate.getMonth(), 1, 12),
    );
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (isReady) localWaterRepository.save(store);
  }, [isReady, store]);

  useEffect(() => {
    const standaloneNavigator = navigator as Navigator & {
      standalone?: boolean;
    };
    setIsStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        Boolean(standaloneNavigator.standalone),
    );

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setIsStandalone(true);
      toast.success("喝水小记已安装到桌面");
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    const registerServiceWorker = () => {
      if (!("serviceWorker" in navigator)) return;
      const serviceWorkerUrl = new URL("sw.js", document.baseURI);
      const scope = new URL("./", document.baseURI).pathname;
      void navigator.serviceWorker.register(serviceWorkerUrl, { scope });
    };

    if (document.readyState === "complete") {
      registerServiceWorker();
    } else {
      window.addEventListener("load", registerServiceWorker, { once: true });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener("load", registerServiceWorker);
    };
  }, []);

  useEffect(() => {
    const themeColors: Record<Exclude<ThemeId, "custom">, string> = {
      cream: "#F6F0E7",
      blue: "#EEF2F3",
      sage: "#F0F2EB",
      berry: "#F5EDEF",
    };
    const color =
      store.theme === "custom"
        ? store.customColor
        : themeColors[store.theme];
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", color);
  }, [store.customColor, store.theme]);

  const todayKey = now ? localDayKey(now) : "";
  const todayEntries = useMemo(
    () =>
      store.entries
        .filter(
          (entry) =>
            todayKey && localDayKey(new Date(entry.drankAt)) === todayKey,
        )
        .sort(
          (a, b) =>
            new Date(b.drankAt).getTime() - new Date(a.drankAt).getTime(),
        ),
    [store.entries, todayKey],
  );
  const selectedEntries = useMemo(
    () =>
      store.entries
        .filter(
          (entry) =>
            selectedDayKey &&
            localDayKey(new Date(entry.drankAt)) === selectedDayKey,
        )
        .sort(
          (a, b) =>
            new Date(b.drankAt).getTime() - new Date(a.drankAt).getTime(),
        ),
    [selectedDayKey, store.entries],
  );
  const todayTotal = todayEntries.reduce(
    (sum, entry) => sum + entry.amountMl,
    0,
  );
  const progress = Math.min(
    100,
    Math.round((todayTotal / store.dailyGoalMl) * 100),
  );
  const remaining = Math.max(0, store.dailyGoalMl - todayTotal);
  const overGoal = Math.max(0, todayTotal - store.dailyGoalMl);
  const week = useMemo(
    () => buildWeek(now ?? new Date(2026, 0, 1), store.entries),
    [now, store.entries],
  );
  const monthDays = useMemo(
    () =>
      buildMonth(
        calendarCursor ?? new Date(2026, 0, 1),
        store.entries,
      ),
    [calendarCursor, store.entries],
  );
  const dateLabel = now
    ? new Intl.DateTimeFormat("zh-CN", {
        month: "long",
        day: "numeric",
        weekday: "short",
      }).format(now)
    : "今天";
  const monthLabel = calendarCursor
    ? new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "long",
      }).format(calendarCursor)
    : "本月";
  const selectedDateLabel = selectedDayKey
    ? selectedDayKey === todayKey
      ? "今天"
      : new Intl.DateTimeFormat("zh-CN", {
          month: "long",
          day: "numeric",
          weekday: "short",
        }).format(dateFromDayKey(selectedDayKey))
    : "今天";
  const gaugeStyle = {
    "--progress": `${progress}%`,
  } as CSSProperties;
  const customThemeStyle = {
    "--custom-color": store.customColor,
  } as CSSProperties;

  function selectTheme(value: string) {
    if (!isThemeId(value)) return;
    setStore((current) => ({ ...current, theme: value }));
  }

  function handleSettingsOpenChange(open: boolean) {
    if (open) {
      setGoalDraft(String(store.dailyGoalMl));
      setCustomColorDraft(store.customColor);
      setQuickAmountDrafts(store.quickAmountsMl.map(String));
      setQuickAmountError("");
    }
    setIsSettingsOpen(open);
  }

  function saveDailyGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const goal = Math.round(Number(goalDraft));

    if (!Number.isFinite(goal) || goal < 250 || goal > 10000) {
      toast.error("每日目标请输入 250–10000 ml");
      return;
    }
    setStore((current) => ({
      ...current,
      dailyGoalMl: goal,
    }));
    toast.success("每日饮水目标已保存");
  }

  function openQuickAmountSettings() {
    settingsOpenedFromQuickRef.current = true;
    handleSettingsOpenChange(true);
  }

  function addQuickAmountDraft() {
    if (quickAmountDrafts.length >= MAX_QUICK_AMOUNTS) return;
    pendingQuickFocusRef.current = quickAmountDrafts.length;
    setQuickAmountDrafts((current) => [...current, ""]);
    setQuickAmountError("");
  }

  function removeQuickAmountDraft(index: number) {
    if (quickAmountDrafts.length <= 1) return;
    pendingQuickFocusRef.current = Math.min(index, quickAmountDrafts.length - 2);
    setQuickAmountDrafts((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
    setQuickAmountError("");
  }

  function resetQuickAmountDrafts() {
    setQuickAmountDrafts(DEFAULT_QUICK_AMOUNTS_ML.map(String));
    setQuickAmountError("");
  }

  function saveQuickAmounts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateQuickAmountDrafts(quickAmountDrafts);
    if (!result.ok) {
      setQuickAmountError(result.message);
      return;
    }

    setStore((current) => ({ ...current, quickAmountsMl: result.amounts }));
    setQuickAmountDrafts(result.amounts.map(String));
    setQuickAmountError("");
    if (settingsOpenedFromQuickRef.current) setIsSettingsOpen(false);
    toast.success("快捷杯量已保存，首页按钮已更新");
  }

  function applyCustomTheme(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isHexColor(customColorDraft)) {
      toast.error("请输入完整的十六进制颜色，例如 #89A7A2");
      return;
    }

    const color = customColorDraft.toUpperCase();
    setCustomColorDraft(color);
    setStore((current) => ({
      ...current,
      theme: "custom",
      customColor: color,
    }));
    toast.success("自定义配色已应用");
  }

  async function installApp() {
    if (isStandalone) {
      toast("喝水小记已经安装好了");
      return;
    }
    if (!installPrompt) {
      toast("请打开浏览器菜单，选择“添加到主屏幕”或“安装应用”");
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setInstallPrompt(null);
    }
  }

  function addWater(amountMl: number) {
    if (!Number.isFinite(amountMl) || amountMl < 1 || amountMl > 5000) {
      toast.error("请输入 1–5000 ml 之间的水量");
      return;
    }

    const entry = createEntry(Math.round(amountMl));
    setStore((current) => ({
      ...current,
      entries: [...current.entries, entry],
    }));
    setLastAddedId(entry.id);
    setCustomAmount("");
    setNow(new Date());
    toast.success(`记下 ${entry.amountMl} ml`, {
      action: {
        label: "撤销",
        onClick: () => {
          setStore((current) => ({
            ...current,
            entries: current.entries.filter((item) => item.id !== entry.id),
          }));
          setLastAddedId(null);
        },
      },
    });
  }

  function deleteEntry(entry: WaterEntry) {
    setStore((current) => ({
      ...current,
      entries: current.entries.filter((item) => item.id !== entry.id),
    }));
    if (lastAddedId === entry.id) setLastAddedId(null);
    toast("这条记录已删除", {
      action: {
        label: "恢复",
        onClick: () =>
          setStore((current) => ({
            ...current,
            entries: [...current.entries, entry],
          })),
      },
    });
  }

  function undoLast() {
    if (!lastAddedId) return;
    setStore((current) => ({
      ...current,
      entries: current.entries.filter((entry) => entry.id !== lastAddedId),
    }));
    setLastAddedId(null);
    toast("已撤销刚才的记录");
  }

  function handleCustomSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    addWater(Number(customAmount));
  }

  function changeMonth(offset: number) {
    setCalendarCursor((current) => {
      const base = current ?? now ?? new Date();
      return new Date(base.getFullYear(), base.getMonth() + offset, 1, 12);
    });
  }

  function selectCalendarDay(day: CalendarDay) {
    setSelectedDayKey(day.key);
    if (!day.isCurrentMonth) {
      setCalendarCursor(
        new Date(day.date.getFullYear(), day.date.getMonth(), 1, 12),
      );
    }
  }

  function openAddEntry() {
    const key = selectedDayKey || todayKey || localDayKey(new Date());
    const selectedDate = dateFromDayKey(key);
    const entryDate = key === todayKey ? new Date() : selectedDate;
    setEditingEntryId(null);
    setEntryAmountDraft("");
    setEntryTimeDraft(dateTimeInputValue(entryDate));
    setIsEntryDialogOpen(true);
  }

  function openEditEntry(entry: WaterEntry) {
    setEditingEntryId(entry.id);
    setEntryAmountDraft(String(entry.amountMl));
    setEntryTimeDraft(dateTimeInputValue(new Date(entry.drankAt)));
    setIsEntryDialogOpen(true);
  }

  function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Math.round(Number(entryAmountDraft));
    const drankAt = new Date(entryTimeDraft);

    if (!Number.isFinite(amount) || amount < 1 || amount > 5000) {
      toast.error("请输入 1–5000 ml 之间的水量");
      return;
    }
    if (Number.isNaN(drankAt.getTime())) {
      toast.error("请选择有效的饮水时间");
      return;
    }
    if (drankAt.getTime() > Date.now() + 60_000) {
      toast.error("饮水时间不能晚于现在");
      return;
    }

    const nextEntry = editingEntryId
      ? null
      : createEntry(amount, drankAt);

    setStore((current) => ({
      ...current,
      entries: editingEntryId
        ? current.entries.map((entry) =>
            entry.id === editingEntryId
              ? { ...entry, amountMl: amount, drankAt: drankAt.toISOString() }
              : entry,
          )
        : [...current.entries, nextEntry as WaterEntry],
    }));

    const savedDayKey = localDayKey(drankAt);
    setSelectedDayKey(savedDayKey);
    setCalendarCursor(
      new Date(drankAt.getFullYear(), drankAt.getMonth(), 1, 12),
    );
    setNow(new Date());
    setIsEntryDialogOpen(false);
    toast.success(editingEntryId ? "记录已更新" : "补记成功");
  }

  function exportData() {
    const payload = {
      app: "daily-water",
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      data: store,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `喝水小记-${localDayKey(new Date())}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success(`已导出 ${store.entries.length} 条记录`);
  }

  async function importData(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("文件过大，请选择 5 MB 以内的备份文件");
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const candidate =
        parsed &&
        typeof parsed === "object" &&
        "app" in parsed &&
        (parsed as { app?: unknown }).app === "daily-water" &&
        "data" in parsed
          ? (parsed as { data: unknown }).data
          : parsed;
      const importedStore = normalizeWaterStore(candidate);

      if (!importedStore) {
        toast.error("这不是有效的喝水小记备份文件");
        return;
      }

      localWaterRepository.save(importedStore);
      setStore(importedStore);
      setLastAddedId(null);
      setCustomAmount("");
      const currentDate = new Date();
      setNow(currentDate);
      setSelectedDayKey(localDayKey(currentDate));
      setCalendarCursor(
        new Date(currentDate.getFullYear(), currentDate.getMonth(), 1, 12),
      );
      setIsSettingsOpen(false);
      toast.success(`已导入 ${importedStore.entries.length} 条记录`);
    } catch {
      toast.error("文件无法读取，请确认它是 JSON 备份文件");
    }
  }

  return (
    <main
      className="water-app"
      data-theme={store.theme}
      style={customThemeStyle}
    >
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <div className="app-shell">
        <header className="app-header">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">
              <Droplets />
            </span>
            <div>
              <p className="eyebrow">Hydration diary</p>
              <h1>喝水小记</h1>
            </div>
          </div>
          <div className="header-actions">
            <div className="date-pill">
              <CalendarDays aria-hidden="true" />
              <span>{dateLabel}</span>
            </div>

            <Sheet
              open={isSettingsOpen}
              onOpenChange={handleSettingsOpenChange}
            >
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="settings-trigger"
                  aria-label="打开设置"
                  title="设置"
                  onClick={() => {
                    settingsOpenedFromQuickRef.current = false;
                  }}
                >
                  <Settings2 aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="settings-sheet"
                data-theme={store.theme}
                style={customThemeStyle}
                onOpenAutoFocus={(event) => {
                  if (!settingsOpenedFromQuickRef.current) return;
                  event.preventDefault();
                  const heading = quickSettingsHeadingRef.current;
                  const settingsBody =
                    heading?.closest<HTMLElement>(".settings-body");
                  heading?.focus({ preventScroll: true });
                  if (heading && settingsBody) {
                    settingsBody.scrollTop +=
                      heading.getBoundingClientRect().top -
                      settingsBody.getBoundingClientRect().top -
                      20;
                  }
                }}
                onCloseAutoFocus={(event) => {
                  if (!settingsOpenedFromQuickRef.current) return;
                  event.preventDefault();
                  quickSettingsTriggerRef.current?.focus({ preventScroll: true });
                  settingsOpenedFromQuickRef.current = false;
                }}
              >
                <SheetHeader className="settings-header">
                  <SheetTitle>设置</SheetTitle>
                  <SheetDescription>
                    调整饮水习惯、页面配色与本地数据。
                  </SheetDescription>
                </SheetHeader>

                <div className="settings-body">
                  <section
                    className="settings-section"
                    aria-labelledby="preference-heading"
                  >
                    <div className="settings-section-title">
                      <GlassWater aria-hidden="true" />
                      <div>
                        <h2 id="preference-heading">饮水习惯</h2>
                        <p>按自己的节奏设置每日目标</p>
                      </div>
                    </div>
                    <form className="preference-form" onSubmit={saveDailyGoal}>
                      <label htmlFor="daily-goal">每日目标</label>
                      <div className="settings-input-wrap">
                        <Input
                          id="daily-goal"
                          type="number"
                          min="250"
                          max="10000"
                          step="50"
                          inputMode="numeric"
                          value={goalDraft}
                          onChange={(event) => setGoalDraft(event.target.value)}
                          className="settings-number-input"
                        />
                        <span>ml</span>
                      </div>

                      <Button type="submit" className="save-preferences">
                        保存目标
                      </Button>
                    </form>
                  </section>

                  <section
                    className="settings-section quick-settings-section"
                    aria-labelledby="quick-amounts-heading"
                  >
                    <div className="settings-section-title">
                      <GlassWater aria-hidden="true" />
                      <div>
                        <h2
                          id="quick-amounts-heading"
                          ref={quickSettingsHeadingRef}
                          tabIndex={-1}
                        >
                          自定义快捷杯量
                        </h2>
                        <p>把首页按钮换成你常用水杯的容量</p>
                      </div>
                    </div>
                    <form
                      className="preference-form"
                      onSubmit={saveQuickAmounts}
                      noValidate
                    >
                      <p className="quick-settings-help" id="quick-amount-help">
                        可保留 1–{MAX_QUICK_AMOUNTS} 个杯量，每个 1–5000
                        ml。修改后点保存，历史记录不会改变。
                      </p>
                      <div className="quick-settings-list">
                        {quickAmountDrafts.map((value, index) => (
                          <div
                            className="quick-settings-row"
                            key={`quick-${index}`}
                          >
                            <label htmlFor={`quick-amount-${index}`}>
                              杯量 {index + 1}
                            </label>
                            <div className="settings-input-wrap">
                              <Input
                                id={`quick-amount-${index}`}
                                aria-label={`第 ${index + 1} 个快捷杯量`}
                                aria-describedby={
                                  quickAmountError
                                    ? "quick-amount-help quick-amount-error"
                                    : "quick-amount-help"
                                }
                                aria-invalid={Boolean(quickAmountError)}
                                type="number"
                                min="1"
                                max={MAX_QUICK_AMOUNT_ML}
                                step="1"
                                inputMode="numeric"
                                value={value}
                                placeholder="输入容量"
                                onChange={(event) => {
                                  setQuickAmountDrafts((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? event.target.value
                                        : item,
                                    ),
                                  );
                                  setQuickAmountError("");
                                }}
                                className="settings-number-input"
                              />
                              <span>ml</span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="remove-quick-button"
                              aria-label={`删除第 ${index + 1} 个快捷杯量`}
                              title={
                                quickAmountDrafts.length === 1
                                  ? "至少保留一个杯量"
                                  : "删除这个杯量"
                              }
                              disabled={quickAmountDrafts.length === 1}
                              onClick={() => removeQuickAmountDraft(index)}
                            >
                              <Trash2 aria-hidden="true" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <div className="quick-settings-actions">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="add-quick-button"
                          onClick={addQuickAmountDraft}
                          disabled={
                            quickAmountDrafts.length >= MAX_QUICK_AMOUNTS
                          }
                        >
                          <Plus aria-hidden="true" />
                          添加杯量
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="reset-quick-button"
                          onClick={resetQuickAmountDrafts}
                        >
                          <RotateCcw aria-hidden="true" />
                          恢复默认
                        </Button>
                      </div>
                      {quickAmountError ? (
                        <p
                          id="quick-amount-error"
                          role="alert"
                          className="quick-settings-error"
                        >
                          {quickAmountError}
                        </p>
                      ) : null}
                      <Button type="submit" className="save-preferences">
                        保存杯量
                      </Button>
                    </form>
                  </section>

                  <section
                    className="settings-section"
                    aria-labelledby="theme-heading"
                  >
                    <div className="settings-section-title">
                      <Palette aria-hidden="true" />
                      <div>
                        <h2 id="theme-heading">外观配色</h2>
                        <p>选择一种你今天喜欢的颜色</p>
                      </div>
                    </div>
                    <RadioGroup
                      value={store.theme}
                      onValueChange={selectTheme}
                      className="theme-radio-group"
                      aria-label="选择页面配色"
                    >
                      {THEMES.map((theme) => (
                        <div className="theme-option" key={theme.id}>
                          <RadioGroupItem
                            id={`theme-${theme.id}`}
                            value={theme.id}
                            className="theme-radio"
                          />
                          <label
                            className="theme-choice"
                            htmlFor={`theme-${theme.id}`}
                          >
                            <span
                              className={`theme-swatch swatch-${theme.id}`}
                              aria-hidden="true"
                            />
                            <span>{theme.name}</span>
                          </label>
                        </div>
                      ))}
                      <div className="theme-option">
                        <RadioGroupItem
                          id="theme-custom"
                          value="custom"
                          className="theme-radio"
                        />
                        <label
                          className="theme-choice"
                          htmlFor="theme-custom"
                        >
                          <span
                            className="theme-swatch swatch-custom"
                            aria-hidden="true"
                          />
                          <span>自定义</span>
                        </label>
                      </div>
                    </RadioGroup>
                    {store.theme === "custom" ? (
                      <form
                        className="custom-theme-editor"
                        onSubmit={applyCustomTheme}
                      >
                        <label htmlFor="custom-theme-color">自定义主色</label>
                        <div className="custom-color-controls">
                          <input
                            id="custom-theme-color"
                            type="color"
                            value={customColorDraft}
                            onChange={(event) => {
                              const color = event.target.value.toUpperCase();
                              setCustomColorDraft(color);
                              setStore((current) => ({
                                ...current,
                                theme: "custom",
                                customColor: color,
                              }));
                            }}
                            aria-label="选择自定义主色"
                          />
                          <Input
                            value={customColorDraft}
                            onChange={(event) =>
                              setCustomColorDraft(event.target.value)
                            }
                            maxLength={7}
                            spellCheck={false}
                            aria-label="输入十六进制颜色"
                            className="custom-color-input"
                          />
                          <Button type="submit">应用</Button>
                        </div>
                        <p>页面会自动生成柔和的背景、按钮和强调色。</p>
                      </form>
                    ) : null}
                  </section>

                  <section
                    className="settings-section"
                    aria-labelledby="install-heading"
                  >
                    <div className="settings-section-title">
                      <Smartphone aria-hidden="true" />
                      <div>
                        <h2 id="install-heading">安装到手机</h2>
                        <p>像普通应用一样打开，也支持离线使用</p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="install-button"
                      onClick={installApp}
                    >
                      <Smartphone aria-hidden="true" />
                      {isStandalone ? "已经安装" : "安装喝水小记"}
                    </Button>
                  </section>

                  <section
                    className="settings-section"
                    aria-labelledby="data-heading"
                  >
                    <div className="settings-section-title">
                      <Download aria-hidden="true" />
                      <div>
                        <h2 id="data-heading">数据备份</h2>
                        <p>当前共有 {store.entries.length} 条饮水记录</p>
                      </div>
                    </div>
                    <div className="data-actions">
                      <Button
                        type="button"
                        variant="outline"
                        className="data-button"
                        onClick={exportData}
                      >
                        <Download aria-hidden="true" />
                        导出数据
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="data-button"
                        onClick={() => importInputRef.current?.click()}
                      >
                        <Upload aria-hidden="true" />
                        导入数据
                      </Button>
                      <input
                        ref={importInputRef}
                        className="settings-file-input"
                        type="file"
                        accept="application/json,.json"
                        onChange={importData}
                        aria-label="选择喝水小记备份文件"
                      />
                    </div>
                    <p className="import-note">
                      备份包含饮水记录、目标、快捷杯量与配色，导入后会替换本机对应数据。
                    </p>
                  </section>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <div className="dashboard-grid">
          <section className="primary-card" aria-labelledby="today-heading">
            <div className="section-heading">
              <div>
                <p className="section-kicker">今日饮水</p>
                <h2 id="today-heading">今天喝了多少水？</h2>
              </div>
            </div>

            <div className="progress-zone">
              <div
                className="progress-gauge"
                style={gaugeStyle}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={store.dailyGoalMl}
                aria-valuenow={Math.min(todayTotal, store.dailyGoalMl)}
                aria-label={`今日已饮水 ${todayTotal} 毫升，目标 ${store.dailyGoalMl} 毫升，完成 ${progress}%`}
              >
                <div className="gauge-inner">
                  <span className="gauge-icon" aria-hidden="true">
                    <GlassWater />
                  </span>
                  <strong>{todayTotal.toLocaleString("zh-CN")}</strong>
                  <span>/ {store.dailyGoalMl.toLocaleString("zh-CN")} ml</span>
                </div>
              </div>

              <div className="progress-copy">
                <span className="sparkle-chip">
                  <Sparkles aria-hidden="true" />
                  今日进度
                </span>
                <strong>
                  {remaining > 0
                    ? `还差 ${remaining} ml`
                    : overGoal > 0
                      ? `超出目标 ${overGoal} ml`
                      : "今天喝够了"}
                </strong>
                <p>
                  {remaining > 0
                    ? "慢慢喝，每一杯都算数。"
                    : "做得很好，继续保持舒服的节奏。"}
                </p>
                <Progress
                  value={progress}
                  className="soft-progress"
                  aria-label={`今日饮水进度 ${progress}%`}
                />
              </div>
            </div>

            <div className="quick-area">
              <div className="quick-label-row">
                <span>选一杯，轻轻点一下</span>
                <div className="quick-label-actions">
                  <Button
                    ref={quickSettingsTriggerRef}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="quick-edit-button"
                    aria-label="自定义杯量"
                    aria-haspopup="dialog"
                    onClick={openQuickAmountSettings}
                  >
                    <Pencil aria-hidden="true" />
                    自定义杯量
                  </Button>
                  {lastAddedId ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="undo-button"
                      onClick={undoLast}
                    >
                      <Undo2 aria-hidden="true" />
                      撤销
                    </Button>
                  ) : null}
                </div>
              </div>
              <div
                className="quick-grid"
                style={{
                  gridTemplateColumns: `repeat(${Math.min(store.quickAmountsMl.length, 3)}, minmax(0, 1fr))`,
                }}
              >
                {store.quickAmountsMl.map((amount) => (
                  <Button
                    key={amount}
                    type="button"
                    variant="outline"
                    className="quick-button"
                    onClick={() => addWater(amount)}
                  >
                    <Plus aria-hidden="true" />
                    <strong>{amount}</strong>
                    <span>ml</span>
                  </Button>
                ))}
              </div>

              <form className="custom-form" onSubmit={handleCustomSubmit}>
                <label htmlFor="custom-water">记录其他容量</label>
                <div className="custom-control">
                  <div className="input-wrap">
                    <Input
                      id="custom-water"
                      type="number"
                      min="1"
                      max="5000"
                      step="1"
                      inputMode="numeric"
                      value={customAmount}
                      onChange={(event) => setCustomAmount(event.target.value)}
                      placeholder="输入精确水量"
                      className="water-input"
                    />
                    <span>ml</span>
                  </div>
                  <Button
                    type="submit"
                    className="record-button"
                    disabled={!customAmount}
                  >
                    记下
                  </Button>
                </div>
              </form>
            </div>

            <section className="inline-week" aria-labelledby="week-heading">
              <div className="panel-heading compact">
                <div>
                  <p className="section-kicker">最近七天</p>
                  <h2 id="week-heading">喝水趋势</h2>
                </div>
                <span className="goal-legend">
                  <i aria-hidden="true" />目标 {store.dailyGoalMl} ml
                </span>
              </div>

              <div className="week-chart" aria-label="最近七天饮水量柱状图">
                {week.map((day) => {
                  const ratio = Math.min(
                    100,
                    Math.round((day.totalMl / store.dailyGoalMl) * 100),
                  );
                  return (
                    <div className="day-column" key={day.key}>
                      <span className="day-total">
                        {day.totalMl ? day.totalMl : ""}
                      </span>
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{ height: `${Math.max(5, ratio)}%` }}
                          title={`${day.label}：${day.totalMl} ml`}
                        />
                      </div>
                      <span className="day-label">{day.label}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          </section>

          <aside className="side-stack">
            <section
              className="panel calendar-panel"
              aria-labelledby="calendar-heading"
            >
              <div className="calendar-heading">
                <div>
                  <p className="section-kicker">月度日历</p>
                  <h2 id="calendar-heading">{monthLabel}</h2>
                </div>
                <div className="calendar-nav">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="上个月"
                    onClick={() => changeMonth(-1)}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="下个月"
                    onClick={() => changeMonth(1)}
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </div>

              <div className="calendar-weekdays" aria-hidden="true">
                {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div className="calendar-grid">
                {monthDays.map((day) => {
                  const ratio = Math.min(
                    100,
                    Math.round((day.totalMl / store.dailyGoalMl) * 100),
                  );
                  const className = [
                    "calendar-day",
                    day.isCurrentMonth ? "" : "is-outside",
                    day.key === selectedDayKey ? "is-selected" : "",
                    day.key === todayKey ? "is-today" : "",
                    day.totalMl >= store.dailyGoalMl ? "is-complete" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const dayStyle = {
                    "--day-fill": `${ratio}%`,
                  } as CSSProperties;

                  return (
                    <button
                      type="button"
                      className={className}
                      style={dayStyle}
                      key={day.key}
                      aria-label={`${day.key}，饮水 ${day.totalMl} 毫升`}
                      aria-pressed={day.key === selectedDayKey}
                      onClick={() => selectCalendarDay(day)}
                    >
                      <span>{day.dayNumber}</span>
                      <small>
                        {day.totalMl
                          ? day.totalMl >= 1000
                            ? `${(day.totalMl / 1000).toFixed(1)}L`
                            : day.totalMl
                          : ""}
                      </small>
                    </button>
                  );
                })}
              </div>
              <div className="calendar-legend">
                <span><i className="legend-water" />有记录</span>
                <span><i className="legend-complete" />已达标</span>
              </div>
            </section>

            <section className="panel history-panel" aria-labelledby="log-heading">
              <div className="panel-heading">
                <div>
                  <p className="section-kicker">{selectedDateLabel}</p>
                  <h2 id="log-heading">喝水记录</h2>
                </div>
                <div className="history-heading-actions">
                  <span className="entry-count">{selectedEntries.length} 杯</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="add-entry-button"
                    onClick={openAddEntry}
                  >
                    <Plus />
                    补记
                  </Button>
                </div>
              </div>

              <div className="history-list" aria-live="polite">
                {selectedEntries.length ? (
                  selectedEntries.map((entry) => (
                    <article className="history-row" key={entry.id}>
                      <span className="history-icon" aria-hidden="true">
                        <Droplets />
                      </span>
                      <div className="history-copy">
                        <strong>{entry.amountMl} ml</strong>
                        <span>
                          <Clock3 aria-hidden="true" />
                          {new Intl.DateTimeFormat("zh-CN", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          }).format(new Date(entry.drankAt))}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="edit-button"
                        aria-label={`编辑 ${entry.amountMl} 毫升记录`}
                        onClick={() => openEditEntry(entry)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="delete-button"
                        aria-label={`删除 ${entry.amountMl} 毫升记录`}
                        onClick={() => deleteEntry(entry)}
                      >
                        <Trash2 />
                      </Button>
                    </article>
                  ))
                ) : (
                  <div className="empty-state">
                    <span aria-hidden="true">
                      <GlassWater />
                    </span>
                    <strong>
                      {selectedDayKey === todayKey
                        ? "今天的杯子还空着"
                        : "这一天没有饮水记录"}
                    </strong>
                    <p>
                      点击“补记”，可以补上这一天喝过的水。
                    </p>
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>

        <footer className="app-footer">
          <span className={isReady ? "status-dot ready" : "status-dot"} />
          记录保存在当前设备，已为未来同步留好位置
        </footer>
      </div>

      <Dialog
        open={isEntryDialogOpen}
        onOpenChange={setIsEntryDialogOpen}
      >
        <DialogContent
          className="entry-dialog"
          data-theme={store.theme}
          style={customThemeStyle}
        >
          <DialogHeader>
            <DialogTitle>
              {editingEntryId ? "编辑饮水记录" : "补记饮水"}
            </DialogTitle>
            <DialogDescription>
              填写精确水量和饮水时间，保存后会立即更新统计。
            </DialogDescription>
          </DialogHeader>
          <form className="entry-form" onSubmit={saveEntry}>
            <label htmlFor="entry-amount">饮水量</label>
            <div className="dialog-input-wrap">
              <Input
                id="entry-amount"
                type="number"
                min="1"
                max="5000"
                step="1"
                inputMode="numeric"
                value={entryAmountDraft}
                onChange={(event) =>
                  setEntryAmountDraft(event.target.value)
                }
                placeholder="输入毫升数"
                autoFocus
              />
              <span>ml</span>
            </div>

            <label htmlFor="entry-time">饮水时间</label>
            <Input
              id="entry-time"
              type="datetime-local"
              max={now ? dateTimeInputValue(now) : undefined}
              value={entryTimeDraft}
              onChange={(event) => setEntryTimeDraft(event.target.value)}
              className="dialog-time-input"
            />

            <DialogFooter className="entry-dialog-footer">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsEntryDialogOpen(false)}
              >
                取消
              </Button>
              <Button
                type="submit"
                className="dialog-save-button"
                disabled={!entryAmountDraft || !entryTimeDraft}
              >
                {editingEntryId ? "保存修改" : "记下这杯"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Toaster position="top-center" theme="light" closeButton />
    </main>
  );
}
