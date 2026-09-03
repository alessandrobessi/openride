# OpenRide --- Technical Blueprint & Implementation Roadmap

**Project:** OpenRide\
**Concept:** A browser-based, first-person, simulation-oriented
motorcycle touring experience built from real-world geographic data.\
**Canonical MVP location:** Passo dello Stelvio, Italy\
**Deployment target:** GitHub Pages\
**Primary stack:** TypeScript + SvelteKit + Three.js + Rapier\
**Target platform:** Modern desktop browsers, with gamepad support as a
first-class input method.

------------------------------------------------------------------------

## 1. Product Vision

OpenRide should let a user select a real-world route, enter a
first-person motorcycle cockpit, and ride through a 3D reconstruction
derived from real geographic data.

The initial product is deliberately **not** a racing game. There are no
scores, opponents, missions, or artificial tracks.

The core fantasy is:

> Pick a place on Earth and ride it.

The simulation should prioritize:

1.  believable motorcycle dynamics;
2.  recognizable real-world road geometry;
3.  real elevation and gradient;
4.  convincing speed, acceleration, braking, lean, and engine behavior;
5.  immersion through cockpit motion and sound;
6.  progressively richer geographic reconstruction.

The first milestone is not "the whole world." It is one excellent ride:
**Passo dello Stelvio**.

------------------------------------------------------------------------

## 2. MVP Success Criterion

The MVP is successful when a user can:

1.  open OpenRide from GitHub Pages;
2.  choose the Stelvio prototype;
3.  enter first-person cockpit view;
4.  start the engine;
5.  engage first gear;
6.  modulate clutch and throttle;
7.  accelerate uphill;
8.  shift through the gearbox;
9.  brake realistically;
10. lean through geographically recognizable Stelvio hairpins;
11. experience gradient affecting acceleration;
12. stop near the summit.

If this feels recognizably like riding a motorcycle on the Stelvio road,
the central technical hypothesis has been validated.

------------------------------------------------------------------------

## 3. Guiding Principles

### 3.1 Simulation first, but staged

Do not attempt a research-grade motorcycle dynamics model in the first
commit.

Build progressively:

**kinematic prototype → dynamic motorcycle → rider controller →
tire/load model → advanced assists**

The simulation must remain playable at every stage.

### 3.2 Geography becomes game geometry

OpenStreetMap, elevation models, and other geographic sources are
preprocessing inputs.

The physics engine should operate in ordinary local Cartesian
coordinates measured in meters.

Never make the motorcycle physics depend directly on latitude/longitude.

### 3.3 Static deployment is a hard architectural constraint

OpenRide is deployed on **GitHub Pages**.

Therefore the production application must be capable of operating as a
static site.

The runtime architecture should assume:

-   no persistent application server;
-   no server-side rendering dependency;
-   no private runtime secrets;
-   no runtime database requirement;
-   no mandatory backend GIS transformation;
-   assets and prepared geographic chunks can be served as static files.

Expensive GIS processing should therefore happen **offline during
development/build preprocessing**, not on GitHub Pages.

### 3.4 Realism through systems, not visual excess

Prioritize:

-   physics;
-   road geometry;
-   elevation;
-   cockpit motion;
-   sound;
-   input response;

before:

-   photorealistic buildings;
-   dense vegetation;
-   pedestrians;
-   traffic;
-   elaborate weather.

A sparse world with excellent riding dynamics is preferable to a
beautiful world with arcade handling.

------------------------------------------------------------------------

# 4. High-Level Architecture

``` text
                     REAL-WORLD DATA
                           |
          +----------------+----------------+
          |                |                |
     OpenStreetMap       DEM data       optional imagery
          |                |                |
          +----------------+----------------+
                           |
                           v
                 OFFLINE WORLD BUILDER
                           |
          +----------------+----------------+
          |                |                |
       terrain           roads          metadata
       meshes            meshes         chunks
          |                |                |
          +----------------+----------------+
                           |
                    static assets
                           |
                           v
                     GitHub Pages
                           |
                           v
                    OpenRide client
                           |
             +-------------+-------------+
             |                           |
          Three.js                      Rapier
         rendering                     physics
             |                           |
             +-------------+-------------+
                           |
                     simulation loop
                           |
                 motorcycle + rider
                           |
                      cockpit POV
```

------------------------------------------------------------------------

# 5. Proposed Technology Stack

## Application

-   TypeScript
-   SvelteKit
-   pnpm
-   static SvelteKit adapter
-   Vite

## Rendering

-   Three.js
-   WebGL initially
-   WebGPU only as a future optimization/experimental renderer

## Physics

-   Rapier 3D / Rapier WASM

## Geographic sources

-   OpenStreetMap for road topology and tagged features
-   DEM/elevation dataset for terrain
-   optional land-cover data later
-   optional building footprints from OSM

## Audio

-   Web Audio API
-   synthesized/parameterized engine model
-   optional carefully licensed samples for mechanical layers

## Input

-   Keyboard
-   Gamepad API
-   controller support treated as a core feature rather than an
    afterthought

## Deployment

-   GitHub Actions
-   GitHub Pages

------------------------------------------------------------------------

