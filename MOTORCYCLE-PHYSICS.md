# MOTORCYCLE-PHYSICS.md — OpenRide Motorcycle Dynamics Specification

## 1. Purpose

This document defines the staged physical model for the OpenRide motorcycle simulation.

The goal is not to reproduce every nonlinear phenomenon of real motorcycle dynamics from the first version.

The goal is to build a model that is:

- physically motivated;
- numerically stable;
- simulation-like;
- understandable;
- testable;
- tunable;
- performant in a browser;
- progressively refinable.

The canonical vehicle is a fictional **Adventure 1200**: a large adventure motorcycle inspired by the general physical class of machines such as the BMW GS family, without claiming exact manufacturer-specific fidelity.

---

# 2. Simulation Goals

The player should perceive physically meaningful differences in:

- throttle;
- engine RPM;
- gear;
- clutch;
- engine braking;
- gradient;
- aerodynamic drag;
- front brake;
- rear brake;
- weight transfer;
- steering;
- lean;
- corner radius;
- road speed;
- tire grip;
- road surface;
- suspension.

The simulation should support:

- low-speed riding;
- mountain hairpins;
- acceleration out of corners;
- manual gear shifts;
- clutch launches;
- uphill riding;
- downhill engine braking;
- hard braking;
- progressive loss of grip.

---

# 3. Non-Goals for Initial Versions

The first model does not require:

- full multibody rider biomechanics;
- flexible-frame dynamics;
- tire carcass deformation;
- Pacejka Magic Formula;
- detailed gyroscopic precession;
- tire temperature;
- tire pressure dynamics;
- chain elasticity;
- CFD aerodynamics;
- fuel slosh;
- suspension linkage geometry at manufacturer fidelity;
- deformable terrain.

These may be added later if they materially improve perceived realism.

---

# 4. Units

Use SI units internally.

```text
length        m
time          s
mass          kg
speed         m/s
acceleration  m/s²
force         N
torque        N·m
angle         rad
angular rate  rad/s
power         W
```

Conversions:

\[
v_{km/h}=3.6v_{m/s}
\]

\[
\omega_{rpm}=\omega_{rad/s}\frac{60}{2\pi}
\]

---

# 5. Coordinate Frames

## 5.1 World frame

Use:

```text
X = east
Y = up
Z = north
```

## 5.2 Motorcycle body frame

Recommended convention:

```text
+x = motorcycle right
+y = motorcycle up
+z = motorcycle forward
```

Be consistent throughout the codebase.

Document every transformation.

## 5.3 Orientation

Represent vehicle orientation internally with a quaternion.

Derive yaw, pitch, and roll for:

- telemetry;
- rider control;
- UI;
- diagnostics.

Do not integrate Euler angles independently as the authoritative orientation state.

---

# 6. Core State

A useful conceptual state is:

```typescript
interface MotorcycleState {
  positionWorldM: Vec3;
  linearVelocityWorldMps: Vec3;
  angularVelocityBodyRadS: Vec3;
  orientationWorld: Quaternion;

  steeringAngleRad: number;
  steeringRateRadS: number;

  frontWheelOmegaRadS: number;
  rearWheelOmegaRadS: number;

  engineOmegaRadS: number;
  engineRPM: number;

  gear: number;

  throttle: number;
  clutch: number;

  frontBrake: number;
  rearBrake: number;

  frontSuspensionCompressionM: number;
  rearSuspensionCompressionM: number;

  frontNormalLoadN: number;
  rearNormalLoadN: number;

  frontSlipRatio: number;
  rearSlipRatio: number;

  frontSlipAngleRad: number;
  rearSlipAngleRad: number;
}
```

Some values may be derived rather than stored.

Avoid storing two authoritative forms of the same quantity.

---

# 7. Configuration

Conceptual parameters:

```typescript
interface MotorcycleConfig {
  bikeMassKg: number;
  riderMassKg: number;

  wheelbaseM: number;
  cgHeightM: number;
  cgFromRearAxleM: number;

  frontWheelRadiusM: number;
  rearWheelRadiusM: number;

  yawInertiaKgM2: number;
  rollInertiaKgM2: number;
  pitchInertiaKgM2: number;

  frontalAreaM2: number;
  dragCoefficient: number;
  rollingResistanceCoefficient: number;

  airDensityKgM3: number;

  maxSteeringAngleRad: number;

  idleRPM: number;
  redlineRPM: number;
  engineInertiaKgM2: number;

  primaryRatio: number;
  gearRatios: number[];
  finalDriveRatio: number;
  drivetrainEfficiency: number;

  frontBrakeMaxTorqueNm: number;
  rearBrakeMaxTorqueNm: number;

  frontSpringRateNPerM: number;
  rearSpringRateNPerM: number;

  frontDampingNsPerM: number;
  rearDampingNsPerM: number;

  tireMuDry: number;
}
```

