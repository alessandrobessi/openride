# AGENTS.md — OpenRide Coding Agent Instructions

## Purpose

This file defines mandatory implementation rules for any coding agent working on **OpenRide**.

OpenRide is a browser-based, first-person, simulation-oriented motorcycle touring experience using real-world geographic data.

The canonical MVP is **Passo dello Stelvio**.

The production deployment target is **GitHub Pages**.

The architectural baseline is:

- TypeScript
- SvelteKit
- pnpm
- static SvelteKit adapter
- Three.js
- Rapier 3D / WASM
- OpenStreetMap-derived road data
- DEM-derived terrain data
- Web Audio API
- Gamepad API

The project must remain deployable as a static site throughout development.

---

# 1. Primary Rule

Implement **one milestone at a time**.

Do not anticipate future milestones by adding speculative systems, abstractions, dependencies, UI, or architecture unless they are strictly required by the current milestone.

Before changing code:

1. identify the current milestone;
2. read the relevant project docs;
3. inspect the existing implementation;
4. define the smallest change that satisfies the milestone;
5. implement it;
6. test it;
7. verify GitHub Pages compatibility;
8. stop.

---

# 2. Sources of Truth

Read these files before architectural work:

1. `OPENRIDE-BLUEPRINT.md`
2. `MOTORCYCLE-PHYSICS.md`
3. `AGENTS.md`

Priority in case of conflict:

```text
explicit user instruction
    >
AGENTS.md
    >
OPENRIDE-BLUEPRINT.md
    >
MOTORCYCLE-PHYSICS.md
    >
existing implementation
```

If code conflicts with the architecture, fix the code rather than silently changing the intended architecture.

If a change to the architecture is truly necessary, update the relevant documentation in the same commit.

---

# 3. Deployment Constraint: GitHub Pages

GitHub Pages is a hard requirement.

Production must not require:

- a persistent Node server;
- server-side rendering;
- a runtime database;
- runtime secrets;
- server-only filesystem access;
- backend GIS conversion;
- private API keys embedded in the browser;
- mandatory serverless functions.

Use SvelteKit static output.

All production URLs must respect the configured application base path.

Never assume that the application is hosted at `/`.

The project must support deployments such as:

```text
https://username.github.io/openride/
```

Therefore avoid hardcoded asset references such as:

```text
/worlds/stelvio/manifest.json
```

when the correct runtime URL may need to include:

```text
/openride/worlds/stelvio/manifest.json
```

Use framework-supported base-path utilities or centralized URL helpers.

---

# 4. Static World Data

Real-world geographic preprocessing should happen offline.

The intended pipeline is:

```text
OSM + DEM
   |
offline world builder
   |
optimized static world assets
   |
GitHub Pages
   |
browser
```

Do not make raw OSM parsing or heavy DEM transformation part of the browser runtime unless explicitly requested by a later milestone.

Prepared world data belongs under a static world package structure such as:

```text
static/worlds/stelvio/
├── manifest.json
├── roads/
├── terrain/
└── chunks/
```

---

# 5. Simulation Architecture

Keep these concerns separate:

```text
user input
   |
virtual rider
   |
motorcycle simulation
   |
physics engine
   |
render interpolation
   |
Three.js
```

Do not make rendering code the authoritative source of physics state.

Do not directly manipulate Three.js object transforms to simulate motion.

Physics state is authoritative.

Rendering follows simulation state.

---

# 6. Fixed Timestep

Motorcycle simulation must use a fixed timestep.

Never make core physics behavior directly dependent on `requestAnimationFrame` delta time.

Preferred structure:

```typescript
accumulator += frameDelta;

while (accumulator >= FIXED_DT) {
  sampleControls();
  updateRider(FIXED_DT);
  updateMotorcycle(FIXED_DT);
  physicsStep(FIXED_DT);

  accumulator -= FIXED_DT;
}

render(interpolateState());
```

Initial candidates:

```text
1 / 60 s
1 / 120 s
```

