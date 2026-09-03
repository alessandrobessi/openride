import type { MotorcycleConfig } from '../config';

/**
 * Baseline numerical configuration for the fictional **Adventure 1200**, a large
 * adventure-touring motorcycle. Values are transcribed from ADVENTURE-1200.md
 * (§2 reference configuration) and regrouped per its §20 ownership tree.
 *
 * These are a physically plausible, internally coherent starting point — not
 * manufacturer data (AGENTS.md §11). Calibrate parameters, never outcomes
 * (ADVENTURE-1200.md §24). Recommended tuning order: ADVENTURE-1200.md §22.
 */
export const ADVENTURE_1200: MotorcycleConfig = {
	id: 'adventure-1200',
	name: 'Adventure 1200',

	physical: {
		mass: {
			bikeKg: 250,
			riderKg: 80,
			totalKg: 330
		},
		geometry: {
			wheelbaseM: 1.52,
			cgFromRearAxleM: 0.82, // ~54% front static bias (a/L)
			cgHeightM: 0.67, // dominant lever for weight transfer; sweep 0.60–0.75
			frontWheelRadiusM: 0.345,
			rearWheelRadiusM: 0.315,
			frontSuspensionTravelM: 0.19,
			rearSuspensionTravelM: 0.2,
			maxSteeringAngleRad: 0.6109, // 35°
			maxLeanAngleRad: 0.8727 // 50°
		},
		inertia: {
			// Reduced-order calibration values, not lab measurements
			// (ADVENTURE-1200.md §5). rollKgM2 expects significant tuning once the
			// virtual rider exists (M7+).
			rollKgM2: 75,
			pitchKgM2: 145,
			yawKgM2: 180,
			engineKgM2: 0.18,
			frontWheelKgM2: 0.6,
			rearWheelKgM2: 0.75
		},
		aero: {
			dragCoefficient: 0.62,
			frontalAreaM2: 0.72,
			airDensityKgM3: 1.225
		}
	},

	powertrain: {
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
			throttleResponseTimeS: 0.1
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
		gearbox: {
			primaryRatio: 1.65,
			gearRatios: [0, 2.44, 1.71, 1.3, 1.07, 0.94, 0.85],
			finalDriveRatio: 2.82,
			efficiency: 0.94,
			shiftCutTimeS: 0.08
		},
		clutch: {
			maxTorqueNm: 180,
			stiffnessNmPerRadS: 12
		}
	},

	chassis: {
		suspension: {
			// Rebound damping > compression damping to limit post-bump oscillation
			// (ADVENTURE-1200.md §15).
			front: {
				springRateNPerM: 30000,
				dampingCompressionNsPerM: 3500,
				dampingReboundNsPerM: 5200,
				preloadM: 0.055,
				travelM: 0.19
			},
			rear: {
				springRateNPerM: 45000,
				dampingCompressionNsPerM: 4200,
				dampingReboundNsPerM: 6500,
				preloadM: 0.06,
				travelM: 0.2
			}
		},
		brakes: {
			frontMaxTorqueNm: 1600, // deliberately front-biased
			rearMaxTorqueNm: 650,
			frontResponseTimeS: 0.05,
			rearResponseTimeS: 0.06
		},
		tires: {
			frontCorneringStiffnessNPerRad: 42000,
			rearCorneringStiffnessNPerRad: 48000,
			frontLongitudinalStiffnessN: 38000,
			rearLongitudinalStiffnessN: 45000,
			relaxationTimeS: 0.035
		}
	}
};
