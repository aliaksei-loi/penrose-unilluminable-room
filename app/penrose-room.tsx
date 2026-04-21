"use client";

import { useEffect, useRef, useState } from "react";

const W = 800;
const H = 600;

const A = 340;
const B = 250;
const c = Math.sqrt(A * A - B * B);
const headR = 55;
const DELTA = 14;
const stemEndX = A * Math.sqrt(1 - (DELTA * DELTA) / (B * B));

const toCX = (x: number) => W / 2 + x;
const toCY = (y: number) => H / 2 - y;

type Wall =
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { kind: "arc"; cx: number; cy: number; r: number; side: "left" | "right" }
  | { kind: "seg"; x1: number; y1: number; x2: number; y2: number };

type Hit = { t: number; x: number; y: number; nx: number; ny: number };

const walls: Wall[] = [
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
  let nx = (hx - cx) / (rx * rx);
  let ny = (hy - cy) / (ry * ry);
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

function traceRay(px: number, py: number, dx: number, dy: number, bounces: number): number[] {
  const pts: number[] = [px, py];
  for (let i = 0; i < bounces; i++) {
    let best: Hit | null = null;
    for (const w of walls) {
      const hit = isectWall(w, px, py, dx, dy);
      if (hit && (!best || hit.t < best.t)) best = hit;
    }
    if (!best) break;
    pts.push(best.x, best.y);
    const dot = dx * best.nx + dy * best.ny;
    dx -= 2 * dot * best.nx;
    dy -= 2 * dot * best.ny;
    px = best.x + 1e-4 * dx;
    py = best.y + 1e-4 * dy;
  }
  return pts;
}

function inRoom(x: number, y: number): boolean {
  const m = 4;
  if ((x * x) / ((A - m) * (A - m)) + (y * y) / ((B - m) * (B - m)) > 1) return false;
  if (x <= c + m && (x - c) * (x - c) + y * y <= (headR + m) * (headR + m)) return false;
  if (x >= c - m && x <= stemEndX && Math.abs(y) <= DELTA + m) return false;
  if (x >= -c - m && (x + c) * (x + c) + y * y <= (headR + m) * (headR + m)) return false;
  if (x <= -c + m && x >= -stemEndX && Math.abs(y) <= DELTA + m) return false;
  return true;
}

type Source = { x: number; y: number } | null;

export default function PenroseRoom() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<Source>(null);
  const showFociRef = useRef(false);
  const numRaysRef = useRef(600);
  const numBouncesRef = useRef(50);
  const rayOpacityRef = useRef(0.08);
  const pendingRef = useRef(false);
  const draggingRef = useRef(false);
  const renderRef = useRef<(() => void) | null>(null);

  const [raysVal, setRaysVal] = useState(600);
  const [bouncesVal, setBouncesVal] = useState(50);
  const [opacityVal, setOpacityVal] = useState(0.08);
  const [fociActive, setFociActive] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const drawRoomFill = () => {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(W / 2, H / 2, A, B, 0, 0, 2 * Math.PI);
      ctx.clip();

      const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(A, B));
      g.addColorStop(0, "rgba(22, 20, 48, 0.55)");
      g.addColorStop(1, "rgba(10, 8, 28, 0.3)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "#000";

      ctx.beginPath();
      ctx.moveTo(toCX(stemEndX), toCY(DELTA));
      ctx.lineTo(toCX(c), toCY(DELTA));
      ctx.lineTo(toCX(c), toCY(headR));
      ctx.arc(toCX(c), toCY(0), headR, -Math.PI / 2, Math.PI / 2, true);
      ctx.lineTo(toCX(c), toCY(-DELTA));
      ctx.lineTo(toCX(stemEndX), toCY(-DELTA));
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(toCX(-stemEndX), toCY(DELTA));
      ctx.lineTo(toCX(-c), toCY(DELTA));
      ctx.lineTo(toCX(-c), toCY(headR));
      ctx.arc(toCX(-c), toCY(0), headR, -Math.PI / 2, Math.PI / 2, false);
      ctx.lineTo(toCX(-c), toCY(-DELTA));
      ctx.lineTo(toCX(-stemEndX), toCY(-DELTA));
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    };

    const drawWalls = () => {
      ctx.strokeStyle = "rgba(132, 142, 168, 0.75)";
      ctx.lineWidth = 1.4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      ctx.ellipse(W / 2, H / 2, A, B, 0, 0, 2 * Math.PI);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(toCX(stemEndX), toCY(DELTA));
      ctx.lineTo(toCX(c), toCY(DELTA));
      ctx.lineTo(toCX(c), toCY(headR));
      ctx.arc(toCX(c), toCY(0), headR, -Math.PI / 2, Math.PI / 2, true);
      ctx.lineTo(toCX(c), toCY(-DELTA));
      ctx.lineTo(toCX(stemEndX), toCY(-DELTA));
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(toCX(-stemEndX), toCY(DELTA));
      ctx.lineTo(toCX(-c), toCY(DELTA));
      ctx.lineTo(toCX(-c), toCY(headR));
      ctx.arc(toCX(-c), toCY(0), headR, -Math.PI / 2, Math.PI / 2, false);
      ctx.lineTo(toCX(-c), toCY(-DELTA));
      ctx.lineTo(toCX(-stemEndX), toCY(-DELTA));
      ctx.stroke();
    };

    const drawFoci = () => {
      ctx.save();
      ctx.shadowBlur = 12;
      ctx.shadowColor = "#ff5d7a";
      ctx.fillStyle = "#ff5d7a";
      ctx.beginPath();
      ctx.arc(toCX(c), toCY(0), 3.5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(toCX(-c), toCY(0), 3.5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = "rgba(255, 93, 122, 0.55)";
      ctx.font = '500 10px "JetBrains Mono", monospace';
      ctx.textAlign = "center";
      ctx.fillText("F₁", toCX(-c), toCY(0) - 12);
      ctx.fillText("F₂", toCX(c), toCY(0) - 12);
    };

    const drawRays = () => {
      const source = sourceRef.current;
      if (!source) return;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgba(255, 212, 128, ${rayOpacityRef.current})`;
      ctx.lineWidth = 0.6;
      ctx.lineCap = "butt";

      const twoPi = 2 * Math.PI;
      const numRays = numRaysRef.current;
      const numBounces = numBouncesRef.current;
      for (let i = 0; i < numRays; i++) {
        const angle = (twoPi * i) / numRays + 0.00001;
        const dx = Math.cos(angle), dy = Math.sin(angle);
        const pts = traceRay(source.x, source.y, dx, dy, numBounces);
        if (pts.length < 4) continue;
        ctx.beginPath();
        ctx.moveTo(toCX(pts[0]), toCY(pts[1]));
        for (let j = 2; j < pts.length; j += 2) {
          ctx.lineTo(toCX(pts[j]), toCY(pts[j + 1]));
        }
        ctx.stroke();
      }
      ctx.restore();
    };

    const drawSource = () => {
      const source = sourceRef.current;
      if (!source) return;
      const sx = toCX(source.x), sy = toCY(source.y);
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 22);
      g.addColorStop(0, "rgba(255, 245, 200, 0.85)");
      g.addColorStop(0.4, "rgba(255, 220, 140, 0.35)");
      g.addColorStop(1, "rgba(255, 200, 100, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, 22, 0, 2 * Math.PI);
      ctx.fill();

      ctx.fillStyle = "#fff5c8";
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, 2 * Math.PI);
      ctx.fill();
    };

    const render = () => {
      ctx.fillStyle = "#05060d";
      ctx.fillRect(0, 0, W, H);
      drawRoomFill();
      if (sourceRef.current) drawRays();
      drawWalls();
      if (showFociRef.current) drawFoci();
      if (sourceRef.current) drawSource();
    };

    const scheduleRender = () => {
      if (pendingRef.current) return;
      pendingRef.current = true;
      requestAnimationFrame(() => {
        pendingRef.current = false;
        render();
      });
    };

    const setSourceFromEvent = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const x = (clientX - rect.left) * (W / rect.width) - W / 2;
      const y = H / 2 - (clientY - rect.top) * (H / rect.height);
      if (inRoom(x, y)) {
        sourceRef.current = { x, y };
        scheduleRender();
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      draggingRef.current = true;
      setSourceFromEvent(e.clientX, e.clientY);
    };
    const onMouseMove = (e: MouseEvent) => {
      if (draggingRef.current) setSourceFromEvent(e.clientX, e.clientY);
    };
    const onMouseUp = () => { draggingRef.current = false; };
    const onMouseLeave = () => { draggingRef.current = false; };

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      const t = e.touches[0];
      setSourceFromEvent(t.clientX, t.clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (draggingRef.current) {
        const t = e.touches[0];
        setSourceFromEvent(t.clientX, t.clientY);
      }
    };
    const onTouchEnd = () => { draggingRef.current = false; };

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", onMouseLeave);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);

    renderRef.current = scheduleRender;
    render();

    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      renderRef.current = null;
    };
  }, []);

  const onRays = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = +e.target.value;
    numRaysRef.current = v;
    setRaysVal(v);
    renderRef.current?.();
  };
  const onBounces = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = +e.target.value;
    numBouncesRef.current = v;
    setBouncesVal(v);
    renderRef.current?.();
  };
  const onOpacity = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = +e.target.value;
    rayOpacityRef.current = v;
    setOpacityVal(v);
    renderRef.current?.();
  };
  const onFoci = () => {
    showFociRef.current = !showFociRef.current;
    setFociActive(showFociRef.current);
    renderRef.current?.();
  };
  const onClear = () => {
    sourceRef.current = null;
    renderRef.current?.();
  };

  return (
    <>
      <div className="stage">
        <canvas ref={canvasRef} />
        <div className="hud">
          <div><span className="dot">●</span> кликни в комнате</div>
          <div>потяни, чтобы двигать источник</div>
        </div>
      </div>

      <div className="controls">
        <div className="ctrl">
          <label>лучей <span>{raysVal}</span></label>
          <input type="range" min={100} max={2400} step={100} value={raysVal} onChange={onRays} />
        </div>
        <div className="ctrl">
          <label>отражений <span>{bouncesVal}</span></label>
          <input type="range" min={5} max={150} step={5} value={bouncesVal} onChange={onBounces} />
        </div>
        <div className="ctrl">
          <label>яркость <span>{opacityVal.toFixed(2)}</span></label>
          <input type="range" min={0.01} max={0.5} step={0.01} value={opacityVal} onChange={onOpacity} />
        </div>
        <button className={fociActive ? "active" : ""} onClick={onFoci}>фокусы</button>
        <button onClick={onClear}>сброс</button>
      </div>
    </>
  );
}
