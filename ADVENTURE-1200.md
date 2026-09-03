# Adventure 1200 --- Numerical Simulation Parameters

**Project:** OpenRide\
**Vehicle:** Adventure 1200\
**Purpose:** Initial numerical configuration for the OpenRide motorcycle
simulation\
**Status:** Baseline calibration configuration; values are tunable and
do not claim exact manufacturer-specific fidelity.

## 1. Design Intent

The Adventure 1200 is a fictional large adventure motorcycle inspired by
the general physical class of large-displacement adventure-touring
motorcycles.

The goal is not to reproduce a BMW R 1200 GS exactly. The goal is to
establish a physically plausible, internally coherent baseline that
produces believable:

-   acceleration;
-   braking;
-   engine response;
-   gearing;
-   clutch behavior;
-   weight transfer;
-   lean;
-   tire grip;
-   suspension response;
-   mountain-road handling.

Tune physical parameters rather than hardcoding desired outcomes.

------------------------------------------------------------------------

## 2. Reference TypeScript Configuration

``` ts
export const ADVENTURE_1200 = {
  identity: {
    id: 'adventure-1200',
    name: 'Adventure 1200'
  },

  mass: {
    bikeKg: 250,
    riderKg: 80,
    totalKg: 330
  },

  geometry: {
    wheelbaseM: 1.52,

    // Measured from rear-wheel contact point toward front wheel.
    cgFromRearAxleM: 0.82,

    // Combined bike + rider center of gravity.
    cgHeightM: 0.67,

    frontWheelRadiusM: 0.345,
    rearWheelRadiusM: 0.315,

    frontSuspensionTravelM: 0.19,
    rearSuspensionTravelM: 0.20,

    maxSteeringAngleRad: 0.6109, // 35°
    maxLeanAngleRad: 0.8727      // 50°
  },

  inertia: {
    rollKgM2: 75,
    pitchKgM2: 145,
    yawKgM2: 180,

    engineKgM2: 0.18,

    frontWheelKgM2: 0.60,
    rearWheelKgM2: 0.75
  },

  engine: {
    displacementCc: 1200,

    idleRPM: 1150,
    stallRPM: 750,
    redlineRPM: 8500,
    limiterRPM: 8750,

    peakPowerKw: 92,
    peakPowerRPM: 7750,

    peakTorqueNm: 125,
    peakTorqueRPM: 6000,

    engineFrictionBaseNm: 5.0,
    engineFrictionPerRadS: 0.012,

    engineBrakeCoefficient: 0.075,

    throttleResponseTimeS: 0.10
  },

  torqueCurve: [
    { rpm: 1000, torqueNm: 75 },
    { rpm: 1500, torqueNm: 88 },
    { rpm: 2000, torqueNm: 98 },
    { rpm: 2500, torqueNm: 105 },
    { rpm: 3000, torqueNm: 110 },
    { rpm: 3500, torqueNm: 114 },
    { rpm: 4000, torqueNm: 117 },
    { rpm: 4500, torqueNm: 120 },
    { rpm: 5000, torqueNm: 122 },
    { rpm: 5500, torqueNm: 124 },
    { rpm: 6000, torqueNm: 125 },
    { rpm: 6500, torqueNm: 123 },
    { rpm: 7000, torqueNm: 119 },
    { rpm: 7500, torqueNm: 114 },
    { rpm: 8000, torqueNm: 106 },
    { rpm: 8500, torqueNm: 92 }
  ],

  drivetrain: {
    primaryRatio: 1.65,

    gearRatios: [
      0,    // neutral
      2.44, // 1st
      1.71, // 2nd
      1.30, // 3rd
      1.07, // 4th
      0.94, // 5th
      0.85  // 6th
    ],

    finalDriveRatio: 2.82,

    efficiency: 0.94,

    clutchMaxTorqueNm: 180,
    clutchStiffnessNmPerRadS: 12,

    shiftCutTimeS: 0.08
  },

  brakes: {
    frontMaxTorqueNm: 1600,
    rearMaxTorqueNm: 650,

    frontResponseTimeS: 0.05,
    rearResponseTimeS: 0.06
  },

  aero: {
    dragCoefficient: 0.62,
    frontalAreaM2: 0.72,
    airDensityKgM3: 1.225
  },

  rollingResistance: {
    asphalt: 0.015,
    gravel: 0.030,
    dirt: 0.045
  },

  tires: {
    dryAsphalt: {
      muLongitudinal: 1.15,
      muLateral: 1.10
    },

    wetAsphalt: {
      muLongitudinal: 0.78,
      muLateral: 0.72
    },

    gravel: {
      muLongitudinal: 0.62,
      muLateral: 0.55
    },

    dirt: {
      muLongitudinal: 0.50,
      muLateral: 0.45
    },

    frontCorneringStiffnessNPerRad: 42000,
    rearCorneringStiffnessNPerRad: 48000,

    frontLongitudinalStiffnessN: 38000,
    rearLongitudinalStiffnessN: 45000,

    relaxationTimeS: 0.035
  },

  suspension: {
    front: {
      springRateNPerM: 30000,
      dampingCompressionNsPerM: 3500,
      dampingReboundNsPerM: 5200,
      preloadM: 0.055
    },

    rear: {
      springRateNPerM: 45000,
      dampingCompressionNsPerM: 4200,
      dampingReboundNsPerM: 6500,
      preloadM: 0.060
    }
  },

  rider: {
    maxTargetLateralAccelerationMps2: 9.0,

    balance: {
      rollKp: 420,
      rollKd: 110,

      fullAssistBelowMps: 3,
      minimalAssistAboveMps: 12
    },

    steering: {
      leanKp: 65,
      leanKd: 18,

      countersteerGain: 18,

      lowSpeedTransitionStartMps: 3,
      lowSpeedTransitionEndMps: 10,

      maxSteeringTorqueNm: 35
    }
  },

  assists: {
    abs: {
      enabled: true,
      targetSlip: -0.14,
      activationSlip: -0.18,
      releaseRatePerS: 15,
      recoveryRatePerS: 8
    },

    tractionControl: {
      enabled: true,
      targetSlip: 0.10,
      activationSlip: 0.14,
      torqueReductionGain: 4.0
    },

    wheelieControl: {
      enabled: true,
      minimumFrontLoadFraction: 0.08
    }
  }
} as const;
```

