"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, FormEvent } from "react";
import {
  CalendarDays,
  Clock3,
  Download,
  Droplets,
  GlassWater,
  Palette,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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

type ThemeId = "cream" | "blue" | "sage" | "berry";

type WaterEntry = {
  id: string;
  amountMl: number;
  drankAt: string;
};

type WaterStore = {
  version: 1;
  theme: ThemeId;
  dailyGoalMl: number;
  quickAmountsMl: number[];
  entries: WaterEntry[];
};

type DaySummary = {
  key: string;
  label: string;
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
  dailyGoalMl: 2000,
  quickAmountsMl: [250, 350, 500],
  entries: [],
};

function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
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

  const quickAmounts = Array.isArray(parsed.quickAmountsMl)
    ? parsed.quickAmountsMl.filter(
        (amount): amount is number =>
          typeof amount === "number" &&
          Number.isFinite(amount) &&
          amount > 0 &&
          amount <= 5000,
      )
    : [];

  return {
    version: 1,
    theme: isThemeId(parsed.theme) ? parsed.theme : DEFAULT_STORE.theme,
    dailyGoalMl:
      typeof parsed.dailyGoalMl === "number" &&
      Number.isFinite(parsed.dailyGoalMl) &&
      parsed.dailyGoalMl > 0
        ? parsed.dailyGoalMl
        : DEFAULT_STORE.dailyGoalMl,
    quickAmountsMl: quickAmounts.length
      ? quickAmounts
      : DEFAULT_STORE.quickAmountsMl,
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

function createEntry(amountMl: number): WaterEntry {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    amountMl,
    drankAt: new Date().toISOString(),
  };
}

export default function Home() {
  const [store, setStore] = useState<WaterStore>(DEFAULT_STORE);
  const [customAmount, setCustomAmount] = useState("");
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setStore(localWaterRepository.load() ?? DEFAULT_STORE);
    setNow(new Date());
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (isReady) localWaterRepository.save(store);
  }, [isReady, store]);

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
  const todayTotal = todayEntries.reduce(
    (sum, entry) => sum + entry.amountMl,
    0,
  );
  const progress = Math.min(
    100,
    Math.round((todayTotal / store.dailyGoalMl) * 100),
  );
  const remaining = Math.max(0, store.dailyGoalMl - todayTotal);
  const week = useMemo(
    () => buildWeek(now ?? new Date(2026, 0, 1), store.entries),
    [now, store.entries],
  );
  const dateLabel = now
    ? new Intl.DateTimeFormat("zh-CN", {
        month: "long",
        day: "numeric",
        weekday: "short",
      }).format(now)
    : "今天";

  function selectTheme(value: string) {
    if (!isThemeId(value)) return;
    setStore((current) => ({ ...current, theme: value }));
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
      setNow(new Date());
      setIsSettingsOpen(false);
      toast.success(`已导入 ${importedStore.entries.length} 条记录`);
    } catch {
      toast.error("文件无法读取，请确认它是 JSON 备份文件");
    }
  }

  const gaugeStyle = { "--progress": `${progress}%` } as CSSProperties;

  return (
    <main className="water-app" data-theme={store.theme}>
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

            <Sheet open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="settings-trigger"
                  aria-label="打开设置"
                  title="设置"
                >
                  <Settings2 aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="settings-sheet"
                data-theme={store.theme}
              >
                <SheetHeader className="settings-header">
                  <SheetTitle>设置</SheetTitle>
                  <SheetDescription>
                    切换页面配色，备份或恢复你的饮水记录。
                  </SheetDescription>
                </SheetHeader>

                <div className="settings-body">
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
                    </RadioGroup>
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
                      导入后会替换当前浏览器中的记录与配色设置。
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
              <span className="percentage">{progress}%</span>
            </div>

            <div className="progress-zone">
              <div
                className="progress-gauge"
                style={gaugeStyle}
                role="img"
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
                  {remaining > 0 ? `还差 ${remaining} ml` : "今天喝够了"}
                </strong>
                <p>
                  {remaining > 0
                    ? "慢慢喝，每一杯都算数。"
                    : "做得很好，继续保持舒服的节奏。"}
                </p>
                <Progress
                  value={progress}
                  className="soft-progress"
                  aria-label="今日饮水进度"
                />
              </div>
            </div>

            <div className="quick-area">
              <div className="quick-label-row">
                <span>选一杯，轻轻点一下</span>
                {lastAddedId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="undo-button"
                    onClick={undoLast}
                  >
                    <Undo2 />
                    撤销
                  </Button>
                ) : null}
              </div>
              <div className="quick-grid">
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
          </section>

          <aside className="side-stack">
            <section className="panel history-panel" aria-labelledby="log-heading">
              <div className="panel-heading">
                <div>
                  <p className="section-kicker">今日明细</p>
                  <h2 id="log-heading">喝水记录</h2>
                </div>
                <span className="entry-count">{todayEntries.length} 杯</span>
              </div>

              <div className="history-list" aria-live="polite">
                {todayEntries.length ? (
                  todayEntries.map((entry) => (
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
                    <strong>今天的杯子还空着</strong>
                    <p>从左边选一杯，第一条记录就会出现在这里。</p>
                  </div>
                )}
              </div>
            </section>

            <section className="panel week-panel" aria-labelledby="week-heading">
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
          </aside>
        </div>

        <footer className="app-footer">
          <span className={isReady ? "status-dot ready" : "status-dot"} />
          记录保存在当前设备，已为未来同步留好位置
        </footer>
      </div>

      <Toaster position="top-center" theme="light" closeButton />
    </main>
  );
}