Realistic values should be introduced from documented references or calibrated deliberately.

Do not pretend guessed values are exact manufacturer values.

---

# 8. Total Mass

\[
m=m_{bike}+m_{rider}
\]

If rider mass is later movable, total CG changes accordingly.

Initial implementation may model rider and motorcycle as one combined rigid body.

---

# 9. Gravity

World gravity:

\[
\mathbf{g}=
\begin{bmatrix}
0\\
-g\\
0
\end{bmatrix}
\]

with:

\[
g \approx 9.80665 \;m/s^2
\]

Rapier may apply gravity to the chassis rigid body.

Motorcycle-specific force models must not accidentally apply gravity a second time.

---

# 10. Road Gradient

Let road tangent direction have pitch angle \(\theta\).

The gravitational component opposing uphill motion is:

\[
F_{grade}=mg\sin(\theta)
\]

For small slopes:

\[
\sin(\theta)\approx \tan(\theta)\approx grade
\]

where a 10% gradient is approximately:

\[
grade=0.10
\]

Do not confuse percentage grade with degrees.

---

# 11. Aerodynamic Drag

Use:

\[
F_d=
\frac12
\rho C_d A v^2
\]

where:

- \(\rho\) = air density;
- \(C_d\) = drag coefficient;
- \(A\) = frontal area;
- \(v\) = air-relative forward speed.

Direction opposes relative airflow.

Initial implementation may assume zero wind:

\[
v_{air}=v_{vehicle}
\]

Later:

\[
\mathbf{v}_{air}=
\mathbf{v}_{vehicle}-\mathbf{v}_{wind}
\]

Aerodynamic drag becomes especially important at high speed because it scales with \(v^2\).

---

# 12. Rolling Resistance

Approximate:

\[
F_{rr}=C_{rr}F_z
\]

On level ground:

\[
F_{rr}\approx C_{rr}mg
\]

On a slope:

\[
F_{rr}\approx C_{rr}mg\cos(\theta)
\]

The force opposes direction of travel.

---

# 13. Basic Longitudinal Equation

Along the motorcycle forward direction:

\[
m a_x =
F_{drive}
-
F_{brake}
-
F_{drag}
-
F_{rolling}
-
F_{grade}
\]

This is the foundational longitudinal model.

Do not directly assign speed from throttle.

---

# 14. Engine Angular Speed

\[
RPM=
\omega_e\frac{60}{2\pi}
\]

where \(\omega_e\) is engine angular speed in rad/s.

Clamp or physically constrain RPM to a safe range.

Engine speed below idle may:

- trigger stall;
- be supported temporarily by idle control;
- be coupled through clutch slip.

---

# 15. Torque Curve

Represent full-throttle engine torque using sampled points:

```typescript
interface TorquePoint {
  rpm: number;
  torqueNm: number;
}
```

Interpolate linearly initially.

\[
T_{max}=f(RPM)
\]

Requested positive engine torque:

\[
T_e=
u_t \cdot T_{max}(RPM)
\]

where:

\[
0\le u_t\le1
\]

Later, throttle response may include nonlinear mapping and intake dynamics.

---

# 16. Engine Inertia

Model finite RPM response:

\[
I_e\dot{\omega}_e=
T_{combustion}
-
T_{load}
-
T_{friction}
\]

where:

- \(I_e\) = equivalent engine rotational inertia;
- \(T_{combustion}\) = generated torque;
- \(T_{load}\) = clutch/drivetrain load;
- \(T_{friction}\) = internal friction and pumping loss.

This prevents unrealistically instant RPM changes.

---

# 17. Engine Friction and Engine Braking

A simple model:

\[
T_{friction}=
T_0+k_\omega\omega_e
\]

When throttle is near zero, engine braking should produce negative drivetrain torque.

A simple initial engine-braking term:

\[
T_{eb}=
-k_{eb}(1-u_t)g(RPM)
\]

where \(g(RPM)\) increases with engine speed.

Tune by behavior, not arbitrary visual feel.

---

# 18. Rev Limiter

If:

\[
RPM \ge RPM_{redline}
\]

reduce or cut combustion torque.

Prefer a limiter that pulses/cuts torque rather than instantly clamping angular speed, because hard clamping can create nonphysical energy behavior.

---

# 19. Gearbox

Let:

\[
G_i
\]

be gear ratio for selected gear \(i\).

Total ratio:

\[
R=
R_{primary}
G_i
R_{final}
\]

Wheel torque ignoring clutch slip:

\[
T_w=
T_e R \eta
\]

where \(\eta\) is drivetrain efficiency.

---

# 20. Neutral

In neutral:

\[
R=0
\]

The engine is mechanically decoupled from the rear wheel.

Engine RPM evolves from:

- throttle torque;
- engine inertia;
- friction;
- limiter.

---

# 21. Clutch

Define clutch control:

```text
0 = fully disengaged
1 = fully engaged
```

Let:

\[
u_c\in[0,1]
\]

A simple clutch torque capacity:

\[
T_{cap}=u_cT_{clutch,max}
\]

Compute relative rotational speed:

\[
\Delta\omega=
\omega_e-\omega_{drivetrain}
\]

Then clutch transfer torque may be approximated by:

\[
T_c=
clamp(k_c\Delta\omega,-T_{cap},T_{cap})
\]

This provides controlled slip.

Later use a smoother friction curve if needed.

---

# 22. Drivetrain Speed Coupling

When engaged:

\[
\omega_{drivetrain}
=
\omega_r R
\]

where \(\omega_r\) is rear-wheel angular velocity.

The clutch determines how strongly engine and drivetrain speeds converge.

---

# 23. Stalling

An engine may stall when:

```text
RPM < stall threshold
AND
clutch transfer load is high
AND
combustion torque cannot recover RPM
```

Do not stall from RPM alone if the bike is in neutral.

Initial condition:

\[
RPM_{stall}<RPM_{idle}
\]

When stalled:

```text
combustion torque = 0
```

Restarting can initially be handled through a dedicated command.

---

# 24. Rear-Wheel Drive Force

If rear-wheel torque is:

\[
T_r
\]

then ideal ground force is:

\[
F_{drive,ideal}=
\frac{T_r}{r_r}
\]

where \(r_r\) is rear-wheel radius.

Actual force is limited by available tire grip.

---

# 25. Brake Torque

Front:

\[
T_{bf}=u_{bf}T_{bf,max}
\]

Rear:

\[
T_{br}=u_{br}T_{br,max}
\]

with inputs:

\[
0\le u_{bf},u_{br}\le1
\]

Ideal longitudinal braking force:

\[
F_b=\frac{T_b}{r}
\]

Again, actual force is grip-limited.

---

# 26. Static Axle Loads

Let:

- \(L\) = wheelbase;
- \(a\) = horizontal distance from rear axle to CG;
- \(b=L-a\).

Static loads:

\[
F_{zf,0}=mg\frac{a}{L}
\]

\[
F_{zr,0}=mg\frac{b}{L}
\]

and:

\[
F_{zf,0}+F_{zr,0}=mg
\]

---

# 27. Longitudinal Weight Transfer

Approximate load transfer:

\[
\Delta F_z=
\frac{m a_x h}{L}
\]

Sign convention must be documented.

Under acceleration, rear load increases.

Under braking, front load increases.

One useful implementation:

\[
F_{zf}=F_{zf,0}-\frac{m a_x h}{L}
\]

\[
F_{zr}=F_{zr,0}+\frac{m a_x h}{L}
\]

if positive \(a_x\) means forward acceleration.

Thus braking has \(a_x<0\), increasing front load.

Clamp loads to physically meaningful ranges.

---

# 28. Gradient and Axle Loads

For significant road pitch, static load distribution is modified.

The MVP may initially use level-road transfer equations while applying gradient longitudinally.

Later include road-normal gravity components.

Document this approximation.

---

# 29. Tire Friction Limit

Basic per-tire friction capacity:

\[
F_{max}=\mu F_z
\]

where:

- \(\mu\) = tire/road friction coefficient;
- \(F_z\) = normal load.

This already allows load transfer to alter available traction.

---

# 30. Combined Tire Forces

A simple friction-circle constraint:

\[
\left(\frac{F_x}{\mu F_z}\right)^2+
\left(\frac{F_y}{\mu F_z}\right)^2
\le1
\]

Equivalent:

\[
\sqrt{F_x^2+F_y^2}\le\mu F_z
\]