# 6. GitHub Pages Architecture

GitHub Pages materially affects the design.

The application should be exported as static assets:

``` text
build/
├── index.html
├── _app/
├── assets/
│   ├── motorcycles/
│   ├── audio/
│   └── textures/
└── worlds/
    └── stelvio/
        ├── manifest.json
        ├── chunks/
        ├── roads/
        └── terrain/
```

The browser downloads only the geographic chunks required around the
player.

For the MVP, Stelvio can be fully preprocessed and committed/released as
static world data.

Later, large world packs should be split into individually cacheable
files.

### Important rule

Do **not** make runtime OpenStreetMap conversion a requirement.

Instead:

``` text
OSM + DEM
   |
   v
scripts/build-world
   |
   v
optimized OpenRide chunks
   |
   v
GitHub Pages
   |
   v
browser
```

This makes GitHub Pages a perfectly reasonable deployment platform for
the prototype.

------------------------------------------------------------------------

# 7. Repository Structure

``` text
openride/
├── src/
│   ├── lib/
│   │   ├── world/
│   │   │   ├── geo/
│   │   │   ├── terrain/
│   │   │   ├── roads/
│   │   │   ├── streaming/
│   │   │   └── WorldManager.ts
│   │   │
│   │   ├── simulation/
│   │   │   ├── core/
│   │   │   ├── motorcycle/
│   │   │   ├── engine/
│   │   │   ├── drivetrain/
│   │   │   ├── suspension/
│   │   │   ├── tires/
│   │   │   ├── rider/
│   │   │   └── assists/
│   │   │
│   │   ├── rendering/
│   │   │   ├── scene/
│   │   │   ├── cockpit/
│   │   │   ├── camera/
│   │   │   ├── lighting/
│   │   │   └── environment/
│   │   │
│   │   ├── audio/
│   │   │   ├── engine/
│   │   │   ├── wind/
│   │   │   └── tires/
│   │   │
│   │   ├── controls/
│   │   │   ├── keyboard/
│   │   │   └── gamepad/
│   │   │
│   │   └── telemetry/
│   │
│   └── routes/
│
├── static/
│   ├── worlds/
│   │   └── stelvio/
│   ├── motorcycles/
│   ├── textures/
│   └── audio/
│
├── tools/
│   ├── osm/
│   ├── elevation/
│   ├── terrain/
│   └── world-builder/
│
├── tests/
├── docs/
├── .github/
│   └── workflows/
│       └── deploy-pages.yml
├── svelte.config.js
├── vite.config.ts
├── package.json
├── README.md
└── OPENRIDE-BLUEPRINT.md
```

------------------------------------------------------------------------

# 8. Coordinate System

Geographic coordinates should be converted around a local origin.

For the Stelvio world:

``` text
latitude / longitude / altitude
             |
             v
       local ENU frame
             |
             v
X = east
Y = up
Z = north
```

The physics engine only sees meters.

Example:

``` text
origin = Stelvio reference point

motorcycle:
x = 238.4 m
y = 187.2 m relative altitude
z = -914.7 m
```

Keep geographic coordinates separately for:

-   route metadata;
-   UI;
-   debugging;
-   world streaming;
-   future map selection.

------------------------------------------------------------------------

# 9. Stelvio World Pipeline

## Input

The first world builder consumes:

``` text
Stelvio bounding region
        |
        +-- OpenStreetMap road data
        |
        +-- elevation raster / DEM
        |
        +-- optional building footprints
```

## Road extraction

Extract the target road and relevant connected roads.

Preserve useful metadata where available:

-   highway classification;
-   surface;
-   lanes;
-   width;
-   bridge;
-   tunnel;
-   maxspeed;
-   name;
-   ref;
-   access.

Do not assume every tag exists.

## Road centerline

Convert OSM nodes into local coordinates:

``` text
p0 ---- p1
         \
          p2
           \
            p3
```

Then create a smoothed spline while maintaining enough fidelity that
hairpins remain geographically recognizable.

## Elevation sampling

For every road sample:

``` text
(x, z)
   |
   v
DEM lookup
   |
   v
height y
```

Avoid independently smoothing vertical geometry so aggressively that
real gradients disappear.

## Road mesh

Generate:

-   centerline;
-   left/right edges;
-   asphalt surface;
-   shoulders;
-   markings;
-   collision surface.

Road width may derive from metadata when reliable, otherwise from
conservative defaults by road type.

## Terrain

Create terrain chunks around the route.

For example:

``` text
256 m x 256 m
or
512 m x 512 m
```

Each chunk contains:

-   render mesh;
-   lower-detail variants if required;
-   collision representation near the rider;
-   geographic bounds;
-   chunk ID.

## Static world manifest

``` json
{
  "id": "stelvio",
  "name": "Passo dello Stelvio",
  "origin": {
    "lat": 0,
    "lon": 0,
    "alt": 0
  },
  "spawn": {
    "x": 0,
    "y": 0,
    "z": 0,
    "heading": 0
  },
  "chunks": []
}
```

Actual coordinates are inserted by the preprocessing pipeline.

------------------------------------------------------------------------

# 10. World Streaming

Maintain concentric levels around the rider.

