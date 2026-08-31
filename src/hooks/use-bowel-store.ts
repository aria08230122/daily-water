import { useCallback, useEffect, useRef, useState } from "react";
import {
  BOWEL_LOCK_NAME, BOWEL_STORAGE_KEY, emptyBowelStore, readBowelStore, writeBowelStore,
  type BowelStore,
} from "@/lib/bowel-store";
import { restoreLifeBackup, type LifeImport } from "@/lib/life-backup";

async function withBowelLock<T>(operation: () => T): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(BOWEL_LOCK_NAME, operation);
  }
  return operation();
}

export function useBowelStore() {
  const [state, setState] = useState<BowelStore>(emptyBowelStore);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const refresh = useCallback(() => {
    try {
      setState(readBowelStore(window.localStorage));
      setError(null);
    } catch {
      setError("本地便便记录暂时无法读取，原数据未改动。请勿清除浏览器数据，可以稍后重试。");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onStorage = (event: StorageEvent) => {
      if (event.key === BOWEL_STORAGE_KEY || event.key === null) refresh();
    };
    const onVisible = () => { if (!document.hidden) refresh(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const commit = useCallback(async (operation: () => BowelStore) => {
    if (busyRef.current) throw new Error("正在保存，请稍等一下。");
    busyRef.current = true;
    setBusy(true);
    try {
      const next = await withBowelLock(operation);
      // Never show a successful save, or clear the timer, before storage succeeds.
      setState(next);
      setError(null);
      return next;
    } catch (reason) {
      const message = reason instanceof Error && !(reason instanceof DOMException) && !(reason instanceof SyntaxError)
        ? reason.message
        : "这次尚未保存：本地存储空间不足或不可用。请保留当前页面，备份已有数据后重试。";
      setError(message);
      throw new Error(message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const mutate = useCallback((change: (current: BowelStore) => BowelStore) => commit(() => {
    const next = change(readBowelStore(window.localStorage));
    writeBowelStore(window.localStorage, next);
    return next;
  }), [commit]);

  const importSnapshot = useCallback((backup: LifeImport) => commit(() => restoreLifeBackup(window.localStorage, backup)), [commit]);

  return { state, ready, error, busy, refresh, mutate, importSnapshot };
}

export type BowelRepository = ReturnType<typeof useBowelStore>;