This means the same grip budget cannot be used fully for braking and cornering simultaneously.

This is essential for simulation-like behavior.

---

# 31. Friction Ellipse

Later, allow longitudinal and lateral limits to differ:

\[
\left(\frac{F_x}{\mu_x F_z}\right)^2+
\left(\frac{F_y}{\mu_y F_z}\right)^2
\le1
\]

This can better approximate motorcycle tire behavior.

Not required initially.

---

# 32. Slip Ratio

For longitudinal tire dynamics:

\[
\kappa=
\frac{\omega r-v_x}
{\max(|v_x|,\epsilon)}
\]

where:

- \(\omega\) = wheel angular velocity;
- \(r\) = wheel radius;
- \(v_x\) = contact-patch longitudinal speed;
- \(\epsilon\) prevents division by zero.

Interpretation:

```text
κ ≈ 0       rolling
κ > 0       drive slip
κ < 0       braking slip
```

At very low speed use a dedicated low-speed formulation to prevent numerical instability.

---

# 33. Slip Angle

Approximate tire slip angle:

\[
\alpha=
atan2(v_y,|v_x|+\epsilon)-\delta
\]

where:

- \(v_y\) = lateral velocity at contact patch;
- \(v_x\) = longitudinal velocity;
- \(\delta\) = wheel steering angle.

Sign convention must be verified in tests.

---

# 34. Initial Tire Force Model

Before a sophisticated tire model, use linear force buildup with saturation:

\[
F_x=C_\kappa\kappa
\]

\[
F_y=-C_\alpha\alpha
\]

then clamp combined forces to the friction circle.

This provides:

- progressive tire response;
- finite grip;
- actual slip variables;
- predictable tuning.

---

# 35. Relaxation

Instantaneous tire-force changes can feel unstable.

A first-order relaxation model:

\[
\dot{F}=
\frac{F_{target}-F}{\tau}
\]

where \(\tau\) is a short relaxation time.

Use only if needed for stability and realism.

Document any artificial damping.

---

# 36. Wheel Angular Dynamics

For each wheel:

\[
I_w\dot{\omega}=
T_{applied}
-
T_{brake}
-
F_xr
\]

Rear wheel includes drive torque.

Front wheel generally does not.

This allows:

- wheel lock;
- wheelspin;
- correct relation between tire force and wheel angular speed.

---

# 37. Lean Geometry

For steady-state cornering:

\[
\tan(\phi)=\frac{v^2}{rg}
\]

or using lateral acceleration:

\[
\tan(\phi)=\frac{a_y}{g}
\]

Thus:

\[
\phi_{eq}=
atan\left(\frac{a_y}{g}\right)
\]

This is a useful equilibrium target, not a rule to forcibly assign roll.

---

# 38. Why Lean Must Be Dynamic

Do not implement:

```typescript
roll = steeringInput * maxLean;
```

A motorcycle's roll should emerge over time.

Conceptually:

\[
I_\phi\ddot{\phi}
=
M_{steering}
+
M_{gravity}
+
M_{tire}
+
M_{rider}
+
M_{damping}
\]

The precise high-fidelity equations are complex.

OpenRide should begin with a reduced-order model that retains:

- roll inertia;
- rider steering control;
- lateral acceleration;
- restoring/control moments;
- damping.

---

# 39. Reduced Roll Model

A practical intermediate model:

\[
I_\phi\ddot{\phi}
=
K_a(\phi_{target}-\phi)
-
C_\phi\dot{\phi}
+
M_{disturbance}
\]

where:

\[
\phi_{target}
=
atan\left(\frac{a_{y,target}}{g}\right)
\]

This is not the final motorcycle physics model.

It is a virtual-rider-assisted roll model that preserves dynamic lean instead of directly assigning angle.

---

# 40. Steering and Curvature

Simple bicycle-model relationship:

\[
\kappa_{path}\approx\frac{\tan(\delta)}{L}
\]

so:

\[
r\approx\frac{L}{\tan(\delta)}
\]

This works as a low-order geometric relation.

At motorcycle speeds, steering behavior must be mediated by lean and virtual rider control rather than used as direct arcade yaw.

---

# 41. Yaw Rate Approximation

At low/moderate slip:

\[
\dot{\psi}
\approx
\frac{v}{L}\tan(\delta)
\]

This can be useful for validation.

Do not directly impose this yaw rate once dynamic tire forces are authoritative.

---

# 42. Countersteering