Use the lowest frequency that remains sufficiently stable and realistic.

Measure before increasing cost.

---

# 7. Units

Use SI units internally.

Mandatory conventions:

```text
distance      meters
time          seconds
velocity      meters/second
acceleration  meters/second²
mass          kilograms
force         newtons
torque        newton-meters
angles        radians
angular speed radians/second
power         watts
pressure      pascals if needed
```

Human-readable units such as:

- km/h
- RPM
- degrees

belong at presentation boundaries only.

Avoid mixed-unit calculations.

---

# 8. Coordinate Convention

World-space convention:

```text
X = east
Y = up
Z = north
```

Local simulation coordinates are metric.

Geographic latitude/longitude must be converted into a local metric reference frame before entering the simulation.

Never use latitude/longitude directly in rigid-body calculations.

---

# 9. Motorcycle State

Maintain explicit simulation state.

Do not scatter authoritative values across unrelated Svelte stores, Three.js objects, Rapier handles, and UI state.

The conceptual state includes:

```typescript
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

The actual implementation may evolve, but the architecture must keep simulation state coherent and inspectable.

---

# 10. Configuration

Physical parameters belong in configuration objects.

Do not hide magic constants inside simulation update functions.

Example categories:

```text
mass
wheelbase
CG position
wheel radii
drag coefficient
frontal area
rolling resistance
gear ratios
final-drive ratio
engine inertia
idle RPM
redline RPM
torque curve
suspension stiffness
suspension damping
tire friction
steering limits
rider-controller gains
```

Prefer:

```typescript
motorcycle.config.dragCoefficient
```

over:

```typescript
const force = 0.62 * ...
```

with unexplained literals.

---

# 11. Motorcycle Identity

Do not present the default motorcycle as an exact BMW R 1200 GS simulation unless licensed assets and verified manufacturer-specific parameters are intentionally introduced.

Use a fictional name such as:

```text
Adventure 1200
```

The design may be inspired by the large adventure-bike class.

Avoid BMW logos and proprietary visual assets in the default repository.

---

# 12. Physics Philosophy

The simulation should be physically motivated but development must be staged.

Do not jump immediately to:

- Pacejka tire models;
- flexible chassis simulation;
- tire carcass deformation;
- high-order rider biomechanics;
- tire temperature;
- CFD-level aerodynamics.

First make these systems correct enough to produce believable behavior:

1. longitudinal dynamics;
2. engine;
3. gearbox;
4. clutch;
5. braking;
6. rider balance;
7. lean;
8. steering;
9. countersteering;
10. finite tire grip;
11. weight transfer;
12. suspension.

---

# 13. No Fake Physics Shortcuts

Avoid these implementations in production simulation code:

```typescript
speed += throttle;
```

```typescript
yaw += steeringInput;
```

```typescript
roll = steeringInput * maxLean;
```

```typescript
bike.position.y = terrainHeight;
```

These are acceptable only in temporary prototypes before the relevant physics milestone.

Once the proper milestone is implemented, remove the shortcut.

---

# 14. Virtual Rider

The user does not directly command raw vehicle state.

The intended architecture is:

```text
input
  |
rider intention
  |
virtual rider controller
  |
steering torque / stabilization / lean control
  |