------------------------------------------------------------------------

## 3. Mass and Geometry

  Parameter                   Baseline
  ------------------------- ----------
  Motorcycle mass               250 kg
  Rider mass                     80 kg
  Combined mass                 330 kg
  Wheelbase                     1.52 m
  CG from rear axle             0.82 m
  Combined CG height            0.67 m
  Front wheel radius           0.345 m
  Rear wheel radius            0.315 m
  Front suspension travel       0.19 m
  Rear suspension travel        0.20 m
  Maximum steering angle           35°
  Hard lean limit                  50°

The combined mass should make the motorcycle feel substantial without
making direction changes excessively sluggish.

The CG height is particularly important because it strongly influences:

-   longitudinal weight transfer;
-   braking behavior;
-   wheelie tendency;
-   chassis response;
-   perceived motorcycle height.

Recommended CG-height calibration sweep:

``` text
0.60 m
0.65 m
0.67 m  <- baseline
0.70 m
0.75 m
```

------------------------------------------------------------------------

## 4. Static Weight Distribution

Using:

\[ a = 0.82m \]

from the rear axle and:

\[ L = 1.52m \]

the front static fraction is approximately:

\[ `\frac{a}{L}`{=tex} = `\frac{0.82}{1.52}`{=tex} `\approx 0.539`{=tex}
\]

Therefore the initial static distribution is approximately:

``` text
Front: 54%
Rear:  46%
```

At 330 kg total mass:

``` text
front normal load ≈ 1745 N
rear normal load  ≈ 1492 N
```

This is intentionally a slightly front-biased baseline.

If testing makes the bike feel too nose-heavy, move the CG rearward to
approximately:

``` text
0.76–0.78 m from rear axle
```

Do not alter axle loads directly.

------------------------------------------------------------------------

## 5. Inertia