``` text
             FAR
     +------------------+
     |                  |
     |      MEDIUM      |
     |   +----------+   |
     |   |   NEAR   |   |
     |   |    M     |   |
     |   +----------+   |
     |                  |
     +------------------+

M = motorcycle
```

Suggested initial ranges:

  Range         Function
  ------------- ---------------------------------
  0--500 m      high-detail render + physics
  500 m--2 km   normal rendering
  2--8 km       simplified terrain
  beyond        optional horizon representation

The Stelvio MVP can initially preload the whole small prototype region.
Streaming should still be designed early so the architecture does not
assume a tiny map forever.

------------------------------------------------------------------------

# 11. Simulation Loop

Rendering and physics must not use the same unconstrained timestep.

Use a fixed simulation step.

Example:

``` text
physics: 120 Hz target
render: requestAnimationFrame
```

Conceptually:

``` typescript
accumulator += frameDelta;

while (accumulator >= FIXED_DT) {
    controls.sample();
    rider.update(FIXED_DT);
    motorcycle.update(FIXED_DT);
    physics.step(FIXED_DT);

    accumulator -= FIXED_DT;
}

renderer.render(interpolatedState);
```

Test 60 Hz versus 120 Hz physics during development. Choose based on
stability and browser performance.

------------------------------------------------------------------------

# 12. Motorcycle State Model

The motorcycle simulation should expose explicit state.

``` typescript
interface MotorcycleState {
  position: Vec3;
  velocity: Vec3;

  yaw: number;
  pitch: number;
  roll: number;

  angularVelocity: Vec3;

  steeringAngle: number;

  frontWheelOmega: number;
  rearWheelOmega: number;

  engineRPM: number;
  gear: number;

  throttle: number;
  clutch: number;
  frontBrake: number;
  rearBrake: number;

  frontSuspensionTravel: number;
  rearSuspensionTravel: number;

  frontNormalLoad: number;
  rearNormalLoad: number;
}
```

Additional internal state can be introduced progressively.

------------------------------------------------------------------------

# 13. Motorcycle Physical Parameters

Do not call the first motorcycle an exact BMW R 1200 GS simulation.

Create a fictional large adventure motorcycle inspired by that class.

Example parameter categories:

``` typescript
interface MotorcycleConfig {
  massBike: number;
  massRider: number;

  wheelbase: number;
  cgHeight: number;
  cgLongitudinal: number;

  wheelRadiusFront: number;
  wheelRadiusRear: number;

  frontalArea: number;
  dragCoefficient: number;
  rollingResistance: number;

  maxSteeringAngle: number;

  finalDriveRatio: number;
  gearRatios: number[];

  idleRPM: number;
  redlineRPM: number;

  torqueCurve: TorquePoint[];
}
```

Values should be centralized in configuration rather than scattered
through simulation code.

------------------------------------------------------------------------

# 14. Longitudinal Dynamics

At the simplest useful level:

\[ F\_{net} = F\_{traction} - F\_{drag} - F\_{rolling} - F\_{grade} \]

and:

\[ a = `\frac{F_{net}}{m}`{=tex} \]

## Aerodynamic drag

\[ F_d = `\frac{1}{2}`{=tex} `\rho `{=tex}C_d A v\^2 \]

This becomes increasingly important at motorway speeds.

## Rolling resistance

Approximation:

\[ F\_{rr} = C\_{rr}mg`\cos`{=tex}(`\theta`{=tex}) \]

## Gradient

\[ F\_{grade}=mg`\sin`{=tex}(`\theta`{=tex}) \]

This is essential for Stelvio.

The player should immediately feel a difference between:

-   flat;
-   5% climb;
-   10% climb;
-   steep hairpin exit.

------------------------------------------------------------------------

# 15. Engine Model

Use a torque curve rather than a direct throttle-to-force mapping.

``` text
throttle
   |
   v
requested torque
   |
   v
torque curve @ current RPM
   |
   v
engine torque
```

Represent the torque curve as sample points and interpolate.

Example conceptual curve:

``` text
Torque
 ^
 |            ______
 |         __/      \__
 |      __/            \
 |_____/
 +--------------------------> RPM
   idle                 redline
```

The model should include:

-   idle;
-   throttle response;
-   engine inertia;
-   rev limiter;
-   engine braking.

------------------------------------------------------------------------

# 16. Transmission

Power flow:

``` text
engine
  |
clutch
  |
gearbox
  |
final drive
  |
rear wheel
```

Rear-wheel torque approximately:

\[ T_w = T_e `\times `{=tex}G `\times `{=tex}F
`\times `{=tex}`\eta`{=tex} \]

where:

-   (T_e) = engine torque;
-   \(G\) = selected gear ratio;
-   \(F\) = final-drive ratio;
-   (`\eta`{=tex}) = drivetrain efficiency.

Then:

\[ F\_{traction} = `\frac{T_w}{r_w}`{=tex} \]

The MVP should model:

-   neutral;
-   six gears;
-   clutch engagement;
-   clutch slip;
-   stalls;
-   engine braking;
-   shifting delay.

------------------------------------------------------------------------

# 17. Braking and Weight Transfer

