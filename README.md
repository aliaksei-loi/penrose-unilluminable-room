# Penrose's Unilluminable Room

Interactive demo of [Roger Penrose's 1958 unilluminable room](https://en.wikipedia.org/wiki/Illumination_problem) — a planar region where a single point light source leaves some points in permanent shadow, no matter how many times light reflects off the walls.

**Live demo:** https://penrose-unilluminable-room.vercel.app

## How it works

The room is bounded by an ellipse with two mushroom-shaped protrusions whose corners sit exactly on the ellipse's foci. The ellipse's reflection property — any ray through one focus reflects through the other — partitions the room into regions that light cannot cross. Place the source in one half and watch the dark zones persist through millions of bounces.

Click anywhere inside the room to place the source. Drag to move it. Toggle the **foci** overlay to see the geometric construction.

## Stack

- Next.js 16 + React 19
- WebGL via [regl](https://github.com/regl-project/regl) — photon accumulation into a float framebuffer with bloom
- Ray/wall intersection math in [app/penrose-math.ts](app/penrose-math.ts)

## Run locally

```bash
pnpm install
pnpm dev
```

## References

- Penrose, R. (1958). _On the nature of light rays._
- Straus's problem / illumination problem — [Wikipedia](https://en.wikipedia.org/wiki/Illumination_problem)