Initial reduced-order inertia parameters:

  Axis/component       Baseline
  ---------------- ------------
  Roll                 75 kg·m²
  Pitch               145 kg·m²
  Yaw                 180 kg·m²
  Engine             0.18 kg·m²
  Front wheel        0.60 kg·m²
  Rear wheel         0.75 kg·m²

These are calibration parameters, not claimed laboratory measurements.

`rollKgM2` is expected to require significant tuning once the virtual
rider controller exists.

Too little roll inertia makes the motorcycle snap unrealistically into
lean. Too much makes direction changes feel delayed and heavy.

------------------------------------------------------------------------

## 6. Engine

The baseline engine represents a broad-torque 1200 cc adventure-touring
engine.

  Parameter                      Baseline
  -------------------------- ------------
  Displacement                    1200 cc
  Idle                          1,150 RPM
  Stall threshold                 750 RPM
  Redline                       8,500 RPM
  Limiter                       8,750 RPM
  Nominal peak power                92 kW
  Nominal peak-power speed      7,750 RPM
  Peak torque                     125 N·m
  Peak-torque speed             6,000 RPM
  Engine inertia               0.18 kg·m²
  Throttle response time           0.10 s

The engine should emphasize low- and mid-range torque rather than
requiring superbike-like RPM.

------------------------------------------------------------------------

## 7. Torque Curve

``` text
RPM      Torque
1000      75 Nm
1500      88 Nm
2000      98 Nm
2500     105 Nm
3000     110 Nm
3500     114 Nm
4000     117 Nm
4500     120 Nm
5000     122 Nm
5500     124 Nm
6000     125 Nm
6500     123 Nm
7000     119 Nm
7500     114 Nm
8000     106 Nm
8500      92 Nm
```

The useful engine band should feel approximately:

``` text
2,500–7,000 RPM
```

This is especially important for Stelvio. The rider should be able to
exit a hairpin strongly without needing extreme RPM.

------------------------------------------------------------------------

## 8. Drivetrain

  Parameter                           Baseline
  --------------------------- ----------------
  Primary ratio                           1.65
  Final drive                             2.82
  Efficiency                               94%
  Maximum clutch torque                180 N·m
  Clutch stiffness              12 N·m/(rad/s)
  Shift torque-cut duration             0.08 s

Gear ratios:

``` text
Neutral  0
1st      2.44
2nd      1.71
3rd      1.30
4th      1.07
5th      0.94
6th      0.85
```

First-gear total reduction:

\[ R_1 = 1.65 `\times 2.44`{=tex} `\times 2.82`{=tex}
`\approx 11.35`{=tex} \]

At peak engine torque:

\[ T\_{wheel} `\approx
125`{=tex} `\times 11.35`{=tex} `\times 0.94`{=tex} `\approx
1334`{=tex} N`\cdot `{=tex}m \]

With a 0.315 m rear-wheel radius:

\[ F\_{ideal} = `\frac{1334}{0.315}`{=tex} `\approx
4235`{=tex} N \]

This is an ideal drivetrain request. Actual longitudinal force must
remain tire-grip limited.

------------------------------------------------------------------------

## 9. Aerodynamics

  Parameter               Baseline
  ------------------ -------------
  Drag coefficient            0.62
  Frontal area             0.72 m²
  Air density          1.225 kg/m³

Use:

\[ F_d = `\frac12`{=tex}`\rho `{=tex}C_d A v\^2 \]

Do not hardcode top speed.

Top speed must emerge from the equilibrium between available power and
resistive forces.

------------------------------------------------------------------------

## 10. Rolling Resistance

Initial coefficients:

``` text
dry asphalt  0.015
gravel       0.030
dirt         0.045
```

These should remain surface properties rather than motorcycle-specific
force constants.

------------------------------------------------------------------------

## 11. Tire Grip

Initial friction coefficients:

  Surface         Longitudinal μ   Lateral μ
  ------------- ---------------- -----------
  Dry asphalt               1.15        1.10
  Wet asphalt               0.78        0.72
  Gravel                    0.62        0.55
  Dirt                      0.50        0.45

Dry-asphalt total theoretical friction capacity on level ground is
approximately:

\[ F\_{max} `\approx
1.15`{=tex} `\times 330`{=tex} `\times 9.81`{=tex} `\approx
3720`{=tex} N \]