Approximate longitudinal load transfer:

\[ `\Delta `{=tex}F = `\frac{m a h}{L}`{=tex} \]

where:

-   \(a\) = longitudinal acceleration/deceleration;
-   \(h\) = center-of-gravity height;
-   \(L\) = wheelbase.

Under heavy braking:

``` text
       CG
        *
       /|
O-----/-|----O
^^^^^^       ^^
front        rear
load         load
increases    decreases
```

This affects available tire grip.

Later this allows:

-   front-wheel lock;
-   rear-wheel lift;
-   ABS;
-   braking stability differences.

------------------------------------------------------------------------

# 18. Cornering and Lean

A useful equilibrium relationship is:

\[ `\tan`{=tex}(`\phi`{=tex}) = `\frac{v^2}{rg}`{=tex} \]

where:

-   (`\phi`{=tex}) = lean angle;
-   \(v\) = speed;
-   \(r\) = turn radius;
-   \(g\) = gravity.

Do not simply calculate this angle and force the visual model to it.

Use it initially as:

-   a target/reference for the virtual rider;
-   a validation metric;
-   an assist input.

The motorcycle's roll should remain a physical state.

------------------------------------------------------------------------

# 19. Countersteering

At meaningful speed, user steering input should represent desired
turning/lean behavior rather than directly rotating the motorcycle
around the yaw axis.

Conceptually:

``` text
user requests LEFT
       |
       v
virtual rider
       |
brief steering torque RIGHT
       |
bike begins rolling LEFT
       |
steering geometry + tire forces
       |
bike turns LEFT
```

The exact dynamics can evolve over several milestones.

Do not attempt perfect countersteering in the first physics commit.

------------------------------------------------------------------------

# 20. Virtual Rider Controller

This is one of the most important systems.

A real motorcycle is not controlled by a rider specifying:

``` text
roll = 27 degrees
```

The rider continuously stabilizes the vehicle.

OpenRide therefore needs a virtual rider between user input and
motorcycle dynamics.

``` text
GAMEPAD
   |
   v
rider intention
   |
   v
VIRTUAL RIDER
   |
   +-- balance correction
   +-- steering torque
   +-- countersteering
   +-- target lean
   +-- optional body shift
   |
   v
MOTORCYCLE
```

This gives the simulation realism without making it unusably unstable.

------------------------------------------------------------------------

# 21. Rider Assists

Expose assists eventually as simulation options.

``` text
Balance assist
Countersteering assist
ABS
Traction control
Wheelie control
Stall assist
Auto clutch
Automatic gearbox
```

Default profile:

``` text
Balance assist          ON
Countersteering assist  ON
ABS                     ON
Traction control        ON
Wheelie control         ON
Auto clutch             OFF
Automatic gearbox       OFF
```

The default experience should be challenging but rideable.

------------------------------------------------------------------------

# 22. Tire Model

Do not begin with Pacejka or a complex empirical tire model.

V1 can use a bounded friction model.

Approximate maximum combined force:

\[ F\_{max} = `\mu `{=tex}F_z \]

Then constrain longitudinal and lateral demand.

Conceptually:

\[ `\left`{=tex}(`\frac{F_x}{F_{max}}`{=tex}`\right`{=tex})\^2 +
`\left`{=tex}(`\frac{F_y}{F_{max}}`{=tex}`\right`{=tex})\^2
`\le 1`{=tex} \]

This produces the important behavior that braking consumes grip that
would otherwise be available for cornering.

Later milestones can introduce:

-   slip ratio;
-   slip angle;
-   different front/rear tire characteristics;
-   wet grip;
-   surface-dependent friction;
-   temperature only if it proves useful.

------------------------------------------------------------------------

# 23. Suspension

Initial suspension can use spring-damper behavior:

\[ F = -kx - cv \]

with separate front/rear parameters.

Simulation inputs include:

-   compression;
-   extension;
-   velocity;
-   wheel load.

Suspension should eventually affect:

-   pitch;
-   road feel;
-   braking;
-   traction;
-   cockpit motion.

------------------------------------------------------------------------

# 24. Surface Model

Road segments can carry surface properties:

``` typescript
interface SurfaceProperties {
  frictionDry: number;
  frictionWet: number;
  rollingResistance: number;
  roughness: number;
}
```

Examples:

-   asphalt;
-   concrete;
-   gravel;
-   dirt;
-   cobblestone.

This is especially valuable later because an adventure motorcycle should
eventually be capable of leaving asphalt.

------------------------------------------------------------------------

# 25. Cockpit and Camera

The first-person motorcycle asset only needs high detail where the rider
sees it.

Prioritize:

-   windshield;
-   handlebars;
-   mirrors;
-   instrument cluster;
-   controls;
-   upper tank;
-   small portions of fairing.

Avoid spending early development effort on hidden geometry.

Camera motion should derive from actual simulation state:

``` text
bike roll
   +
bike pitch
   +
suspension
   +
engine vibration
   +
rider head stabilization
   =
camera transform
```

Do not attach the camera rigidly to the motorcycle frame.

A small amount of virtual head stabilization is necessary for comfort
and realism.

------------------------------------------------------------------------

