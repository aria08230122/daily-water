export const DEFAULT_QUICK_AMOUNTS_ML = [250, 350, 500] as const;
export const MAX_QUICK_AMOUNTS = 6;
export const MAX_QUICK_AMOUNT_ML = 5000;

export function normalizeQuickAmounts(value: unknown): number[] {
  const amounts = Array.isArray(value)
    ? value
        .filter(
          (amount): amount is number =>
            typeof amount === "number" &&
            Number.isFinite(amount) &&
            amount >= 1 &&
            amount <= MAX_QUICK_AMOUNT_ML,
        )
        .map(Math.round)
    : [];
  const uniqueAmounts = [...new Set(amounts)].slice(0, MAX_QUICK_AMOUNTS);
  return uniqueAmounts.length ? uniqueAmounts : [...DEFAULT_QUICK_AMOUNTS_ML];
}

type QuickAmountValidation =
  | { ok: true; amounts: number[] }
  | { ok: false; message: string };

export function validateQuickAmountDrafts(
  drafts: string[],
): QuickAmountValidation {
  if (drafts.length < 1 || drafts.length > MAX_QUICK_AMOUNTS) {
    return { ok: false, message: `请保留 1–${MAX_QUICK_AMOUNTS} 个快捷杯量` };
  }

  const amounts = drafts.map((value) => Number(value.trim()));
  if (
    amounts.some(
      (amount) =>
        !Number.isInteger(amount) || amount < 1 || amount > MAX_QUICK_AMOUNT_ML,
    )
  ) {
    return { ok: false, message: "每个杯量请输入 1–5000 ml 的整数" };
  }
  if (new Set(amounts).size !== amounts.length) {
    return { ok: false, message: "有重复的杯量，请改成不同的数值或删除多余的一项" };
  }

  return { ok: true, amounts };
}
