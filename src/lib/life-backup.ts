import {
  BOWEL_STORAGE_KEY, normalizeBowelStore, readBowelStore,
  type BowelStore, type LocalStorageLike,
} from "./bowel-store.ts";
import { STORAGE_KEY, normalizeWaterStore, type WaterStore } from "./water-store.ts";

export type LifeImport = { water: WaterStore; bowel: BowelStore | null };

export function createLifeBackup(water: WaterStore, bowel: BowelStore, exportedAt: string) {
  return {
    app: "daily-water",
    exportVersion: 2,
    exportedAt,
    data: water,
    // A running timer belongs to this device; only completed records are exported.
    bowel: { ...bowel, activeSession: null },
  };
}

export function parseLifeBackup(value: unknown): LifeImport {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("这不是有效的记录备份文件。");
  const raw = value as Record<string, unknown>;
  const isEnvelope = "app" in raw;
  if (isEnvelope && raw.app !== "daily-water") throw new Error("请选择喝水小记或生活记录的备份文件。");
  if (isEnvelope && raw.exportVersion !== 1 && raw.exportVersion !== 2) throw new Error("暂不支持这个备份版本，请使用当前版本导出的文件。");
  const water = normalizeWaterStore(isEnvelope ? raw.data : value);
  if (!water) throw new Error("备份中的饮水数据无效，现有记录未被修改。");
  // Old water-only backups must never clear the newly added bowel history.
  const hasBowelData = isEnvelope && (raw.exportVersion === 2 || "bowel" in raw);
  if (!hasBowelData) return { water, bowel: null };
  const bowel = normalizeBowelStore(raw.bowel);
  if (!bowel) throw new Error("备份中的便便数据无效，现有记录未被修改。");
  return { water, bowel: { ...bowel, activeSession: null } };
}

export function restoreLifeBackup(storage: LocalStorageLike, backup: LifeImport): BowelStore {
  const current = readBowelStore(storage);
  if (backup.bowel && current.activeSession) throw new Error("请先结束或取消当前便便计时，再导入完整备份。");
  const nextBowel = backup.bowel ?? current;
  const writes: Array<[string, string]> = [[STORAGE_KEY, JSON.stringify(backup.water)]];
  if (backup.bowel) writes.push([BOWEL_STORAGE_KEY, JSON.stringify(nextBowel)]);
  const previous = writes.map(([key]) => [key, storage.getItem(key)] as const);
  let completed = 0;
  try {
    for (const [key, value] of writes) {
      storage.setItem(key, value);
      completed++;
    }
  } catch {
    try {
      for (let i = completed - 1; i >= 0; i--) {
        const [key, value] = previous[i];
        if (value === null) storage.removeItem(key);
        else storage.setItem(key, value);
      }
    } catch {
      throw new Error("导入遇到存储故障，无法确认回滚结果。请保留备份文件，不要关闭当前页面。");
    }
    throw new Error("本地存储空间不足或不可用，导入未完成，已恢复原有数据。");
  }
  return nextBowel;
}