# 26. Dashboard

Minimum dashboard:

``` text
speed
gear
RPM
ABS indicator
traction-control indicator
neutral indicator
```

Later:

``` text
fuel
temperature
trip
navigation
ambient temperature
clock
```

The UI should primarily exist physically inside the cockpit rather than
as a floating game HUD.

------------------------------------------------------------------------

# 27. Controls

## Keyboard

Suggested development mapping:

``` text
W           throttle
S           braking
A / D       steering intention
Q / E       shift down / up
Shift       clutch
Space       front brake
Ctrl        rear brake
R           restart/reset bike
```

Keyboard is primarily for accessibility and development.

## Gamepad

Preferred simulation input:

``` text
RT          throttle
LT          front brake
left stick  steering intention
LB          clutch
RB          rear brake
buttons     gear up/down
```

All analog inputs should support:

-   dead zones;
-   response curves;
-   calibration;
-   configurable sensitivity.

------------------------------------------------------------------------

# 28. Audio Architecture

Audio is a core simulation system.

``` text
engine RPM -----+
engine load ----+--> engine synthesizer
throttle -------+

speed -------------> wind

surface -----------> tire/road noise

suspension events --> bumps/mechanical noise
```

## Engine

Build engine sound from layered components:

-   combustion pulse;
-   harmonics;
-   intake;
-   exhaust;
-   mechanical noise.

Drive them parametrically using:

-   RPM;
-   throttle;
-   load;
-   engine braking.

This avoids an obvious repeating audio loop.

------------------------------------------------------------------------

# 29. Performance Budget

Initial target:

``` text
60 FPS rendering
stable fixed-step physics
desktop Chromium/Firefox/Safari-class browsers
```

Measure:

-   frame time;
-   physics step time;
-   draw calls;
-   triangles;
-   texture memory;
-   chunk loading;
-   garbage collection;
-   WASM overhead.

Avoid premature visual optimization. Establish telemetry early.

------------------------------------------------------------------------

# 30. GitHub Pages Deployment

SvelteKit must use a static adapter.

Deployment flow:

``` text
git push
   |
   v
GitHub Actions
   |
   +-- pnpm install
   +-- lint
   +-- typecheck
   +-- test
   +-- build
   |
   v
static output
   |
   v
GitHub Pages
```

The application must work correctly when hosted from either:

``` text
https://<user>.github.io/openride/
```

or a custom domain later.

Account for GitHub Pages base paths in:

-   asset URLs;
-   world chunk URLs;
-   textures;
-   audio;
-   model loading.

Never hardcode `/worlds/...` if deployment may occur under `/openride/`.

Use the application's configured base path.

------------------------------------------------------------------------

# 31. Development Roadmap

The milestones below are intentionally small enough to hand individually
to a coding agent.

------------------------------------------------------------------------

## M0 --- Repository Bootstrap

### Goal

Deploy an empty but functional OpenRide shell to GitHub Pages.

### Tasks

-   create SvelteKit TypeScript project;
-   configure pnpm;
-   configure static adapter;
-   configure GitHub Pages base path;
-   add GitHub Actions deployment;
-   add lint/typecheck/test commands;
-   create basic project structure;
-   add minimal landing page;
-   verify deployment.

### Acceptance

Opening the GitHub Pages URL loads OpenRide successfully.

### Commit

`chore: bootstrap OpenRide with GitHub Pages deployment`

------------------------------------------------------------------------

## M1 --- Three.js Scene

### Goal

Establish rendering.

### Tasks

-   create Three.js scene;
-   perspective camera;
-   renderer lifecycle;
-   resize handling;
-   lighting;
-   flat ground plane;
-   coordinate/debug axes;
-   render loop.

### Acceptance

Browser displays a stable 3D test environment at 60 FPS.

### Commit

`feat: add core Three.js rendering scene`

------------------------------------------------------------------------

## M2 --- Rapier Integration

### Goal

Establish deterministic physics.

### Tasks

-   initialize Rapier;
-   fixed timestep;
-   gravity;
-   static ground collider;
-   dynamic test rigid body;
-   interpolate visual transforms.

### Acceptance

A rigid body falls and collides correctly independent of render FPS.

### Commit

`feat: integrate fixed-step Rapier physics`

------------------------------------------------------------------------

## M3 --- Motorcycle Physics Rig

### Goal

Create the first two-wheel physical object.

### Tasks

-   motorcycle chassis rigid body;
-   front/rear wheel representations;
-   wheel contact;
-   basic suspension;
-   center of gravity;
-   debug rendering.

### Acceptance

Motorcycle rests on the ground and responds to forces.

Temporary stabilization is allowed.

### Commit

`feat: add initial motorcycle physics rig`

------------------------------------------------------------------------

## M4 --- Longitudinal Dynamics

### Goal

Make the motorcycle accelerate and stop believably.

### Tasks

-   mass;
-   rolling resistance;
-   aerodynamic drag;
-   rear-wheel traction;
-   front/rear brakes;
-   velocity telemetry.

### Acceptance

Acceleration and top speed emerge from forces rather than directly
assigned velocity.

### Commit

