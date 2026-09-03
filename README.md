# OpenRide

A browser-based, first-person, simulation-oriented motorcycle touring experience
built from real-world geographic data.

> The Earth is the map. The ride is the game.

The canonical MVP ride is **Passo dello Stelvio**. OpenRide deploys as a static
site to GitHub Pages — there is no backend.

## Status

Bootstrap (**M0**). SvelteKit + static adapter shell with GitHub Pages
deployment. See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the milestone plan.

## Stack

TypeScript · SvelteKit 2 / Svelte 5 · Vite 6 · Three.js (rendering) ·
Rapier 3D / WASM (physics) · Web Audio · Gamepad API. Package manager: pnpm.

## Development

```sh
pnpm install
pnpm dev            # dev server
pnpm check          # svelte-check typecheck
pnpm lint           # prettier + eslint
pnpm test           # vitest unit + scenario tests (headless)
pnpm test:e2e       # playwright smoke test
pnpm build          # static build into ./build
pnpm preview        # serve the static build
```

The production build uses a base path: CI runs `BASE_PATH=/openride pnpm build`
so assets resolve under `https://<user>.github.io/openride/`. Local dev and the
e2e smoke run with no base path.

## Specification

Authoritative documents, in conflict-resolution order (see `AGENTS.md` §2):

1. [`AGENTS.md`](AGENTS.md) — mandatory coding rules
2. [`OPENRIDE-BLUEPRINT.md`](OPENRIDE-BLUEPRINT.md) — architecture & roadmap
3. [`MOTORCYCLE-PHYSICS.md`](MOTORCYCLE-PHYSICS.md) — physical model
4. [`ADVENTURE-1200.md`](ADVENTURE-1200.md) — default motorcycle parameters

## Deployment

Push to `main` triggers `.github/workflows/deploy-pages.yml`. **One-time setup:**
in the GitHub repository, set **Settings → Pages → Build and deployment → Source**
to **GitHub Actions**.