Because first-gear ideal drivetrain force can exceed this value,
wheelspin can emerge naturally under appropriate axle-load conditions.

Do not cap engine output merely to prevent wheelspin.

------------------------------------------------------------------------

## 12. Tire Stiffness

Initial values:

``` text
front cornering stiffness       42,000 N/rad
rear cornering stiffness        48,000 N/rad

front longitudinal stiffness    38,000 N
rear longitudinal stiffness     45,000 N

force relaxation time           0.035 s
```

These belong to the reduced-order tire model and are expected to require
calibration.

------------------------------------------------------------------------

## 13. Brakes

  Parameter                       Baseline
  ---------------------------- -----------
  Front maximum brake torque     1,600 N·m
  Rear maximum brake torque        650 N·m
  Front response time               0.05 s
  Rear response time                0.06 s

The system is deliberately front-biased.

Under strong braking, front load should rise and rear load should fall
naturally through the weight-transfer model.

------------------------------------------------------------------------

## 14. Weight Transfer Example

Use:

\[ `\Delta `{=tex}F_z = `\frac{mah}{L}`{=tex} \]

For:

``` text
m = 330 kg
a = -8 m/s²
h = 0.67 m
L = 1.52 m
```

the magnitude of load transfer is approximately:

\[ \|`\Delta `{=tex}F_z\| =
`\frac{330 \times 8 \times 0.67}{1.52}`{=tex} `\approx
1163`{=tex} N \]

Starting from the approximate static loads:

``` text
front ≈ 1745 N
rear  ≈ 1492 N
```

heavy braking gives roughly:

``` text
front ≈ 2908 N
rear  ≈ 329 N
```

This illustrates why the rear wheel becomes easy to lock during severe
braking and why the front brake dominates stopping performance.

------------------------------------------------------------------------

## 15. Suspension

### Front

``` text
spring rate            30,000 N/m
compression damping     3,500 N·s/m
rebound damping         5,200 N·s/m
preload                 0.055 m
travel                  0.190 m
```

### Rear

``` text
spring rate            45,000 N/m
compression damping     4,200 N·s/m
rebound damping         6,500 N·s/m
preload                 0.060 m
travel                  0.200 m
```

These are intentionally moderate adventure-bike values for the
reduced-order simulation.

Rebound damping is higher than compression damping to limit undesirable
oscillation after bumps.

------------------------------------------------------------------------

## 16. Virtual Rider Baseline

The virtual rider is not physically part of the motorcycle configuration
and should eventually be stored separately.

Initial target lateral acceleration:

``` text
9.0 m/s²
```

This corresponds to approximately:

``` text
0.92 g
```

before additional constraints.

### Balance controller

``` text
roll Kp                       420
roll Kd                       110
full balance assist below     3 m/s
minimal balance assist above 12 m/s
```

### Steering controller

``` text
lean Kp                       65
lean Kd                       18
countersteer gain             18
low-speed transition start     3 m/s
low-speed transition end      10 m/s
maximum steering torque       35 N·m
```

Approximate speed interpretation:

``` text
0–11 km/h       strong stabilization
11–36 km/h      blended behavior
>36 km/h        lean/countersteering dominates
```

These controller gains are expected to require substantial tuning.

------------------------------------------------------------------------

## 17. ABS

Initial ABS parameters:

``` text
target slip          -0.14
activation slip      -0.18
release rate          15 /s
recovery rate          8 /s
```

Interpretation:

``` text
approximately -14% slip  desired controlled braking region
approximately -18% slip  strong intervention threshold
```

ABS should modulate brake torque.

It must never directly modify motorcycle velocity.

------------------------------------------------------------------------

## 18. Traction Control

Initial TC parameters:

``` text
target rear slip          +0.10
activation rear slip      +0.14
torque reduction gain      4.0
```

TC acts by reducing requested engine torque.

It must never directly change vehicle speed or rear-wheel velocity.

------------------------------------------------------------------------

## 19. Wheelie Control

Initial threshold:

``` text
minimum front load fraction = 0.08
```

As front normal load approaches this threshold, wheelie control may
progressively reduce engine torque.