`feat: implement longitudinal motorcycle dynamics`

------------------------------------------------------------------------

## M5 --- Engine

### Goal

Add engine state.

### Tasks

-   idle RPM;
-   torque curve;
-   throttle;
-   engine inertia;
-   limiter;
-   engine braking.

### Acceptance

RPM responds believably to throttle/load.

### Commit

`feat: implement parametric motorcycle engine`

------------------------------------------------------------------------

## M6 --- Gearbox and Clutch

### Goal

Make powertrain interaction simulation-like.

### Tasks

-   neutral;
-   six gears;
-   gear ratios;
-   final drive;
-   clutch engagement;
-   clutch slip;
-   shifting;
-   stalling.

### Acceptance

Player can start from rest manually and shift through gears.

### Commit

`feat: add clutch gearbox and final drive`

------------------------------------------------------------------------

## M7 --- Basic Rider Controller

### Goal

Make the motorcycle rideable.

### Tasks

-   desired turn input;
-   balance controller;
-   roll stabilization;
-   steering control;
-   speed-dependent steering behavior.

### Acceptance

Player can ride around a flat test course without constant falling.

### Commit

`feat: add virtual rider balance controller`

------------------------------------------------------------------------

## M8 --- Dynamic Lean

### Goal

Make cornering physically meaningful.

### Tasks

-   roll dynamics;
-   target lean estimation;
-   lateral forces;
-   speed/radius relationship;
-   rider feedback loop.

### Acceptance

Lean varies naturally with speed and corner radius.

### Commit

`feat: implement dynamic motorcycle lean`

------------------------------------------------------------------------

## M9 --- Countersteering

### Goal

Replace arcade steering with motorcycle-like steering behavior.

### Tasks

-   steering torque;
-   speed-dependent control;
-   countersteering transient;
-   rider controller tuning.

### Acceptance

High-speed turn initiation emerges through roll/countersteering behavior
rather than direct yaw rotation.

### Commit

`feat: model countersteering behavior`

------------------------------------------------------------------------

## M10 --- Tire Grip

### Goal

Introduce finite traction.

### Tasks

-   normal load;
-   friction coefficient;
-   combined longitudinal/lateral grip;
-   front/rear grip state;
-   slip telemetry.

### Acceptance

Excess braking or cornering demand can exceed available traction.

### Commit

`feat: add bounded motorcycle tire grip`

------------------------------------------------------------------------

## M11 --- Weight Transfer

### Goal

Make braking and acceleration alter axle loads.

### Tasks

-   CG height;
-   longitudinal transfer;
-   front/rear normal forces;
-   braking grip changes;
-   suspension interaction.

### Acceptance

Heavy braking loads the front tire and unloads the rear.

### Commit

`feat: model longitudinal weight transfer`

------------------------------------------------------------------------

## M12 --- Simulation Assists

### Goal

Make realism configurable.

### Tasks

-   ABS;
-   traction control;
-   balance assist;
-   wheelie mitigation;
-   configuration model.

### Acceptance

Assists can be toggled independently.

### Commit

`feat: add configurable motorcycle assists`

------------------------------------------------------------------------

# 32. Stelvio Milestones

## M13 --- Geographic Coordinate Module

### Goal

Convert geographic coordinates to local metric coordinates.

### Tasks

-   define world origin;
-   lat/lon → local ENU conversion;
-   altitude handling;
-   round-trip tests;
-   debug coordinate display.

### Acceptance

Known geographic distances convert to correct approximate metric
distances.

### Commit

`feat: add geographic local-coordinate system`

------------------------------------------------------------------------

## M14 --- OSM Stelvio Extractor

### Goal

Produce normalized road data for the prototype.

### Tasks

-   define Stelvio extraction area;
-   parse OSM data offline;
-   identify target road;
-   preserve useful tags;
-   output normalized JSON.

### Acceptance

Stelvio road centerline is visible as a debug polyline.

### Commit

`feat: add offline Stelvio OSM road extraction`

------------------------------------------------------------------------

## M15 --- Elevation Pipeline

### Goal

Apply real terrain elevation.

### Tasks

-   import DEM source offline;
-   geographic height sampling;
-   road elevation sampling;
-   normalized elevation output;
-   validation plots/debug view.

### Acceptance

Road altitude profile resembles the real Stelvio climb.

### Commit

`feat: add Stelvio elevation preprocessing`

------------------------------------------------------------------------

## M16 --- Road Mesh Generator

### Goal

Turn the real road into rideable geometry.

### Tasks

-   spline generation;
-   road width;
-   asphalt mesh;
-   collision mesh;
-   road markings;
-   shoulder geometry.

### Acceptance

Motorcycle can physically ride along the generated Stelvio road.

### Commit

`feat: generate rideable road mesh from OSM`

------------------------------------------------------------------------

## M17 --- Terrain Generator

### Goal

Surround the road with real elevation terrain.

### Tasks

-   terrain grid;
-   DEM sampling;
-   chunk generation;
-   normals;
-   basic material;
-   terrain colliders near road.

### Acceptance

Stelvio road sits inside recognizable mountainous terrain.

### Commit

`feat: generate DEM-based Stelvio terrain`

