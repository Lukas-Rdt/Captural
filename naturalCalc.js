/**
 * Compute a "naturalness" score (0-100) from session data.
 * Expects an object with at least:
 *  - puzzleTime (seconds)
 *  - objectTime (seconds)
 *  - puzzleErrors (integer)
 *  - objectAccuracy (0-100)
 * Returns { percent, components }
 */
export function computeNaturalness(session = {}) {
	const puzzleTime = Number(session.puzzleTime) || 0;
	const objectTime = Number(session.objectTime) || 0;
	const puzzleErrors = Number(session.puzzleErrors) || 0;
	const objectAccuracy = Math.max(0, Math.min(100, Number(session.objectAccuracy) || 0));

	// If the user didn't finish the flow, treat as minimal naturalness
	if (!session.passed && session.passed !== undefined) {
		return { percent: 0, components: { puzzleTime: 0, objectTime: 0, error: 0, accuracy: 0 } };
	}

	// Tunable human baseline parameters (seconds)
	// Puzzle: user set to ~2 minutes (120s) with wide std so duration has little influence
	const PUZZLE_MEAN = 120;
	const PUZZLE_STD = 60;
	// Object alignment is quick (seconds)
	const OBJECT_MEAN = 60;
	const OBJECT_STD = 30;

	// Fast-time threshold: very fast puzzle completions (<=20s) are suspicious
	const PUZZLE_FAST_THRESHOLD = 20;

	// Helper: asymmetric time score in [0,1]
	// - For times <= mean: use gaussian-ish curve (prefers near-mean)
	// - For times > mean: use a slow decay so long times don't drop score heavily
	// - Very fast times (below threshold) are additionally penalized
	function timeScore(t, mean, std, fastThreshold = null) {
		if (t <= 0) return 0;
		const d = t - mean;

		let base;
		if (t <= mean) {
			base = Math.exp(- (d * d) / (2 * std * std));
		} else {
			// slow, gentle decay: 1 / (1 + (d/std)) maps to (0,1]
			base = 1 / (1 + Math.abs(d) / Math.max(1, std));
		}

		if (fastThreshold && t < fastThreshold) {
			// strong penalty for extremely fast completions (likely automated)
			const factor = Math.pow(Math.max(0.01, t / fastThreshold), 0.5); // sqrt factor
			return base * factor;
		}
		return base;
	}

	const puzzleTimeScore = timeScore(puzzleTime, PUZZLE_MEAN, PUZZLE_STD, PUZZLE_FAST_THRESHOLD);

	// Object thresholds: consider ~60s typical, treat <10s as suspicious, and
	// mildly penalize very long times (>180s) to catch outliers.
	const OBJECT_FAST_THRESHOLD = 10;
	const OBJECT_LONG_THRESHOLD = 180; // seconds
	const OBJECT_LONG_DECAY = 120; // scale for long-time penalty

	let objectTimeScore = timeScore(objectTime, OBJECT_MEAN, OBJECT_STD, OBJECT_FAST_THRESHOLD);
	if (objectTime > OBJECT_LONG_THRESHOLD) {
		const extraFactor = 1 / (1 + (objectTime - OBJECT_LONG_THRESHOLD) / OBJECT_LONG_DECAY);
		objectTimeScore = objectTimeScore * extraFactor;
	}

	// Errors reduce confidence. Make small/medium error counts (3-10) fairly tolerable,
	// but make very large counts (near MAX_PUZZLE_ERRORS) heavily penalized.
	const MAX_PUZZLE_ERRORS = 20; // allow up to 20 before zeroing
	const errRatio = Math.min(puzzleErrors, MAX_PUZZLE_ERRORS) / MAX_PUZZLE_ERRORS;
	const ERROR_EXPONENT = 2.5; // >1: small errors cheap, large errors costly
	const errorScore = Math.max(0, 1 - Math.pow(errRatio, ERROR_EXPONENT));

	const accuracyScore = objectAccuracy / 100; // already 0..1

	// Combine components with weights: time should have little influence, accuracy moderate.
	// Errors (errorScore) will be the main gating factor multiplicatively.
	const combinedRaw = (puzzleTimeScore * 0.12) + (objectTimeScore * 0.08) + (accuracyScore * 0.80);

	// Apply error penalty multiplicatively (strong effect for many errors)
	const combined = combinedRaw * errorScore;

	const percent = Math.round(Math.max(0, Math.min(1, combined)) * 100);

	return {
		percent,
		components: {
			puzzleTime: Number(puzzleTimeScore.toFixed(3)),
			objectTime: Number(objectTimeScore.toFixed(3)),
			error: Number(errorScore.toFixed(3)),
			accuracy: Number(accuracyScore.toFixed(3)),
			raw: Number(combinedRaw.toFixed(3)),
		}
	};
}

export default computeNaturalness;

