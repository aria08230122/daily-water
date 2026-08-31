import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, CircleMinus, Clock3, Pencil, Play, Plus, RotateCcw, Square, Timer, Toilet, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BowelDetailsSheet, StoolShapeIcon, type BowelEditor } from "@/components/bowel-details-sheet";
import {
  AMOUNT_OPTIONS, COLOR_OPTIONS, EFFORT_OPTIONS, PAIN_OPTIONS, STOOL_SHAPES,
  addBowelEntry, cancelBowelSession, dateFromDayKey, elapsedSeconds, finishBowelSession, formatElapsed,
  localDayKey, makeBowelEntry, newRecordId, setNoBowelDay, startBowelSession,
  type BowelEntry,
} from "@/lib/bowel-store";
import type { BowelRepository } from "@/hooks/use-bowel-store";
import type { ThemeId } from "@/lib/water-store";

const timeFormatter = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
const dateFormatter = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" });

function entrySummary(entry: BowelEntry) {
  return [
    STOOL_SHAPES.find((option) => option.value === entry.shape)?.label,
    EFFORT_OPTIONS.find((option) => option.value === entry.effort)?.label,
    COLOR_OPTIONS.find((option) => option.value === entry.color)?.label,
    AMOUNT_OPTIONS.find((option) => option.value === entry.amount)?.label,
    PAIN_OPTIONS.find((option) => option.value === entry.pain)?.label,
  ].filter(Boolean).join(" · ");
}

function entryTime(entry: BowelEntry) {
  const start = new Date(entry.startedAt);
  if (!entry.endedAt) return timeFormatter.format(start);
  const end = new Date(entry.endedAt);
  const endDate = localDayKey(start) !== localDayKey(end) ? `${dateFormatter.format(end)} ` : "";
  return `${timeFormatter.format(start)} → ${endDate}${timeFormatter.format(end)}`;
}