------------------------------------------------------------------------

## M18 --- World Manifest

### Goal

Formalize static world packages.

### Tasks

-   manifest schema;
-   origin;
-   spawn;
-   road assets;
-   terrain chunks;
-   metadata;
-   versioning.

### Acceptance

The application loads Stelvio exclusively through its manifest.

### Commit

`feat: add static world package format`

------------------------------------------------------------------------

## M19 --- Chunk Streaming

### Goal

Prepare architecture for large worlds.

### Tasks

-   player chunk detection;
-   async asset loading;
-   near/far sets;
-   unload policy;
-   cache;
-   loading telemetry.

### Acceptance

Player movement causes world chunks to load/unload without visible
freezes.

### Commit

`feat: stream geographic world chunks`

------------------------------------------------------------------------

# 33. Immersion Milestones

## M20 --- First-Person Cockpit

### Tasks

-   placeholder adventure-bike cockpit;
-   handlebars;
-   windshield;
-   instrument cluster;
-   camera mount;
-   head stabilization.

### Acceptance

Entire ride can be completed in convincing first-person POV.

### Commit

`feat: add first-person adventure motorcycle cockpit`

------------------------------------------------------------------------

## M21 --- Instrument Cluster

### Tasks

-   speed;
-   RPM;
-   gear;
-   neutral;
-   ABS;
-   traction control.

### Acceptance

Cockpit instrumentation reflects live simulation state.

### Commit

`feat: add simulation-driven instrument cluster`

------------------------------------------------------------------------

## M22 --- Gamepad

### Tasks

-   Gamepad API;
-   analog throttle;
-   analog brake;
-   steering;
-   clutch;
-   shifting;
-   dead-zone configuration.

### Acceptance

A complete ride can be performed without keyboard input.

### Commit

`feat: add first-class gamepad controls`

------------------------------------------------------------------------

## M23 --- Engine Audio

### Tasks

-   RPM-driven oscillator/layers;
-   load response;
-   intake/exhaust balance;
-   engine braking audio.

### Acceptance

Engine sound continuously follows simulation state without obvious
looping.

### Commit

`feat: add procedural engine audio`

------------------------------------------------------------------------

## M24 --- Wind and Road Audio

### Tasks

-   speed-dependent wind;
-   surface-dependent tire sound;
-   bump events.

### Acceptance

Perceived speed changes strongly with velocity even without looking at
instruments.

### Commit

`feat: add dynamic wind and road audio`

------------------------------------------------------------------------

# 34. Visual World Milestones

## M25 --- Road Furniture

Add:

-   guardrails;
-   delineators;
-   signs;
-   barriers;
-   tunnel portals where applicable.

Use geographic metadata when available; do not fabricate real-world
claims from absent data.

------------------------------------------------------------------------

## M26 --- Vegetation

Add procedural vegetation driven by altitude/land-cover rules.

Use instancing aggressively.

------------------------------------------------------------------------

## M27 --- Buildings

Extrude OSM building footprints where useful.

Prioritize recognizable silhouettes rather than architectural detail.

------------------------------------------------------------------------

## M28 --- Lighting and Sky

Add:

-   physically plausible sun;
-   sky;
-   atmospheric haze;
-   mountain distance fading;
-   configurable time of day.

------------------------------------------------------------------------

# 35. Weather Roadmap

Only after dry-weather riding is excellent.

``` text
weather state
   |
   +-- sky
   +-- visibility
   +-- road wetness
   +-- audio
   +-- tire friction
```

First weather milestone:

**light rain**

Effects:

-   wet road shader;
-   reduced friction;
-   longer braking;
-   reduced visibility;
-   rain audio;
-   optional windshield droplets later.

Weather must affect simulation, not just visuals.

------------------------------------------------------------------------

# 36. Future Real-World Route Selection

Do not implement global arbitrary routing during the Stelvio MVP.

First establish a world-package format.

Future UX:

``` text
Where do you want to ride?

FROM: Bolzano
TO:   Bormio

[ Scenic ]
[ Avoid highways ]
[ Prefer mountain roads ]

START RIDE
```

Pipeline:

``` text
route
  |
world-package availability
  |
required geographic chunks
  |
stream
  |
ride
```

A later project phase can investigate whether world generation happens:

1.  entirely ahead of time;
2.  partially in-browser;
3.  through an optional external preprocessing service.

GitHub Pages compatibility should remain the default.

------------------------------------------------------------------------

# 37. Things Explicitly Out of Scope for MVP

Do not implement initially:

-   multiplayer;
-   accounts;
-   cloud saves;
-   racing;
-   achievements;
-   traffic;
-   pedestrians;
-   damage model;
-   crash ragdolls;
-   VR;
-   global arbitrary route generation;
-   photorealistic buildings;
-   advanced tire temperature;
-   motorcycle customization;
-   multiple motorcycles;
-   AI vehicles;
-   fuel management.

Every one of these can become a distraction before the core riding loop
works.

------------------------------------------------------------------------

# 38. Testing Strategy

## Unit tests

Test:

-   torque interpolation;
-   gearbox ratios;
-   clutch model;
-   drag;
-   gradient force;
-   coordinate conversion;
-   friction limits;
-   weight transfer;
-   world manifest parsing.

