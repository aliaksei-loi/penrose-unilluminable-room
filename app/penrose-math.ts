export const A = 340;
export const B = 250;
export const c = Math.sqrt(A * A - B * B);
export const headR = 55;
export const DELTA = 14;
export const stemEndX = A * Math.sqrt(1 - (DELTA * DELTA) / (B * B));

export type Wall =
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { kind: "arc"; cx: number; cy: number; r: number; side: "left" | "right" }
  | { kind: "seg"; x1: number; y1: number; x2: number; y2: number };

export type Hit = { t: number; x: number; y: number; nx: number; ny: number };

export const walls: Wall[] = [
  { kind: "ellipse", cx: 0, cy: 0, rx: A, ry: B },

  { kind: "arc", cx: c, cy: 0, r: headR, side: "left" },
  { kind: "seg", x1: c, y1: DELTA, x2: c, y2: headR },
  { kind: "seg", x1: c, y1: -headR, x2: c, y2: -DELTA },
  { kind: "seg", x1: c, y1: DELTA, x2: stemEndX, y2: DELTA },
  { kind: "seg", x1: c, y1: -DELTA, x2: stemEndX, y2: -DELTA },

  { kind: "arc", cx: -c, cy: 0, r: headR, side: "right" },
  { kind: "seg", x1: -c, y1: DELTA, x2: -c, y2: headR },
  { kind: "seg", x1: -c, y1: -headR, x2: -c, y2: -DELTA },
  { kind: "seg", x1: -c, y1: DELTA, x2: -stemEndX, y2: DELTA },
  { kind: "seg", x1: -c, y1: -DELTA, x2: -stemEndX, y2: -DELTA },
];

function isectSeg(
  px: number, py: number, dx: number, dy: number,
  x1: number, y1: number, x2: number, y2: number,
): Hit | null {
  const sx = x2 - x1, sy = y2 - y1;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((x1 - px) * sy - (y1 - py) * sx) / denom;
  const u = ((x1 - px) * dy - (y1 - py) * dx) / denom;
  if (t < 1e-6 || u < 0 || u > 1) return null;
  const len = Math.hypot(sx, sy);
  return { t, x: px + t * dx, y: py + t * dy, nx: -sy / len, ny: sx / len };
}

function isectEllipse(
  px: number, py: number, dx: number, dy: number,
  cx: number, cy: number, rx: number, ry: number,
): Hit | null {
  const ex = px - cx, ey = py - cy;
  const a = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
  const b = 2 * ((ex * dx) / (rx * rx) + (ey * dy) / (ry * ry));
  const k = (ex * ex) / (rx * rx) + (ey * ey) / (ry * ry) - 1;
  const disc = b * b - 4 * a * k;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a);
  const t2 = (-b + sq) / (2 * a);
  const t = t1 > 1e-6 ? t1 : t2 > 1e-6 ? t2 : null;
  if (t === null) return null;
  const hx = px + t * dx, hy = py + t * dy;
  const nx = (hx - cx) / (rx * rx);
  const ny = (hy - cy) / (ry * ry);
  const L = Math.hypot(nx, ny);
  return { t, x: hx, y: hy, nx: nx / L, ny: ny / L };
}

function isectArc(
  px: number, py: number, dx: number, dy: number,
  cx: number, cy: number, r: number, side: "left" | "right",
): Hit | null {
  const ex = px - cx, ey = py - cy;
  const a = dx * dx + dy * dy;
  const b = 2 * (ex * dx + ey * dy);
  const k = ex * ex + ey * ey - r * r;
  const disc = b * b - 4 * a * k;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const ts = [(-b - sq) / (2 * a), (-b + sq) / (2 * a)].sort((p, q) => p - q);
  for (const t of ts) {
    if (t < 1e-6) continue;
    const hx = px + t * dx, hy = py + t * dy;
    if (side === "left" && hx > cx + 1e-9) continue;
    if (side === "right" && hx < cx - 1e-9) continue;
    return { t, x: hx, y: hy, nx: (hx - cx) / r, ny: (hy - cy) / r };
  }
  return null;
}

function isectWall(w: Wall, px: number, py: number, dx: number, dy: number): Hit | null {
  if (w.kind === "ellipse") return isectEllipse(px, py, dx, dy, w.cx, w.cy, w.rx, w.ry);
  if (w.kind === "seg") return isectSeg(px, py, dx, dy, w.x1, w.y1, w.x2, w.y2);
  return isectArc(px, py, dx, dy, w.cx, w.cy, w.r, w.side);
}

export function traceRaySegments(
  out: number[],
  px: number, py: number,
  dx: number, dy: number,
  bounces: number,
): void {
  let x = px, y = py;
  for (let i = 0; i < bounces; i++) {
    let best: Hit | null = null;
    for (const w of walls) {
      const hit = isectWall(w, x, y, dx, dy);
      if (hit && (!best || hit.t < best.t)) best = hit;
    }
    if (!best) break;
    out.push(x, y, best.x, best.y);
    const dot = dx * best.nx + dy * best.ny;
    dx -= 2 * dot * best.nx;
    dy -= 2 * dot * best.ny;
    x = best.x + 1e-4 * dx;
    y = best.y + 1e-4 * dy;
  }
}

export function inRoom(x: number, y: number): boolean {
  const m = 4;
  if ((x * x) / ((A - m) * (A - m)) + (y * y) / ((B - m) * (B - m)) > 1) return false;
  if (x <= c + m && (x - c) * (x - c) + y * y <= (headR + m) * (headR + m)) return false;
  if (x >= c - m && x <= stemEndX && Math.abs(y) <= DELTA + m) return false;
  if (x >= -c - m && (x + c) * (x + c) + y * y <= (headR + m) * (headR + m)) return false;
  if (x <= -c + m && x >= -stemEndX && Math.abs(y) <= DELTA + m) return false;
  return true;
}
