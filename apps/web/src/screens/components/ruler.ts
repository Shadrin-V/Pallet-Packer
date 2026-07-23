// Metre ticks for the cutaway ruler, in the cutaway's own mm coordinates. Interior whole metres only:
// 0 and the far edge are already the vehicle frame, so labelling them again just crowds the corners.
export function metreTicks(lengthMm: number): { x: number; metre: number }[] {
  const ticks: { x: number; metre: number }[] = [];
  for (let m = 1; m * 1000 < lengthMm; m++) ticks.push({ x: m * 1000, metre: m });
  return ticks;
}

// Half-metre positions (500, 1500, 2500 … mm) for the engineering look's MINOR ticks — the unlabelled
// marks that sit between the whole-metre majors. Interior only, like metreTicks.
export function halfMetreTicks(lengthMm: number): number[] {
  const ticks: number[] = [];
  for (let x = 500; x < lengthMm; x += 1000) ticks.push(x);
  return ticks;
}

// Quarter-metre positions (250, 750, 1250 … mm) for the finest, intermediate ticks — those between the
// half-metre minors. Multiples of 500 are omitted: those are already a minor or a major, not a quarter.
export function quarterMetreTicks(lengthMm: number): number[] {
  const ticks: number[] = [];
  for (let x = 250; x < lengthMm; x += 250) if (x % 500 !== 0) ticks.push(x);
  return ticks;
}