## Deterministic simulation tests

Given identical:

-   initial state;
-   control sequence;
-   timestep;

the simulation should produce approximately identical output.

## Physics scenarios

Create automated scenarios:

``` text
0–100 km/h acceleration
100–0 km/h braking
constant-radius corner
5% climb
10% climb
coast-down
clutch launch
engine stall
gear-shift acceleration
```

## Geographic validation

Validate Stelvio:

-   route shape;
-   route length;
-   altitude profile;
-   summit elevation;
-   hairpin positions;
-   gradient distribution.

The goal is not centimeter-level surveying accuracy. The goal is
geographically faithful riding geometry.

------------------------------------------------------------------------

# 39. Telemetry / Developer HUD

Add a development-only HUD early.

Display:

``` text
FPS
physics Hz
speed
RPM
gear
throttle
clutch
front brake
rear brake
roll
pitch
steering angle
front load
rear load
front grip %
rear grip %
gradient
current chunk
draw calls
triangles
```

This will save enormous debugging time.

Production builds can hide it behind a developer flag.

------------------------------------------------------------------------

# 40. Definition of "Simulation-Like"

OpenRide does not need to reproduce every aspect of professional
motorcycle simulation.

The intended realism hierarchy is:

### Must feel real

-   acceleration;
-   braking;
-   gears;
-   clutch;
-   RPM;
-   gradient;
-   lean;
-   steering response;
-   weight transfer;
-   finite tire grip;
-   speed perception.

### Should feel real

-   suspension;
-   engine braking;
-   ABS;
-   traction control;
-   surface grip;
-   aerodynamic resistance;
-   countersteering.

### Can initially be approximated

-   tire deformation;
-   chassis flex;
-   gyroscopic wheel effects;
-   exact suspension linkage;
-   detailed rider biomechanics;
-   tire temperature;
-   aerodynamic turbulence.

------------------------------------------------------------------------

# 41. Recommended First Development Sequence

Do not begin with maps.

Build this:

``` text
STEP 1
GitHub Pages
    ↓
STEP 2
Three.js
    ↓
STEP 3
Rapier
    ↓
STEP 4
motorcycle on flat plane
    ↓
STEP 5
engine + gearbox + clutch
    ↓
STEP 6
rider + lean + steering
    ↓
STEP 7
gamepad
    ↓
STEP 8
rideable test circuit
```

Only when the motorcycle is enjoyable:

``` text
STEP 9
OSM
    ↓
STEP 10
DEM
    ↓
STEP 11
Stelvio road
    ↓
STEP 12
Stelvio terrain
    ↓
STEP 13
cockpit
    ↓
STEP 14
audio
```

This isolates the two hardest problems:

**motorcycle simulation** and **geographic world generation**.

Trying to solve them simultaneously will make debugging unnecessarily
difficult.

------------------------------------------------------------------------

# 42. MVP Release Target

## OpenRide v0.1 --- Stelvio

Features:

-   static GitHub Pages deployment;
-   one real-world route;
-   real road geometry;
-   real elevation;
-   basic mountain terrain;
-   adventure motorcycle;
-   first-person cockpit;
-   manual six-speed gearbox;
-   clutch;
-   front/rear brakes;
-   dynamic lean;
-   countersteering approximation;
-   rider balance controller;
-   aerodynamic drag;
-   gradient physics;
-   weight transfer;
-   finite tire grip;
-   ABS;
-   traction control;
-   keyboard;
-   gamepad;
-   procedural engine sound;
-   wind noise;
-   developer telemetry.

The release question is simple:

> Is riding Stelvio already enjoyable enough that you want to do another
> run?

If not, do not add another map.

Improve the motorcycle.

------------------------------------------------------------------------

# 43. Post-MVP Roadmap

After Stelvio works:

``` text
v0.2
multiple Alpine routes

v0.3
world streaming improvements

v0.4
rain + wet grip

v0.5
gravel / off-road

v0.6
route selection

v0.7
larger geographic regions

v0.8
traffic prototype

v0.9
advanced motorcycle dynamics

v1.0
OpenRide touring platform
```

Potential iconic route packs:

-   Dolomites;
-   Grossglockner;
-   Transfăgărășan;
-   Scottish Highlands;
-   Iceland;
-   Norwegian fjords;
-   Tuscany;
-   Pyrenees.

------------------------------------------------------------------------

# 44. Architectural Rule for Coding Agents

Every implementation milestone should satisfy:

1.  one conceptual responsibility;
2.  typecheck passes;
3.  tests pass;
4.  production build passes;
5.  GitHub Pages deployment remains valid;
6.  no unnecessary backend dependency is introduced;
7.  no subsequent milestone is implemented prematurely.

If a milestone requires changing architecture, update this blueprint
before introducing a hidden workaround.

------------------------------------------------------------------------

# 45. Final Product Identity

OpenRide should not become a conventional racing game.

Its identity is:

> **The Earth is the map. The ride is the game.**

The long-term experience is opening a browser, choosing a road somewhere
in the world, putting on headphones, connecting a controller, and simply
riding.