To initiate a left turn at speed:

1. rider applies brief steering torque toward the right;
2. contact forces generate roll moment;
3. motorcycle begins leaning left;
4. steering evolves into the turn;
5. steady lean and curvature are established.

The user should command turn intention:

\[
u_s\in[-1,1]
\]

not raw yaw rate.

---

# 43. Virtual Rider Steering Controller

A staged controller can use:

```text
user turn intention
   |
desired lateral acceleration
   |
desired lean
   |
lean error
   |
steering torque
```

Example:

\[
a_{y,target}
=
u_s a_{y,max}(v)
\]

\[
\phi_{target}
=
atan\left(\frac{a_{y,target}}{g}\right)
\]

Lean error:

\[
e_\phi=
\phi_{target}-\phi
\]

Steering torque:

\[
T_s=
K_pe_\phi
+
K_d(-\dot{\phi})
+
T_{ff}
\]

where \(T_{ff}\) may provide countersteering feed-forward.

---

# 44. Countersteering Feed-Forward

A practical approximation:

\[
T_{ff}
=
-K_{cs}u_s f(v)
\]

for turn initiation.

The sign and duration must be validated carefully.

The term should diminish once lean is established.

A transient form can depend on:

- steering-input change;
- lean error;
- speed.

Example conceptual behavior:

```text
new left input
   |
brief right steering torque
   |
left roll begins
   |
controller transitions toward turn maintenance
```

---

# 45. Low-Speed Control

Countersteering behavior should reduce at low speed.

Create a speed blend:

\[
w(v)=smoothstep(v_0,v_1,v)
\]

Then combine:

```text
low-speed direct steering behavior
high-speed lean/countersteer behavior
```

Example:

\[
T=
(1-w)T_{low}
+
wT_{high}
\]

This avoids unusable parking-speed behavior.

---

# 46. Rider Balance Assist

At low speed, a pure physical two-wheel model is difficult to stabilize through keyboard/gamepad input.

Use an explicit assist.

Example roll stabilization:

\[
T_{balance}
=
-K_{p,b}\phi
-
K_{d,b}\dot{\phi}
\]

Scale assistance with speed:

```text
high at near-zero speed
lower at normal riding speed
```

Do not hide this inside gravity or collision calculations.

It is a virtual-rider force.

---

# 47. Rider Body Lean

Later, rider body shift can modify effective CG.

Simplified:

\[
y_{CG,eff}
\]

and lateral offset:

\[
x_{CG,eff}
\]

may change with rider state.

Not necessary for initial Stelvio MVP.

---

# 48. Suspension

For one-dimensional suspension compression \(x\):

\[
F_s=kx
\]

Damping:

\[
F_d=cv
\]

Combined force opposing compression:

\[
F=
kx+cv
\]

Use separate front and rear parameters.

---

# 49. Suspension Limits

Real suspension has finite travel.

Clamp geometry at:

```text
0 <= compression <= max travel
```

Do not simply clamp force without handling contact/bump-stop behavior.

A later model may add nonlinear bump stops.

---

# 50. Pitch

Braking and acceleration should produce pitch motion.

Reduced pitch model:

\[
I_\theta\ddot{\theta}
=
M_{longitudinal}
-
K_\theta\theta
-
C_\theta\dot{\theta}
\]

Suspension load differences should eventually provide the physical pitch response.

Avoid visual-only nose dive once suspension physics exists.

---

# 51. Road Contact

Each wheel needs a contact model providing:

- contact point;
- surface normal;
- normal load;
- longitudinal tangent;
- lateral tangent;
- road material.

Rapier may provide geometric contact information.

OpenRide computes motorcycle-specific tire forces from that state.

---

# 52. Road Surface Frame

At each wheel contact, construct an orthonormal basis:

```text
n = surface normal
t = projected wheel-forward tangent
l = lateral tangent
```

Forces:

\[
\mathbf{F}
=
F_x\mathbf{t}
+
F_y\mathbf{l}
+
F_z\mathbf{n}
\]

This allows road banking and slope to influence physics naturally later.

---

# 53. Banked Roads

If road surface normal is tilted, gravitational and tire-force equilibrium changes automatically when using the road-contact frame.

Do not assume every corner lies on a horizontal plane.

Initial Stelvio meshes may have little or simplified banking, but architecture should not forbid it.

---

# 54. Surface Friction

Each road surface can define:

```typescript
interface SurfacePhysics {
  muLongitudinal: number;
  muLateral: number;
  rollingResistance: number;
  roughness: number;
}
```

Initial categories:

```text
asphalt
wet asphalt
gravel
dirt
```

Stelvio MVP begins with dry asphalt.

---

# 55. Wet Grip

Later:

\[
\mu_{wet}
<
\mu_{dry}
\]

Wetness can interpolate:

\[
\mu=
(1-w)\mu_{dry}
+
w\mu_{wet}
\]

where:

\[
0\le w\le1
\]

Weather must affect physics, not merely shaders.

---

# 56. ABS

ABS should reduce brake torque when excessive negative slip is detected.

Conceptual threshold:

```text
if brakingSlip < -threshold:
    reduce brake pressure
else:
    recover brake pressure
```

A simple control form:

\[
u_{brake,eff}
=
u_{brake}m_{ABS}
\]

where \(m_{ABS}\in[0,1]\).

Avoid instantaneous binary switching if it causes chatter.

---

# 57. Traction Control

Traction control reduces engine torque when rear-wheel drive slip exceeds target.

Example:

\[
e_\kappa=
\kappa_r-\kappa_{target}
\]

If:

\[
e_\kappa>0
\]

reduce requested engine torque.

The controller should act on torque, not directly on vehicle speed.

---

# 58. Wheelie Control

A wheelie condition can be approximated by very low front normal load:

\[
F_{zf}\rightarrow0
\]

Wheelie control may reduce drive torque when front load approaches a threshold.

Do not artificially force front wheel position downward.

---

# 59. Stoppie / Rear Lift

Under extreme braking:

\[
F_{zr}\rightarrow0
\]

Later physics can permit rear-wheel lift.

Initial assist may constrain unstable conditions.

---

# 60. Rider Assists vs Motorcycle Systems

Keep separate modules:

```text
motorcycle physics
ABS
traction control
wheelie control
rider balance
countersteering controller
```

This makes assist levels tunable and allows advanced users to disable them.

---

# 61. Camera Dynamics

Camera is not a physics input.

It consumes motorcycle/rider state.

Conceptually:

\[
T_{camera}
=
T_{bike}
T_{headOffset}
T_{stabilization}
\]

Head stabilization should partially filter roll/pitch while preserving enough motion for speed and immersion.

Do not feed camera stabilization back into vehicle dynamics.

---

# 62. Numerical Integration

Use a fixed timestep.

Candidate:

\[
\Delta t=\frac1{120}s
\]

or:

\[
\Delta t=\frac1{60}s
\]

Start with 120 Hz if tire/steering stability requires it, but measure browser cost.

Never use arbitrary frame delta for core simulation.

---

# 63. Semi-Implicit Euler

For custom scalar dynamics, semi-implicit Euler is often a good baseline:

\[
v_{n+1}
=
v_n+a_n\Delta t
\]

\[
x_{n+1}
=
x_n+v_{n+1}\Delta t
\]

It is generally more stable for physical systems than explicit Euler.

Use Rapier's integrator for rigid-body state under Rapier control.

Do not integrate the same state twice.

---

# 64. Interpolation

Rendering may interpolate between previous and current simulation transforms.

\[
\alpha=
\frac{accumulator}{\Delta t}
\]

Then:

\[
x_{render}
=
(1-\alpha)x_{prev}
+
\alpha x_{curr}
\]

Use quaternion slerp for orientation.

This provides smooth rendering without variable-step physics.

---

# 65. Frame Suspension

Browsers may pause background tabs.

Clamp incoming render-frame delta.

Do not attempt to simulate several seconds of missed real time in one frame.

Example policy:

```text
frame delta max = 100–250 ms
```

Exact choice should be tested.

---

# 66. Determinism

Full bitwise determinism is not required across all browsers.

But tests should aim for repeatable results under:

- identical build;
- identical timestep;
- identical initial state;
- identical input.

Use tolerances in physics assertions.

---

# 67. Baseline Adventure 1200 Parameters

Use these only as placeholders until calibrated.

Do not claim manufacturer accuracy.

Example initial ranges:

```text
bike mass             240–270 kg
rider mass             70–90 kg
wheelbase            1.45–1.55 m
CG height             0.55–0.75 m
front wheel radius    ~0.33 m
rear wheel radius     ~0.31 m
drag coefficient      ~0.5–0.8
frontal area          ~0.6–0.9 m²
```

Exact defaults should be selected experimentally and documented in the config file.

---

# 68. Engine Calibration