motorcycle
```

The virtual rider may provide:

- balance correction;
- countersteering;
- target lean control;
- steering damping;
- low-speed stabilization;
- optional body-shift approximation.

Keep assists distinguishable from physical motorcycle dynamics.

Do not bake stabilization invisibly into unrelated force calculations.

---

# 15. User Input

Keyboard is supported, but gamepad is the preferred simulation input.

Analog controls should support:

- dead zones;
- response curves;
- clamping;
- calibration;
- configurable sensitivity.

Normalize inputs to predictable ranges:

```text
throttle     0..1
clutch       0..1
front brake  0..1
rear brake   0..1
steering    -1..1
```

Do not let device-specific values leak into simulation code.

---

# 16. Three.js Responsibilities

Three.js is responsible for:

- scene rendering;
- visual meshes;
- lighting;
- camera;
- materials;
- terrain visualization;
- cockpit visualization;
- debugging overlays where appropriate.

Three.js must not become the physics engine.

Keep rendering adapters between simulation state and scene objects.

---

# 17. Rapier Responsibilities

Rapier should handle appropriate rigid-body and collision responsibilities:

- chassis rigid body;
- contacts;
- collision geometry;
- terrain collision;
- constraints where useful.

Do not assume that every motorcycle subsystem must be delegated to generic rigid-body primitives.

Motorcycle-specific systems such as:

- engine torque;
- clutch;
- gearbox;
- tire force calculation;
- rider control;

belong in OpenRide simulation code.

---

# 18. Road Geometry

Roads should originate from real geographic data.

For Stelvio:

- preserve recognizable hairpins;
- preserve meaningful gradients;
- preserve route shape;
- avoid over-smoothing;
- avoid inventing nonexistent geometry.

Separate:

```text
road visual mesh
road collision mesh
road semantic centerline
```

when useful.

---

# 19. Elevation

Elevation must be derived from a real DEM source.

Never hand-author terrain and claim it represents the real road.

The road elevation profile should be validated against the source data.

If smoothing is needed:

- smooth noise;
- preserve gradient structure;
- preserve summit/start elevation relationships;
- avoid flattening hairpins.

---

# 20. World Streaming

Design static world packages so large areas can later be streamed.

Avoid assumptions such as:

```text
all world geometry is loaded forever
```

Maintain a world manager abstraction that can eventually support:

- load;
- activate;
- deactivate;
- unload;
- cache;
- near/far levels.

Do not implement global streaming before the milestone requires it.

---

# 21. Audio

Audio state should be driven by simulation state.

Examples:

```text
engine RPM
engine load
throttle
vehicle speed
road surface
suspension events
```

Avoid one looping engine sample whose playback speed is the entire engine model.

Layered procedural or parameterized audio is preferred.

Do not block physics progress on final-quality audio assets.

---

# 22. Camera

The camera should reflect:

- roll;
- pitch;
- suspension;
- rider/head stabilization;
- subtle vibration.

Do not rigidly attach camera orientation to raw chassis orientation without filtering.

Do not overuse camera shake.

Simulation readability and comfort matter more than exaggerated motion.

---

# 23. Performance

Initial target:

```text
60 FPS rendering
stable fixed-step physics
```

Profile before optimizing.

Track at least:

- frame time;
- physics time;
- draw calls;
- triangle count;
- loaded chunks;
- texture memory where feasible;
- garbage collection spikes.

Avoid per-frame allocations in hot simulation loops where practical.

Prefer object reuse for frequently updated vectors and temporary values.

---

# 24. Developer Telemetry

Maintain a developer telemetry mode.

Useful values:

```text
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
front normal load
rear normal load
front grip usage
rear grip usage
road gradient
current chunk
draw calls
triangle count
```

Telemetry should read simulation state rather than recreate calculations independently.

---

# 25. Testing

Every physics subsystem that can be tested without rendering should have automated tests.

Priority scenarios:

```text
0–100 km/h acceleration
100–0 km/h braking
constant-radius corner
coast-down
5% climb
10% climb
clutch launch
engine stall
gear shift
friction-limit test
weight-transfer test
coordinate conversion
world manifest parsing
```

Prefer deterministic tests.

Given:

- identical initial state;
- identical input sequence;
- identical timestep;

simulation output should remain approximately reproducible.

---

# 26. Numerical Safety

Guard against:

- NaN;
- Infinity;
- division by zero;
- negative mass;
- invalid gear indices;
- invalid torque interpolation;
- impossible friction coefficients;
- runaway integration;
- unbounded steering values;
- extreme frame deltas after tab suspension.

Clamp or reject invalid input at boundaries.

Do not silently hide numerical explosions by resetting arbitrary state unless the behavior is explicitly a recovery feature.

---

# 27. Error Handling

Errors should be actionable.

Bad:

```text
Failed to load.
```

Better:

```text
Failed to load Stelvio world manifest:
expected /openride/worlds/stelvio/manifest.json
```

For development utilities and preprocessing scripts, fail fast.

For runtime optional visual systems, degrade gracefully where possible.

---

# 28. Dependencies

Before adding a dependency, ask:

1. Is this needed for the current milestone?
2. Can the existing stack do it adequately?
3. Does it work in a static browser deployment?
4. Does it materially affect bundle size?
5. Is it maintained?
6. Does its license fit the project?

Do not add large frameworks for small utilities.

---

# 29. Svelte Usage

Use Svelte for:

- menus;
- settings;
- route selection;
- developer UI;
- lifecycle integration.

Do not represent high-frequency physics state as hundreds of independently reactive UI stores.

The simulation loop should remain an explicit system.

Expose sampled state to UI at an appropriate frequency.

---

# 30. Code Organization

Prefer small domain modules.

Example:

```text
simulation/
├── engine/
├── drivetrain/
├── motorcycle/
├── rider/
├── suspension/
├── tires/
└── assists/
```

Avoid a single `Motorcycle.ts` containing thousands of lines.

Avoid premature deep abstraction.

Organize by physical responsibility.

---

# 31. Naming

Use domain language.

Good:

```text
engineTorqueNm
frontNormalLoadN
vehicleSpeedMps
wheelAngularVelocityRadS
roadGradientRad
```

Avoid vague names:

```text
value
power2
factor
thing
temp
data2
```

Unit-bearing suffixes are encouraged where ambiguity exists.

---

# 32. Comments

Comments should explain:

- physical assumptions;
- approximations;
- non-obvious numerical decisions;
- references to equations from `MOTORCYCLE-PHYSICS.md`;
- why a simplification is acceptable.

Do not comment obvious syntax.

Good:

```typescript
// First-order relaxation prevents the virtual rider from applying
// unrealistically instantaneous steering torque.
```

Bad:

```typescript
// Set throttle.
state.throttle = throttle;
```

---

# 33. Documentation Discipline

When implementing a milestone:

- update docs if behavior changes;
- record deliberate approximations;
- document new configuration parameters;
- remove obsolete TODOs.

Do not let implementation silently diverge from the blueprint.

---

# 34. Commit Discipline

One conceptual milestone per commit where practical.

Preferred messages:

```text
feat: add fixed-step Rapier physics
feat: implement parametric motorcycle engine
feat: add clutch gearbox and final drive
feat: add virtual rider balance controller
feat: model countersteering behavior
feat: add Stelvio elevation preprocessing
```

Avoid:

```text
update stuff
various fixes
work in progress
```

---

# 35. Completion Checklist

Before declaring a milestone complete:

```text
[ ] milestone acceptance criteria satisfied
[ ] TypeScript compiles
[ ] lint passes
[ ] relevant tests pass
[ ] production build succeeds
[ ] GitHub Pages base path remains valid
[ ] no backend dependency introduced
[ ] no obvious NaN/Infinity path
[ ] telemetry updated if relevant
[ ] documentation updated if relevant
[ ] no unrelated future milestone implemented
```

---

# 36. What Not to Build Yet

Unless explicitly requested by the current roadmap milestone, do not add:

- multiplayer;
- authentication;
- user accounts;
- cloud saves;
- leaderboards;
- racing;
- missions;
- achievements;
- traffic AI;
- pedestrians;
- crash ragdolls;
- VR;
- global route generation;
- weather;
- damage;
- fuel economy;
- motorcycle customization;
- multiple motorcycles;
- advanced tire temperature;
- online backend services.

---

# 37. Product Identity

OpenRide is not primarily a racing game.

The intended experience is:

> Choose a real road, enter the cockpit, and ride.

Prioritize authenticity of motion, geography, sound, and machine response over conventional game mechanics.

The core principle is:

> **The Earth is the map. The ride is the game.**
