/**
 * The verse you're reading: the first one that starts below the sticky
 * header, unless the verse straddling the header fills most of the screen.
 * (Picking a verse whose tail merely peeks out would drift backwards every
 * time the position is restored.)
 */
export function topVerse(root: HTMLElement | null, header: HTMLElement | null): HTMLElement | null {
  const top = header?.getBoundingClientRect().bottom ?? 0;
  const room = window.innerHeight - top;
  for (const v of root?.querySelectorAll<HTMLElement>("[data-verse]") ?? []) {
    const r = v.getBoundingClientRect();
    if (!r.height || r.bottom <= top) continue;
    if (r.top >= top - 4 || r.bottom - top > room * 0.5) return v;
  }
  return null;
}