Do not force the front wheel toward the ground geometrically.

------------------------------------------------------------------------

## 20. Parameter Ownership

The final implementation should separate configuration into:

``` text
Adventure1200
│
├── PhysicalConfig
│   ├── geometry
│   ├── mass
│   ├── inertia
│   └── aero
│
├── PowertrainConfig
│   ├── engine
│   ├── torqueCurve
│   ├── gearbox
│   └── clutch
│
├── ChassisConfig
│   ├── tires
│   ├── brakes
│   └── suspension
│
└── RiderProfile
    ├── balance
    ├── steering
    ├── ABS
    └── TC
```

The virtual rider should not be permanently embedded inside the
motorcycle definition.

This enables combinations such as:

``` text
Adventure 1200 + Touring Rider
Adventure 1200 + Simulation Rider
Adventure 1200 + Expert Rider
```

while keeping the underlying machine identical.

------------------------------------------------------------------------

## 21. Initial Validation Targets

These are calibration targets, not hardcoded limits.

  Test                                   Initial target
  ----------------------------- -----------------------
  Idle                                      \~1,150 RPM
  Redline                                   \~8,500 RPM
  0--100 km/h                        roughly 3.5--4.5 s
  Emergent top speed              roughly 200--220 km/h
  Comfortable cruise                      100--130 km/h
  Hard braking                       roughly 8--10 m/s²
  Useful engine band                   2,500--7,000 RPM
  Typical hairpin gear                         1st--2nd
  Typical Stelvio climb                        2nd--4th
  Normal aggressive road lean                 \~40--45°
  Hard simulation lean limit                      \~50°

These outcomes must emerge from the physical model.

Never implement code such as:

``` ts
if (speed < 100) acceleration *= 0.7;
```

to force a desired acceleration result.

If acceleration, braking, or top speed is wrong, inspect the responsible
parameters.

------------------------------------------------------------------------

## 22. Calibration Order

Tune in this order:

``` text
1. mass and geometry
2. engine torque curve
3. drivetrain ratios
4. aerodynamic drag
5. rolling resistance
6. longitudinal tire grip
7. braking
8. CG and weight transfer
9. suspension
10. roll inertia
11. lateral tire behavior
12. virtual rider
13. countersteering
14. ABS / TC
```

Do not tune the rider controller to compensate for incorrect chassis
physics.

------------------------------------------------------------------------

## 23. Synthetic Validation Before Stelvio

Before calibrating on Passo dello Stelvio, require successful generic
tests:

``` text
flat-road acceleration
coast-down
engine-braking coast-down
5% climb
10% climb
15% climb
100–0 km/h braking
constant-radius corner
steering-step response
friction-limit test
weight-transfer test
low-speed balance
synthetic hairpin
```

Only then move to real Stelvio geometry.

Stelvio-specific hacks are prohibited.

------------------------------------------------------------------------

## 24. Core Calibration Principle

If the simulation produces an implausible outcome, change the physical
cause rather than the outcome.

For example, if top speed is too low, inspect:

``` text
engine power
gear ratios
drag coefficient
frontal area
rolling resistance
drivetrain efficiency
```

If turn-in is too slow, inspect:

``` text
roll inertia
steering torque
tire lateral stiffness
rider controller
CG
speed-dependent steering model
```

If braking is wrong, inspect:

``` text
brake torque
tire grip
weight transfer
CG height
wheel load
ABS behavior
```

The guiding rule is:

> **Tune parameters, never tune outcomes directly.**

------------------------------------------------------------------------

## 25. Definition of Success

The Adventure 1200 baseline is good enough when the player can:

1.  launch using throttle and clutch;
2.  feel the difference between gears;
3.  feel strong low/midrange torque;
4.  feel engine braking downhill;
5.  feel road gradient;
6.  brake progressively;
7.  feel front/rear load transfer;
8.  downshift for a hairpin;
9.  initiate lean naturally;
10. experience speed-dependent steering;
11. reach the grip limit under sufficiently aggressive inputs;
12. accelerate uphill out of a Stelvio hairpin.

The target sensation is:

> **A heavy, capable adventure motorcycle being physically ridden---not
> a camera being moved through a map.**