Choose a plausible large twin-cylinder torque curve.

Desired qualitative behavior:

- stable idle;
- strong low/midrange;
- broad torque;
- moderate redline;
- noticeable engine braking.

Do not optimize engine power to match a target top speed by arbitrary force scaling.

Use:

- torque;
- gearing;
- drag;
- rolling resistance;

and let top speed emerge.

---

# 69. Acceleration Validation

Create test:

```text
flat road
dry asphalt
no wind
full throttle
manual ideal shifts
```

Measure:

- 0–50 km/h;
- 0–100 km/h;
- 0–130 km/h;
- gear shift points;
- RPM.

The point is consistency and plausibility, not manufacturer benchmarking initially.

---

# 70. Coast-Down Validation

At several initial speeds:

```text
throttle = 0
clutch disengaged
flat road
```

Measure deceleration from:

- aerodynamic drag;
- rolling resistance.

This isolates resistance parameters from engine braking.

---

# 71. Engine-Braking Validation

Repeat coast-down:

```text
clutch engaged
gear selected
throttle = 0
```

Compare to clutch-disengaged coast-down.

This verifies engine braking separately.

---

# 72. Gradient Validation

Test steady climbs:

```text
0%
5%
10%
15%
```

Validate:

- reduced acceleration;
- lower equilibrium speed;
- increased throttle requirement;
- gear sensitivity.

This is crucial for Stelvio.

---

# 73. Brake Validation

Test:

```text
100 km/h -> 0
```

with:

- front brake only;
- rear brake only;
- both;
- ABS enabled;
- ABS disabled.

Measure:

- stopping distance;
- wheel slip;
- axle load;
- pitch;
- lock tendency.

---

# 74. Constant-Radius Corner Test

Construct a flat circular track.

At several speeds, compare measured steady lean with:

\[
\phi_{expected}
=
atan\left(\frac{v^2}{rg}\right)
\]

Measured lean need not match perfectly, but it should converge plausibly.

---

# 75. Steering Step Test

At constant speed:

```text
steering intention = 0
then step to +0.5
```

Inspect:

- initial steering response;
- countersteering transient;
- roll rate;
- lean angle;
- yaw rate;
- settling.

This is one of the most useful diagnostics for rider-controller tuning.

---

# 76. Friction-Limit Test

At fixed normal load:

increase combined:

- braking;
- cornering;

until:

\[
\sqrt{F_x^2+F_y^2}
=
\mu F_z
\]

Verify saturation occurs smoothly.

---

# 77. Weight-Transfer Test

On flat road:

- apply known acceleration;
- compare calculated axle loads to equation;
- apply known braking;
- verify opposite load transfer.

Check:

\[
F_{zf}+F_{zr}
\approx
mg
\]

for the simplified level-road case.

---

# 78. Low-Speed Stability Test

At:

```text
2 km/h
5 km/h
10 km/h
```

verify the virtual rider can stabilize the motorcycle without violent oscillation.

Balance assist should decrease progressively with speed.

---

# 79. Hairpin Test

Create a synthetic hairpin before Stelvio integration.

Validate:

- braking into corner;
- downshift;
- low-speed steering;
- lean transition;
- uphill corner exit;
- throttle pickup.

This bridges physics work and the real Stelvio use case.

---

# 80. Simulation Update Order

Recommended conceptual order per fixed step:

```text
1. sample normalized controls
2. update rider intention
3. update assists
4. update engine combustion request
5. update clutch / gearbox coupling
6. compute wheel torques
7. query wheel-road contacts
8. compute suspension forces
9. compute axle loads
10. compute tire slips
11. compute tire forces
12. apply aerodynamic / rolling forces
13. apply rider steering/balance torques
14. apply forces/torques to Rapier bodies
15. step Rapier
16. update derived state
17. update telemetry
```

Some coupling may require iterative refinement later.

Keep the order explicit.

---

# 81. Force Ownership

Every force should have one owner.

Example:

```text
gravity             Rapier world
aerodynamic drag    OpenRide aero module
rolling resistance  OpenRide tire/surface module
engine drive        drivetrain/tire module
braking force       brake/tire module
suspension           suspension module
rider steering       rider controller
```

Avoid two modules applying the same physical effect.

---

# 82. Energy Sanity Checks

Watch for impossible energy creation.

Examples:

- clutch engagement should not increase total rotational energy arbitrarily;
- braking should remove energy;
- drag should remove energy;
- rolling resistance should remove energy;
- gravity should exchange kinetic/potential energy consistently;
- engine adds energy through fuel/combustion abstraction.