export function BowelPage({ repository, theme, customColor }: {
  repository: BowelRepository;
  theme: ThemeId;
  customColor: string;
}) {
  const { state, ready, busy, error } = repository;
  const [clock, setClock] = useState(Date.now);
  const [selectedDay, setSelectedDay] = useState(() => localDayKey(new Date()));
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12));
  const [editor, setEditor] = useState<BowelEditor | null>(null);
  const [confirmation, setConfirmation] = useState<{ kind: "cancel"; sessionId: string } | { kind: "delete"; entry: BowelEntry } | null>(null);
  const originRef = useRef<HTMLElement | null>(null);
  const quickButtonRef = useRef<HTMLButtonElement>(null);
  const lastTodayRef = useRef(localDayKey(new Date()));
  const active = state.activeSession;
  const today = localDayKey(new Date(clock));
  const elapsed = active ? elapsedSeconds(active.startedAt, clock) : 0;
  const style = { "--custom-color": customColor } as CSSProperties;

  useEffect(() => {
    const updateClock = () => setClock(Date.now());
    const onVisible = () => { if (!document.hidden) updateClock(); };
    updateClock();
    const interval = window.setInterval(updateClock, active ? 1000 : 60_000);
    window.addEventListener("focus", updateClock);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", updateClock);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active?.id]);

  useEffect(() => {
    if (today !== lastTodayRef.current && selectedDay === lastTodayRef.current) {
      setSelectedDay(today);
      const date = dateFromDayKey(today);
      setMonth(new Date(date.getFullYear(), date.getMonth(), 1, 12));
    }
    lastTodayRef.current = today;
  }, [today, selectedDay]);

  const entriesByDay = useMemo(() => {
    const grouped = new Map<string, BowelEntry[]>();
    for (const entry of state.entries) {
      const key = localDayKey(new Date(entry.startedAt));
      grouped.set(key, [...(grouped.get(key) ?? []), entry]);
    }
    for (const entries of grouped.values()) entries.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
    return grouped;
  }, [state.entries]);
  const todayCount = entriesByDay.get(today)?.length ?? 0;
  const selectedEntries = entriesByDay.get(selectedDay) ?? [];
  const markedNone = state.noBowelDays.includes(selectedDay);
  const selectedLabel = selectedDay === today ? "今天" : dateFormatter.format(dateFromDayKey(selectedDay));
  const monthLabel = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(month);
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
    const start = new Date(first);
    start.setDate(1 - (first.getDay() + 6) % 7);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return { key: localDayKey(date), date, inMonth: date.getMonth() === month.getMonth() };
    });
  }, [month]);

  function selectEntryDay(entry: BowelEntry) {
    const date = new Date(entry.startedAt);
    setSelectedDay(localDayKey(date));
    setMonth(new Date(date.getFullYear(), date.getMonth(), 1, 12));
  }

  function rememberFocus() {
    originRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  function restoreFocus() {
    (originRef.current?.isConnected ? originRef.current : quickButtonRef.current)?.focus({ preventScroll: true });
  }

  function reportError(reason: unknown) {
    toast.error(reason instanceof Error ? reason.message : "这次尚未保存，请重试。");
  }

  async function startTimer() {
    const session = { id: newRecordId(), startedAt: new Date().toISOString() };
    try {
      await repository.mutate((current) => startBowelSession(current, session));
      setClock(Date.now());
    } catch (reason) { reportError(reason); }
  }

  async function finishTimer() {
    if (!active) return;
    rememberFocus();
    const sessionId = active.id;
    const endedAt = new Date().toISOString();
    try {
      const next = await repository.mutate((current) => finishBowelSession(current, sessionId, endedAt));
      const saved = next.entries.find((entry) => entry.id === sessionId);
      if (saved) {
        selectEntryDay(saved);
        setEditor({ entry: saved, isNew: false, autoSaved: true });
      }
    } catch (reason) { reportError(reason); }
  }

  async function quickRecord() {
    rememberFocus();
    const entry = makeBowelEntry(newRecordId(), new Date().toISOString());
    try {
      await repository.mutate((current) => {
        if (current.activeSession) throw new Error("正在计时，请先结束这一次，再快捷记录。");
        return addBowelEntry(current, entry);
      });
      selectEntryDay(entry);
      setEditor({ entry, isNew: false, autoSaved: true });
    } catch (reason) { reportError(reason); }
  }

  function addManualRecord() {
    rememberFocus();
    const date = selectedDay === today ? new Date() : dateFromDayKey(selectedDay);
    setEditor({ entry: makeBowelEntry(newRecordId(), date.toISOString(), "manual"), isNew: true, autoSaved: false });
  }

  async function toggleNone() {
    try {
      await repository.mutate((current) => setNoBowelDay(current, selectedDay, !markedNone));
    } catch (reason) { reportError(reason); }
  }

  async function confirmAction() {
    if (!confirmation) return;
    try {
      if (confirmation.kind === "cancel") {
        await repository.mutate((current) => cancelBowelSession(current, confirmation.sessionId));
        toast("已取消这次计时，没有新增记录");
      } else {
        const id = confirmation.entry.id;
        const removed: { entry?: BowelEntry } = {};
        await repository.mutate((current) => {
          removed.entry = current.entries.find((entry) => entry.id === id);
          return { ...current, entries: current.entries.filter((entry) => entry.id !== id) };
        });
        if (removed.entry) {
          const entry = removed.entry;
          toast("这次记录已删除", { action: { label: "撤销", onClick: () => {
            void repository.mutate((current) => addBowelEntry(current, entry)).catch(reportError);
          } } });
        }
      }
      setConfirmation(null);
    } catch (reason) { reportError(reason); }
  }

  return (
    <div className="bowel-page" id="bowel-page">
      {error ? <div className="bowel-storage-error" role="alert"><p>{error}</p><Button type="button" variant="ghost" onClick={repository.refresh}>重试读取</Button></div> : null}
      <div className="bowel-dashboard">
        <section className="primary-card bowel-main-card" aria-labelledby="bowel-heading">
          <div className="section-heading">
            <div><p className="section-kicker">今日便便</p><h2 id="bowel-heading">身体的小日常</h2></div>
            <span className="bowel-count-chip">{todayCount > 0 ? `${todayCount} 次` : state.noBowelDays.includes(today) ? "已标记没有" : "未记录"}</span>
          </div>
          <div className="bowel-timer-card" data-running={Boolean(active)}>
            <span className="bowel-timer-icon" aria-hidden="true"><Timer /></span>
            <p className="bowel-timer-label">{active ? "正在计时" : "准备好，就开始"}</p>
            <output className="bowel-timer-value" role="timer" aria-live="off" aria-label="便便计时">{formatElapsed(elapsed)}</output>
            <p className="bowel-timer-caption">{active ? `${dateFormatter.format(new Date(active.startedAt))} ${timeFormatter.format(new Date(active.startedAt))} 开始` : "点开始记下时间，结束时自动保存。"}</p>
            <Button type="button" className="bowel-primary-button" disabled={!ready || busy} onClick={() => { void (active ? finishTimer() : startTimer()); }}>
              {active ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
              {busy ? "正在保存…" : active ? "结束并保存" : "开始"}
            </Button>
            {active ? (
              <>
                <p className="bowel-timer-reassurance">切换页面、锁屏或重开后，计时会继续。</p>
                {elapsed >= 3600 ? <p className="bowel-timer-reminder">如果忘了结束，可以先保存，再在记录里修正时间。</p> : null}
                <button type="button" className="bowel-cancel-timer" disabled={busy} onClick={() => setConfirmation({ kind: "cancel", sessionId: active.id })}>取消这次计时</button>
              </>
            ) : <p className="bowel-timer-reassurance">颜色、量、腹痛和备注，结束后再慢慢补。</p>}
          </div>
          <div className="bowel-quick-area">
            <div><strong>已经结束了？</strong><p>{active ? "先结束当前计时，就会自动记下这一次。" : "不计时，也能轻轻记一次。"}</p></div>
            <Button ref={quickButtonRef} type="button" variant="outline" className="bowel-quick-button" disabled={!ready || busy || Boolean(active)} onClick={() => { void quickRecord(); }}><Zap aria-hidden="true" />快捷记一次</Button>
          </div>
          <p className="bowel-gentle-note">按自己的节奏记录，没有“每天必须一次”的打卡目标。</p>
        </section>

        <div className="bowel-history-stack">
          <section className="panel bowel-calendar-panel" aria-labelledby="bowel-calendar-heading">
            <div className="bowel-panel-heading"><div><p className="section-kicker">慢慢回看</p><h2 id="bowel-calendar-heading">便便日历</h2></div><CalendarDays aria-hidden="true" /></div>
            <div className="bowel-month-controls">
              <Button type="button" variant="ghost" size="icon" aria-label="便便日历上个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1, 12))}><ChevronLeft /></Button>
              <strong>{monthLabel}</strong>
              <Button type="button" variant="ghost" size="icon" aria-label="便便日历下个月" disabled={month.getFullYear() === new Date(clock).getFullYear() && month.getMonth() === new Date(clock).getMonth()} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1, 12))}><ChevronRight /></Button>
            </div>
            <div className="bowel-weekdays" aria-hidden="true">{["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>{day}</span>)}</div>
            <div className="bowel-calendar-grid">
              {days.map(({ key, date, inMonth }) => {
                const count = entriesByDay.get(key)?.length ?? 0;
                const none = state.noBowelDays.includes(key);
                return <button key={key} type="button" className="bowel-calendar-day" data-selected={key === selectedDay} data-outside={!inMonth} data-today={key === today} data-recorded={count > 0} data-none={none} disabled={key > today}
                  aria-label={`${key}，${count ? `${count} 次便便` : none ? "已标记没有便便" : "未记录"}`} aria-pressed={key === selectedDay}
                  onClick={() => { setSelectedDay(key); if (!inMonth) setMonth(new Date(date.getFullYear(), date.getMonth(), 1, 12)); }}>
                  <span>{date.getDate()}</span><small>{count ? `${count}次` : none ? "—" : ""}</small>
                </button>;
              })}
            </div>
            <div className="bowel-calendar-legend"><span><i />有记录</span><span>— 已标记没有</span><span>空白为未记录</span></div>
            <button type="button" className="bowel-today-button" onClick={() => { const date = new Date(); setClock(date.getTime()); setSelectedDay(localDayKey(date)); setMonth(new Date(date.getFullYear(), date.getMonth(), 1, 12)); }}>回到今天</button>
          </section>

          <section className="panel bowel-history-panel" aria-labelledby="bowel-history-heading">
            <div className="bowel-panel-heading"><div><p className="section-kicker">这一天</p><h2 id="bowel-history-heading">{selectedLabel}的记录 <small>{selectedEntries.length} 次</small></h2></div><Button type="button" variant="ghost" size="sm" className="bowel-manual-button" disabled={!ready || busy || selectedDay > today} onClick={addManualRecord}><Plus aria-hidden="true" />补记</Button></div>
            {selectedEntries.length ? (
              <div className="bowel-history-list">
                {selectedEntries.map((entry) => (
                  <article className="bowel-history-item" key={entry.id}>
                    <button type="button" className="bowel-history-edit" aria-label={`编辑 ${timeFormatter.format(new Date(entry.startedAt))} 的便便记录`} onClick={() => { rememberFocus(); setEditor({ entry, isNew: false, autoSaved: false }); }}>
                      <span className="bowel-entry-icon" aria-hidden="true">{entry.shape ? <StoolShapeIcon shape={entry.shape} /> : <Toilet />}</span>
                      <span className="bowel-history-copy"><strong>{entryTime(entry)}</strong><span className="bowel-duration"><Clock3 aria-hidden="true" />{entry.endedAt ? `用时 ${formatElapsed(elapsedSeconds(entry.startedAt, Date.parse(entry.endedAt)))}` : entry.source === "manual" ? "补记 · 未计时" : "快捷记录 · 未计时"}</span><span>{entrySummary(entry) || "还没补充细节，点这里填写"}</span>{entry.notes ? <span className="bowel-note-preview">{entry.notes}</span> : null}</span>
                      <Pencil className="bowel-edit-icon" aria-hidden="true" />
                    </button>
                    <Button type="button" variant="ghost" size="icon-sm" className="delete-button" disabled={busy} aria-label={`删除 ${timeFormatter.format(new Date(entry.startedAt))} 的便便记录`} onClick={() => setConfirmation({ kind: "delete", entry })}><Trash2 /></Button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="bowel-empty-state"><span aria-hidden="true">{markedNone ? <CircleMinus /> : <Toilet />}</span><strong>{markedNone ? "这天已记下：没有便便" : "这一天还没有记录"}</strong><p>{markedNone ? "记录真实情况就好，不需要凑次数。" : "没记录不代表没有；也可以补记之前的一次。"}</p><Button type="button" variant="outline" disabled={!ready || busy || Boolean(active) || selectedDay > today} onClick={() => { void toggleNone(); }}>{markedNone ? <RotateCcw aria-hidden="true" /> : <CircleMinus aria-hidden="true" />}{markedNone ? "撤销没有的标记" : `标记${selectedDay === today ? "今天" : "这天"}没有`}</Button></div>
            )}
          </section>
        </div>
      </div>

      {editor ? <BowelDetailsSheet key={editor.entry.id} editor={editor} repository={repository} theme={theme} customColor={customColor} restoreFocus={restoreFocus} onClose={() => setEditor(null)} onSaved={(entry) => { selectEntryDay(entry); toast.success(editor.isNew ? "补记已保存" : "细节已保存"); setEditor(null); }} /> : null}
      <Dialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open && !busy) setConfirmation(null); }}>
        <DialogContent className="entry-dialog" data-theme={theme} style={style} showCloseButton={!busy}>
          <DialogHeader><DialogTitle>{confirmation?.kind === "cancel" ? "取消这次计时？" : "删除这次便便记录？"}</DialogTitle><DialogDescription>{confirmation?.kind === "cancel" ? "取消后不生成记录，之前已保存的记录不受影响。" : "这次记录和细节会从本机移除，删除后可以通过提示里的“撤销”恢复。"}</DialogDescription></DialogHeader>
          <DialogFooter className="entry-dialog-footer"><Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirmation(null)}>先保留</Button><Button type="button" className="dialog-save-button" disabled={busy} onClick={() => { void confirmAction(); }}>{busy ? "正在处理…" : confirmation?.kind === "cancel" ? "确认取消计时" : "确认删除"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
