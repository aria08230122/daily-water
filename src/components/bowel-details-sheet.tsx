import { useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { CheckCircle2, ChevronDown, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AMOUNT_OPTIONS, COLOR_OPTIONS, EFFORT_OPTIONS, PAIN_OPTIONS, STOOL_SHAPES,
  addBowelEntry, dateTimeInputValue, elapsedSeconds, formatElapsed, updateBowelEntry,
  type BowelDetails, type BowelEntry,
} from "@/lib/bowel-store";
import type { BowelRepository } from "@/hooks/use-bowel-store";
import type { ThemeId } from "@/lib/water-store";

export type BowelEditor = { entry: BowelEntry; isNew: boolean; autoSaved: boolean };

export function StoolShapeIcon({ shape }: { shape: number }) {
  const drawings: Record<number, ReactNode> = {
    1: <><circle cx="14" cy="15" r="5" /><circle cx="29" cy="12" r="4" /><circle cx="33" cy="26" r="5" /><circle cx="17" cy="29" r="5" /></>,
    2: <><path d="M10 31c-4-5-2-9 3-10-3-5 0-9 5-9 0-6 8-8 11-3 6-2 10 4 6 9 3 5 0 9-5 9 0 6-8 10-12 6-3 2-6 1-8-2Z" /></>,
    3: <><path d="M11 30C4 22 23 5 31 9c12 6-8 22-13 24-3 1-5-1-7-3Z" /><path d="m22 13 2 5-4 2 1 5-5 1" fill="none" /></>,
    4: <path d="M10 30C4 21 17 21 22 11c4-8 15-3 13 4-2 8-13 9-16 15-3 5-6 5-9 0Z" />,
    5: <><path d="M8 18c-3-6 6-12 11-9 6 4 1 12-5 12-3 0-5-1-6-3Z" /><path d="M26 29c-5-5 1-14 7-11 8 3 3 14-3 13-2 0-3-1-4-2Z" /><circle cx="14" cy="32" r="4" /></>,
    6: <><path d="m7 15 4-6 7 1 3 5-5 6-6-1Z" /><path d="m25 10 7-2 5 6-5 5-7-3Z" /><path d="m16 28 8-6 8 3 1 7-10 4-7-2Z" /></>,
    7: <><path d="M16 9c0 0-7 8-7 12a7 7 0 0 0 14 0c0-4-7-12-7-12Z" /><path d="M33 15s-4 5-4 8a4 4 0 0 0 8 0c0-3-4-8-4-8Z" /><path d="M8 33c4-3 6 3 10 0s6 3 10 0 6 3 10 0" fill="none" /></>,
  };
  return <svg viewBox="0 0 44 44" aria-hidden="true" className="stool-shape-icon" fill="currentColor" fillOpacity=".2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{drawings[shape]}</svg>;
}

function ChoiceField<T extends string | number>({ label, name, value, options, onChange, renderIcon, className = "" }: {
  label: string;
  name: string;
  value: T | null;
  options: readonly { value: T; label: string }[];
  onChange: (value: T | null) => void;
  renderIcon?: (value: T) => ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={`bowel-field ${className}`}>
      <legend>{label}<span>选填</span></legend>
      <div className="bowel-choice-grid">
        {options.map((option) => (
          <label className="bowel-choice" data-selected={value === option.value} key={option.value}>
            <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
            {renderIcon?.(option.value)}
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {value !== null ? <button className="clear-bowel-choice" type="button" aria-label={`清空${label}`} onClick={() => onChange(null)}>清空选择</button> : null}
    </fieldset>
  );
}

export function BowelDetailsSheet({ editor, repository, theme, customColor, onClose, onSaved, restoreFocus }: {
  editor: BowelEditor;
  repository: BowelRepository;
  theme: ThemeId;
  customColor: string;
  onClose: () => void;
  onSaved: (entry: BowelEntry) => void;
  restoreFocus: () => void;
}) {
  const { entry, isNew, autoSaved } = editor;
  const [details, setDetails] = useState<BowelDetails>({
    shape: entry.shape, effort: entry.effort, color: entry.color,
    amount: entry.amount, pain: entry.pain, notes: entry.notes,
  });
  const [startedAt, setStartedAt] = useState(dateTimeInputValue(entry.startedAt));
  const [endedAt, setEndedAt] = useState(entry.endedAt ? dateTimeInputValue(entry.endedAt) : "");
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const style = { "--custom-color": customColor } as CSSProperties;

  const updateDetails = <K extends keyof BowelDetails>(key: K, value: BowelDetails[K]) => {
    setDetails((current) => ({ ...current, [key]: value }));
  };

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError("");
    const start = new Date(startedAt === dateTimeInputValue(entry.startedAt) ? entry.startedAt : startedAt);
    const end = endedAt ? new Date(entry.endedAt && endedAt === dateTimeInputValue(entry.endedAt) ? entry.endedAt : endedAt) : null;
    if (!Number.isFinite(start.getTime()) || (end && !Number.isFinite(end.getTime()))) {
      setError("请选择有效的日期和时间。");
      return;
    }
    if (start.getTime() > Date.now() + 60_000 || (end && end.getTime() > Date.now() + 60_000)) {
      setError("记录时间不能晚于现在。");
      return;
    }
    if (entry.source === "timer" && !end) {
      setError("计时记录需要保留结束时间。");
      return;
    }
    if (end && end.getTime() < start.getTime()) {
      setError("结束时间不能早于开始时间，请在“调整时间”里修改。");
      return;
    }
    const nextEntry: BowelEntry = {
      ...entry, ...details, startedAt: start.toISOString(), endedAt: end?.toISOString() ?? null,
      updatedAt: new Date().toISOString(),
    };
    submitting.current = true;
    try {
      await repository.mutate((current) => isNew
        ? addBowelEntry(current, nextEntry)
        : updateBowelEntry(current, nextEntry, entry.updatedAt));
      onSaved(nextEntry);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "尚未保存，请重试。");
    } finally {
      submitting.current = false;
    }
  }

  return (
    <Sheet open onOpenChange={(open) => { if (!open && !repository.busy) onClose(); }}>
      <SheetContent
        side="right" className="settings-sheet bowel-details-sheet" data-theme={theme} style={style}
        showCloseButton={!repository.busy}
        onOpenAutoFocus={(event) => { event.preventDefault(); headingRef.current?.focus({ preventScroll: true }); }}
        onCloseAutoFocus={(event) => { event.preventDefault(); restoreFocus(); }}
        onEscapeKeyDown={(event) => { if (repository.busy) event.preventDefault(); }}
        onInteractOutside={(event) => { if (repository.busy) event.preventDefault(); }}
      >
        <SheetHeader className="settings-header">
          <SheetTitle ref={headingRef} tabIndex={-1}>{isNew ? "补记便便" : autoSaved ? "补充这次记录" : "编辑便便记录"}</SheetTitle>
          <SheetDescription>{autoSaved ? "这次记录已经保存，其他细节可以慢慢补。" : "按实际情况填写，所有细节都可以留空。"}</SheetDescription>
        </SheetHeader>
        <div className="settings-body bowel-details-body">
          {autoSaved ? <div className="bowel-saved-notice" role="status"><CheckCircle2 aria-hidden="true" /><span>这次已自动保存，关闭面板也不会丢失。</span></div> : null}
          {!isNew ? (
            <div className="bowel-entry-summary">
              <Clock3 aria-hidden="true" />
              <div>
                <strong>{new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(entry.startedAt))}</strong>
                <span>{entry.endedAt ? `用时 ${formatElapsed(elapsedSeconds(entry.startedAt, Date.parse(entry.endedAt)))}` : entry.source === "manual" ? "补记 · 未计时" : "快捷记录 · 未计时"}</span>
              </div>
            </div>
          ) : null}
          <form id="bowel-details-form" onSubmit={(event) => { void saveDetails(event); }} noValidate>
            <fieldset className="bowel-form-fields" disabled={repository.busy}>
              <details className="bowel-time-editor" open={isNew || undefined}>
                <summary>{isNew ? "记录时间" : "调整时间"}<ChevronDown aria-hidden="true" /></summary>
                <p>按开始的日期归档。忘记结束计时时，可以在这里修正。</p>
                <label htmlFor="bowel-start-time">{entry.source === "timer" ? "开始时间" : "记录时间"}</label>
                <Input id="bowel-start-time" className="bowel-time-input" type="datetime-local" step="1" max={dateTimeInputValue(new Date())} value={startedAt} onChange={(event) => setStartedAt(event.target.value)} />
                <label htmlFor="bowel-end-time">结束时间{entry.source !== "timer" ? "（选填）" : ""}</label>
                <Input id="bowel-end-time" className="bowel-time-input" type="datetime-local" step="1" max={dateTimeInputValue(new Date())} value={endedAt} onChange={(event) => setEndedAt(event.target.value)} />
              </details>
              <ChoiceField label="形状" name="bowel-shape" value={details.shape} options={STOOL_SHAPES} onChange={(value) => updateDetails("shape", value)} className="bowel-shapes" renderIcon={(shape) => <StoolShapeIcon shape={shape} />} />
              <p className="bowel-shape-reference">形状参考 <a href="https://my.clevelandclinic.org/health/articles/bristol-stool-chart" target="_blank" rel="noreferrer">布里斯托七型</a>，只作记录，不作诊断。</p>
              <ChoiceField label="顺畅程度" name="bowel-effort" value={details.effort} options={EFFORT_OPTIONS} onChange={(value) => updateDetails("effort", value)} />
              <ChoiceField label="颜色" name="bowel-color" value={details.color} options={COLOR_OPTIONS} onChange={(value) => updateDetails("color", value)} className="bowel-colors" renderIcon={(value) => <span className="stool-color-dot" style={{ backgroundColor: COLOR_OPTIONS.find((option) => option.value === value)?.swatch }} aria-hidden="true" />} />
              <ChoiceField label="量" name="bowel-amount" value={details.amount} options={AMOUNT_OPTIONS} onChange={(value) => updateDetails("amount", value)} />
              <ChoiceField label="腹痛" name="bowel-pain" value={details.pain} options={PAIN_OPTIONS} onChange={(value) => updateDetails("pain", value)} className="bowel-pain" />
              <div className="bowel-notes-field">
                <label htmlFor="bowel-notes">备注 <span>选填</span></label>
                <textarea id="bowel-notes" rows={3} maxLength={2000} placeholder="还有什么想记下的……" value={details.notes} onChange={(event) => updateDetails("notes", event.target.value)} />
                <span className="bowel-note-count">{details.notes.length} / 2000</span>
              </div>
            </fieldset>
          </form>
        </div>
        <div className="bowel-details-footer">
          {error ? <p role="alert" className="bowel-inline-error">{error}</p> : null}
          <Button type="button" variant="ghost" disabled={repository.busy} onClick={onClose}>{isNew ? "取消" : "稍后填写"}</Button>
          <Button type="submit" form="bowel-details-form" className="save-preferences" disabled={repository.busy}>{repository.busy ? "正在保存…" : isNew ? "保存补记" : "保存细节"}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