Unexpected acceleration with zero throttle on flat ground is a bug unless produced by stored rotational/potential energy.

---

# 83. Telemetry

Expose at least:

```text
speed m/s
speed km/h
engine RPM
gear
engine torque
rear-wheel torque
throttle
clutch
front brake
rear brake
road gradient
roll angle
roll rate
steering angle
yaw rate
front load
rear load
front slip ratio
rear slip ratio
front slip angle
rear slip angle
front grip utilization
rear grip utilization
```

Telemetry is essential for tuning.

---

# 84. Grip Utilization

Useful derived metric:

\[
U=
\frac{\sqrt{F_x^2+F_y^2}}{\mu F_z}
\]

Interpretation:

```text
U < 1    below limit
U = 1    at friction limit
U > 1    requested force exceeds available grip
```

Actual applied force should be saturated so the physical result remains at or below the allowed limit.

---

# 85. Simulation Difficulty Profiles

Later expose:

## Touring

```text
strong balance assist
ABS on
TC on
wheelie control on
auto-clutch optional
```

## Simulation

```text
reduced balance assist
ABS configurable
TC configurable
manual clutch
manual gearbox
```

## Expert

```text
minimal stabilization
ABS optional/off
TC optional/off
manual clutch
manual gearbox
```

The physical model stays shared.

Only control assistance changes.

---

# 86. Staged Implementation

## Stage A — Longitudinal motorcycle

Implement:

- mass;
- gravity;
- drag;
- rolling resistance;
- rear-wheel drive;
- braking.

No sophisticated lean.

Success:

```text
bike accelerates and stops through forces
```

---

## Stage B — Engine and drivetrain

Implement:

- RPM;
- torque curve;
- engine inertia;
- gearbox;
- clutch;
- stalling;
- engine braking.

Success:

```text
player can launch and shift manually
```

---

## Stage C — Rideable two-wheel dynamics

Implement:

- roll;
- steering;
- rider stabilization;
- dynamic lean.

Success:

```text
player can circulate a simple track
```

---

## Stage D — Countersteering

Implement:

- speed blending;
- steering torque;
- turn-intention controller;
- countersteer transient.

Success:

```text
high-speed turning no longer behaves like direct yaw steering
```

---

## Stage E — Tires and load transfer

Implement:

- wheel slip;
- tire forces;
- friction circle;
- axle loads;
- ABS;
- TC.

Success:

```text
grip becomes finite and braking/cornering interact
```

---

## Stage F — Suspension

Implement:

- front/rear spring-damper;
- pitch response;
- road roughness input;
- suspension telemetry.

Success:

```text
road and braking loads visibly and physically affect chassis motion
```

---

## Stage G — Stelvio calibration

Use real:

- gradient;
- hairpin radius;
- road surface;
- elevation.

Tune the rider controller and vehicle config only after generic synthetic tests pass.

Do not compensate for broken generic physics using Stelvio-specific hacks.

---

# 87. Acceptable Approximations

Initial versions may deliberately approximate:

- gyro effects;
- steering geometry;
- trail;
- fork kinematics;
- load transfer on strongly banked roads;
- rider body movement;
- tire relaxation;
- nonlinear tire curves.

Every approximation should be:

- documented;
- isolated;
- replaceable;
- testable.

---

# 88. Unacceptable Shortcuts

Do not use the following once the corresponding physical milestone exists:

```typescript
state.speed = throttle * MAX_SPEED;
```

```typescript
state.yaw += steering * dt;
```

```typescript
state.roll = steering * MAX_LEAN;
```

```typescript
state.engineRPM = speed * gearFactor;
```

```typescript
state.position.y = roadHeight;
```

Simulation-like behavior must emerge from physical state and control loops.

---

# 89. Definition of Success

The physics is good enough for the first OpenRide release when a rider can:

1. launch using clutch and throttle;
2. feel gearing;
3. feel engine braking;
4. feel Stelvio gradient;
5. brake progressively;
6. downshift into hairpins;
7. initiate lean naturally;
8. experience speed-dependent steering;
9. use front/rear grip meaningfully;
10. accelerate uphill out of a corner;
11. recognize that the machine has mass and inertia;
12. complete the climb without the bike feeling like a car or an animated camera.

The final standard is perceptual:

> The motorcycle should feel like a machine being ridden, not a viewport being moved.
