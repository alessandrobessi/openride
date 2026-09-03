# OpenRide v0.1 (Stelvio MVP) — Milestone Roadmap

Derived from `OPENRIDE-BLUEPRINT.md` §31–33. One milestone per commit
(`AGENTS.md` §34); each satisfies the completion checklist (`AGENTS.md` §35)
before the next begins. Do not implement a later milestone early (`AGENTS.md`
§1).

## Phase 1 — Foundation

| ID  | Milestone                                  | Commit                                                   |
| --- | ------------------------------------------ | -------------------------------------------------------- |
| M0  | Repository bootstrap + GitHub Pages deploy | `chore: bootstrap OpenRide with GitHub Pages deployment` |
| M1  | Three.js rendering scene                   | `feat: add core Three.js rendering scene`                |
| M2  | Fixed-step Rapier physics                  | `feat: integrate fixed-step Rapier physics`              |

## Phase 2 — Motorcycle simulation (flat plane, headless-first core)

| ID  | Milestone                             | Commit                                             |
| --- | ------------------------------------- | -------------------------------------------------- |
| M3  | Motorcycle physics rig                | `feat: add initial motorcycle physics rig`         |
| M4  | Longitudinal dynamics                 | `feat: implement longitudinal motorcycle dynamics` |
| M5  | Parametric engine                     | `feat: implement parametric motorcycle engine`     |
| M6  | Gearbox + clutch                      | `feat: add clutch gearbox and final drive`         |
| M7  | Virtual rider balance controller      | `feat: add virtual rider balance controller`       |
| M8  | Dynamic lean                          | `feat: implement dynamic motorcycle lean`          |
| M9  | Countersteering                       | `feat: model countersteering behavior`             |
| M10 | Bounded tire grip                     | `feat: add bounded motorcycle tire grip`           |
| M11 | Longitudinal weight transfer          | `feat: model longitudinal weight transfer`         |
| M12 | Configurable assists (ABS/TC/wheelie) | `feat: add configurable motorcycle assists`        |

## Phase 3 — Geography

| ID  | Milestone                           | Commit                                          |
| --- | ----------------------------------- | ----------------------------------------------- |
| M13 | Geographic local-coordinate system  | `feat: add geographic local-coordinate system`  |
| M14 | Offline Stelvio OSM road extraction | `feat: add offline Stelvio OSM road extraction` |
| M15 | Stelvio elevation preprocessing     | `feat: add Stelvio elevation preprocessing`     |
| M16 | Rideable road mesh from OSM         | `feat: generate rideable road mesh from OSM`    |
| M17 | DEM-based Stelvio terrain           | `feat: generate DEM-based Stelvio terrain`      |
| M18 | Static world package format         | `feat: add static world package format`         |
| M19 | Chunk streaming                     | `feat: stream geographic world chunks`          |

## Phase 4 — Immersion

| ID  | Milestone               | Commit                                                |
| --- | ----------------------- | ----------------------------------------------------- |
| M20 | First-person cockpit    | `feat: add first-person adventure motorcycle cockpit` |
| M21 | Instrument cluster      | `feat: add simulation-driven instrument cluster`      |
| M22 | Gamepad controls        | `feat: add first-class gamepad controls`              |
| M23 | Procedural engine audio | `feat: add procedural engine audio`                   |
| M24 | Wind + road audio       | `feat: add dynamic wind and road audio`               |

## Phase 5 — Visual world (BLUEPRINT §34)

| ID  | Milestone                       | Commit                                                  |
| --- | ------------------------------- | ------------------------------------------------------- |
| M25 | Road furniture                  | `feat: add road furniture (guardrails and delineators)` |
| M26 | Procedural vegetation           | `feat: add procedural vegetation`                       |
| M27 | Extruded OSM buildings          | `feat: add extruded OSM buildings`                      |
| M28 | Sky, sun + atmospheric lighting | `feat: add sky, sun and atmospheric lighting`           |

## Out of scope

Weather / wet grip (BLUEPRINT §35), route selection (§36), and everything in
`AGENTS.md` §36. WebGPU stays a future experiment.
