/** "37%", or one decimal under 10% so early progress isn't shown as 0%. */
export function formatPct(done: number, total: number): string {
  if (!total || !done) return "0%";
  const pct = (done / total) * 100;
  if (pct >= 10) return `${Math.floor(pct)}%`;
  return `${Math.max(0.1, Math.floor(pct * 10) / 10)}%`;
}
