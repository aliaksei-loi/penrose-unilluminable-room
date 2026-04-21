"use client";

import { useEffect, useRef, useState } from "react";
import createREGL from "regl";
import type { Regl, Framebuffer2D } from "regl";
import {
  A, B, c, headR, DELTA, stemEndX,
  walls, traceRaySegments, inRoom,
} from "./penrose-math";

const HALF_EXT_X = 400;
const HALF_EXT_Y = 300;

type Source = { x: number; y: number } | null;

export default function PenroseRoom() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<Source>(null);
  const sourceSetAtRef = useRef<number>(0);
  const showFociRef = useRef(false);
  const raysPerFrameRef = useRef(180);
  const bouncesRef = useRef(60);
  const glowRef = useRef(1.0);
  const draggingRef = useRef(false);

  const [raysVal, setRaysVal] = useState(180);
  const [bouncesVal, setBouncesVal] = useState(60);
  const [glowVal, setGlowVal] = useState(1.0);
  const [fociActive, setFociActive] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const setCanvasSize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
    };
    setCanvasSize();

    let regl: Regl;
    try {
      regl = createREGL({
        canvas,
        attributes: { antialias: false, premultipliedAlpha: false, alpha: false },
        extensions: ["OES_texture_half_float", "OES_texture_half_float_linear"],
        optionalExtensions: ["EXT_color_buffer_half_float"],
      });
    } catch {
      regl = createREGL({ canvas, attributes: { antialias: false, alpha: false } });
    }

    const fbColorType: "half float" | "uint8" = (() => {
      try {
        const test = regl.framebuffer({ width: 4, height: 4, colorType: "half float", colorFormat: "rgba" });
        test.destroy();
        return "half float";
      } catch {
        return "uint8";
      }
    })();

    const mkFB = (w: number, h: number) =>
      regl.framebuffer({
        width: Math.max(1, w), height: Math.max(1, h),
        colorType: fbColorType, colorFormat: "rgba",
        depth: false, stencil: false,
      });

    let accumFB: Framebuffer2D = mkFB(canvas.width, canvas.height);
    let scratchFB: Framebuffer2D = mkFB(canvas.width, canvas.height);
    let bloomA: Framebuffer2D = mkFB(canvas.width >> 1, canvas.height >> 1);
    let bloomB: Framebuffer2D = mkFB(canvas.width >> 1, canvas.height >> 1);
    let fbW = canvas.width, fbH = canvas.height;

    const resizeFBs = () => {
      const w = canvas.width;
      const h = canvas.height;
      if (w === fbW && h === fbH) return;
      fbW = w; fbH = h;
      accumFB.destroy();
      scratchFB.destroy();
      bloomA.destroy();
      bloomB.destroy();
      accumFB = mkFB(w, h);
      scratchFB = mkFB(w, h);
      bloomA = mkFB(w >> 1, h >> 1);
      bloomB = mkFB(w >> 1, h >> 1);
    };

    const drawFullscreen = {
      attributes: { p: [[-1, -1], [3, -1], [-1, 3]] },
      count: 3,
      depth: { enable: false },
    } as const;

    const rayBuf = regl.buffer({ type: "float", usage: "dynamic", length: 4 * 2 * 4 });
    const rayScratch = new Float32Array(1024);
    const segmentList: number[] = [];

    const drawRays = regl({
      vert: `
        attribute vec2 pos;
        uniform vec2 invHalf;
        void main() {
          gl_Position = vec4(pos * invHalf, 0.0, 1.0);
        }
      `,
      frag: `
        precision highp float;
        uniform vec3 rayColor;
        uniform float rayAlpha;
        void main() {
          gl_FragColor = vec4(rayColor * rayAlpha, rayAlpha);
        }
      `,
      attributes: { pos: rayBuf },
      uniforms: {
        invHalf: [1.0 / HALF_EXT_X, 1.0 / HALF_EXT_Y],
        rayColor: [1.0, 0.83, 0.48],
        rayAlpha: regl.prop<{ rayAlpha: number }, "rayAlpha">("rayAlpha"),
      },
      count: regl.prop<{ count: number }, "count">("count"),
      primitive: "lines",
      depth: { enable: false },
      blend: {
        enable: true,
        func: { src: "one", dst: "one" },
        equation: "add",
      },
      framebuffer: regl.prop<{ target: Framebuffer2D }, "target">("target"),
    });

    const decayPass = regl({
      vert: `
        attribute vec2 p;
        varying vec2 vUV;
        void main() { vUV = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }
      `,
      frag: `
        precision highp float;
        uniform sampler2D tex;
        uniform float factor;
        varying vec2 vUV;
        void main() {
          vec4 c = texture2D(tex, vUV);
          // multiply + subtract small bias so uint8 textures don't get stuck at low values
          gl_FragColor = max(c * factor - vec4(0.004), vec4(0.0));
        }
      `,
      ...drawFullscreen,
      uniforms: {
        tex: regl.prop<{ tex: Framebuffer2D }, "tex">("tex"),
        factor: regl.prop<{ factor: number }, "factor">("factor"),
      },
      framebuffer: regl.prop<{ target: Framebuffer2D }, "target">("target"),
    });

    const blurPass = regl({
      vert: `
        attribute vec2 p;
        varying vec2 vUV;
        void main() { vUV = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }
      `,
      frag: `
        precision highp float;
        uniform sampler2D tex;
        uniform vec2 dir;
        varying vec2 vUV;
        void main() {
          vec4 s = vec4(0.0);
          s += texture2D(tex, vUV - dir * 4.0) * 0.05;
          s += texture2D(tex, vUV - dir * 3.0) * 0.09;
          s += texture2D(tex, vUV - dir * 2.0) * 0.12;
          s += texture2D(tex, vUV - dir * 1.0) * 0.15;
          s += texture2D(tex, vUV)              * 0.18;
          s += texture2D(tex, vUV + dir * 1.0) * 0.15;
          s += texture2D(tex, vUV + dir * 2.0) * 0.12;
          s += texture2D(tex, vUV + dir * 3.0) * 0.09;
          s += texture2D(tex, vUV + dir * 4.0) * 0.05;
          gl_FragColor = s;
        }
      `,
      ...drawFullscreen,
      uniforms: {
        tex: regl.prop<{ tex: Framebuffer2D }, "tex">("tex"),
        dir: regl.prop<{ dir: [number, number] }, "dir">("dir"),
      },
      framebuffer: regl.prop<{ target: Framebuffer2D }, "target">("target"),
    });

    const compositePass = regl({
      vert: `
        attribute vec2 p;
        varying vec2 vUV;
        void main() { vUV = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }
      `,
      frag: `
        precision highp float;
        uniform sampler2D accumTex;
        uniform sampler2D bloomTex;
        uniform vec2 halfExt;
        uniform float ellipseA;
        uniform float ellipseB;
        uniform float focusC;
        uniform float headR;
        uniform float stemEnd;
        uniform float delta;
        uniform vec2 sourcePos;
        uniform float sourceEnabled;
        uniform float sourcePulse;
        uniform float showFoci;
        uniform float glow;
        uniform float time;
        varying vec2 vUV;

        float sdCircle(vec2 p, float r) { return length(p) - r; }
        float sdBox(vec2 p, vec2 b) {
          vec2 d = abs(p) - b;
          return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
        }
        float sdEllipseApprox(vec2 p, vec2 r) {
          // gradient-normalized approximation — accurate near surface
          vec2 q = p / r;
          float k = length(q);
          float grad = length(vec2(q.x / r.x, q.y / r.y));
          return (k - 1.0) / max(grad, 1e-4);
        }
        float sdMushroom(vec2 p, float cx, float signDir) {
          vec2 q = vec2(p.x - cx, p.y);
          float head = sdCircle(q, headR);
          vec2 stemCenter = vec2(signDir * (stemEnd - focusC) * 0.5, 0.0);
          // stem goes from (cx, 0) outward to (signDir*stemEnd, 0) at width delta
          float stemLen = stemEnd - focusC;
          vec2 stemQ = q - vec2(signDir * stemLen * 0.5, 0.0);
          float stem = sdBox(stemQ, vec2(stemLen * 0.5, delta));
          return min(head, stem);
        }

        // simple hash for dither
        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        void main() {
          vec2 p = (vUV - 0.5) * 2.0 * halfExt;

          float dEll = sdEllipseApprox(p, vec2(ellipseA, ellipseB));
          float dMR  = sdMushroom(p,  focusC,  1.0);
          float dML  = sdMushroom(p, -focusC, -1.0);
          float dRoom = max(dEll, -min(dMR, dML));

          float insideRoom = 1.0 - smoothstep(-0.8, 0.8, dRoom);

          // bg with soft vignette
          float vig = 1.0 - length(p / halfExt) * 0.55;
          vec3 bg = mix(vec3(0.012, 0.015, 0.035), vec3(0.02, 0.022, 0.05), vig);

          // inside-room tint
          vec3 roomTint = mix(vec3(0.035, 0.032, 0.08), vec3(0.06, 0.05, 0.13), vig);
          vec3 col = mix(bg, roomTint, insideRoom);

          // rays + bloom (only show inside room)
          vec4 rays  = texture2D(accumTex, vUV);
          vec4 bloom = texture2D(bloomTex, vUV);
          col += rays.rgb * insideRoom * (0.45 + 0.25 * glow);
          col += bloom.rgb * insideRoom * (0.5 * glow);

          // source glow
          if (sourceEnabled > 0.5) {
            vec2 dS = p - sourcePos;
            float d = length(dS);
            float core = exp(-d * d * 0.06);
            float halo = exp(-d * 0.06) * 0.35;
            float pulse = 0.85 + 0.15 * sourcePulse;
            col += vec3(1.0, 0.95, 0.78) * (core * pulse * 0.9 + halo) * insideRoom;
          }

          // wall lines (thin bright stroke where |dRoom| is small)
          float wallEll = abs(dEll);
          float wallMR  = abs(dMR);
          float wallML  = abs(dML);
          float wall = min(min(wallEll, wallMR), wallML);
          float wallA = (1.0 - smoothstep(0.3, 1.4, wall)) * 0.9;
          col = mix(col, vec3(0.55, 0.62, 0.78), wallA);

          // foci dots
          if (showFoci > 0.5) {
            float fR = length(p - vec2( focusC, 0.0));
            float fL = length(p - vec2(-focusC, 0.0));
            float fD = min(fR, fL);
            float dot_ = exp(-fD * fD * 0.7);
            float ring = exp(-pow(fD - 4.0, 2.0) * 0.8) * 0.3;
            col += vec3(1.0, 0.32, 0.46) * (dot_ + ring) * (0.8 + 0.2 * sin(time * 3.0));
          }

          // subtle dither to mask banding
          float n = hash21(gl_FragCoord.xy + fract(time) * 7.3);
          col += (n - 0.5) * (1.0 / 255.0);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
      ...drawFullscreen,
      uniforms: {
        accumTex: () => accumFB,
        bloomTex: () => bloomB,
        halfExt: [HALF_EXT_X, HALF_EXT_Y],
        ellipseA: A,
        ellipseB: B,
        focusC: c,
        headR,
        stemEnd: stemEndX,
        delta: DELTA,
        sourcePos: regl.prop<{ sourcePos: [number, number] }, "sourcePos">("sourcePos"),
        sourceEnabled: regl.prop<{ sourceEnabled: number }, "sourceEnabled">("sourceEnabled"),
        sourcePulse: regl.prop<{ sourcePulse: number }, "sourcePulse">("sourcePulse"),
        showFoci: regl.prop<{ showFoci: number }, "showFoci">("showFoci"),
        glow: regl.prop<{ glow: number }, "glow">("glow"),
        time: regl.prop<{ time: number }, "time">("time"),
      },
    });

    const clearFB = (fb: Framebuffer2D) => {
      regl({ framebuffer: fb })(() => regl.clear({ color: [0, 0, 0, 0], depth: 1 }));
    };
    clearFB(accumFB); clearFB(scratchFB); clearFB(bloomA); clearFB(bloomB);

    let frame: ReturnType<Regl["frame"]> | null = null;
    let rafTick = 0;
    const startTime = performance.now();

    const traceNewRays = (src: { x: number; y: number }, count: number, bounces: number) => {
      segmentList.length = 0;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dx = Math.cos(angle), dy = Math.sin(angle);
        traceRaySegments(segmentList, src.x, src.y, dx, dy, bounces);
      }
      const n = segmentList.length;
      if (n === 0) return 0;
      let buf = rayScratch.length >= n ? rayScratch : new Float32Array(Math.max(n, rayScratch.length * 2));
      for (let i = 0; i < n; i++) buf[i] = segmentList[i];
      rayBuf({ data: buf.subarray(0, n), usage: "dynamic", type: "float" });
      return n / 2;
    };

    frame = regl.frame(() => {
      rafTick++;
      const now = performance.now();
      const t = (now - startTime) / 1000;

      if (canvas.width !== Math.round(canvas.clientWidth * dpr) ||
          canvas.height !== Math.round(canvas.clientHeight * dpr)) {
        setCanvasSize();
        resizeFBs();
        clearFB(accumFB); clearFB(scratchFB); clearFB(bloomA); clearFB(bloomB);
      }

      const baseSrc = sourceRef.current;
      let renderSrc: { x: number; y: number } | null = null;
      if (baseSrc) {
        if (!draggingRef.current) {
          const driftR = 2.2;
          const driftT = t * 0.35;
          const ox = Math.sin(driftT) * driftR + Math.sin(driftT * 1.7) * driftR * 0.4;
          const oy = Math.cos(driftT * 0.9) * driftR + Math.cos(driftT * 1.3) * driftR * 0.35;
          const cand = { x: baseSrc.x + ox, y: baseSrc.y + oy };
          renderSrc = inRoom(cand.x, cand.y) ? cand : baseSrc;
        } else {
          renderSrc = baseSrc;
        }
      }

      // decay accum via same-size scratch (avoid down/upsampling artifacts)
      decayPass({ tex: accumFB, factor: 0.92, target: scratchFB });
      decayPass({ tex: scratchFB, factor: 1.0, target: accumFB });

      if (renderSrc) {
        const vertCount = traceNewRays(renderSrc, raysPerFrameRef.current, bouncesRef.current);
        if (vertCount > 0) {
          drawRays({ target: accumFB, count: vertCount, rayAlpha: 0.008 });
        }
      }

      // bloom: downsample via blur from accum to bloomA (horizontal), then bloomA to bloomB (vertical)
      const texelX = 1.0 / (canvas.width >> 1);
      const texelY = 1.0 / (canvas.height >> 1);
      blurPass({ tex: accumFB, dir: [texelX * 1.5, 0], target: bloomA });
      blurPass({ tex: bloomA, dir: [0, texelY * 1.5], target: bloomB });
      blurPass({ tex: bloomB, dir: [texelX * 3.0, 0], target: bloomA });
      blurPass({ tex: bloomA, dir: [0, texelY * 3.0], target: bloomB });

      // composite
      const src = renderSrc;
      const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
      compositePass({
        sourcePos: [src ? src.x : 0, src ? src.y : 0] as [number, number],
        sourceEnabled: src ? 1.0 : 0.0,
        sourcePulse: pulse,
        showFoci: showFociRef.current ? 1.0 : 0.0,
        glow: glowRef.current,
        time: t,
      });
    });

    // interaction
    const getLocal = (clientX: number, clientY: number) => {
      const r = canvas.getBoundingClientRect();
      const nx = (clientX - r.left) / r.width;
      const ny = (clientY - r.top) / r.height;
      const x = (nx - 0.5) * 2.0 * HALF_EXT_X;
      const y = (0.5 - ny) * 2.0 * HALF_EXT_Y;
      return { x, y };
    };
    const setFromEvent = (clientX: number, clientY: number) => {
      const { x, y } = getLocal(clientX, clientY);
      if (inRoom(x, y)) {
        sourceRef.current = { x, y };
        sourceSetAtRef.current = performance.now();
      }
    };
    const onMouseDown = (e: MouseEvent) => { draggingRef.current = true; setFromEvent(e.clientX, e.clientY); };
    const onMouseMove = (e: MouseEvent) => { if (draggingRef.current) setFromEvent(e.clientX, e.clientY); };
    const onMouseUp = () => { draggingRef.current = false; };
    const onMouseLeave = () => { draggingRef.current = false; };
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault(); draggingRef.current = true;
      const t = e.touches[0]; setFromEvent(t.clientX, t.clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (draggingRef.current) { const t = e.touches[0]; setFromEvent(t.clientX, t.clientY); }
    };
    const onTouchEnd = () => { draggingRef.current = false; };

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", onMouseLeave);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);

    // default source (center-ish)
    sourceRef.current = { x: -140, y: 90 };
    sourceSetAtRef.current = performance.now();

    return () => {
      frame?.cancel();
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      accumFB?.destroy();
      bloomA?.destroy();
      bloomB?.destroy();
      rayBuf.destroy();
      regl.destroy();
      void rafTick;
    };
  }, []);

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
          <label>фотонов/кадр <span>{raysVal}</span></label>
          <input
            type="range" min={80} max={1600} step={20} value={raysVal}
            onChange={(e) => {
              const v = +e.target.value;
              raysPerFrameRef.current = v;
              setRaysVal(v);
            }}
          />
        </div>
        <div className="ctrl">
          <label>отражений <span>{bouncesVal}</span></label>
          <input
            type="range" min={5} max={150} step={5} value={bouncesVal}
            onChange={(e) => {
              const v = +e.target.value;
              bouncesRef.current = v;
              setBouncesVal(v);
            }}
          />
        </div>
        <div className="ctrl">
          <label>свечение <span>{glowVal.toFixed(2)}</span></label>
          <input
            type="range" min={0.2} max={2.5} step={0.05} value={glowVal}
            onChange={(e) => {
              const v = +e.target.value;
              glowRef.current = v;
              setGlowVal(v);
            }}
          />
        </div>
        <button
          className={fociActive ? "active" : ""}
          onClick={() => {
            showFociRef.current = !showFociRef.current;
            setFociActive(showFociRef.current);
          }}
        >
          фокусы
        </button>
        <button onClick={() => { sourceRef.current = null; }}>сброс</button>
      </div>
    </>
  );
}
