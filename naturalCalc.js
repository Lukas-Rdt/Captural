export function computeNaturalness(session = {}) {
	const puzzleTime = Number(session.puzzleTime) || 0;
	const objectTime = Number(session.objectTime) || 0;
	const puzzleErrors = Number(session.puzzleErrors) || 0;
	const objectAccuracy = Math.max(0, Math.min(100, Number(session.objectAccuracy) || 0));

	if (!session.passed && session.passed !== undefined) {
		return { percent: 0, components: { puzzleTime: 0, objectTime: 0, error: 0, accuracy: 0 } };
	}

	// baseline parameters (in seconds)
	const PUZZLE_MEAN = 120;
	const PUZZLE_STD = 60;

	const OBJECT_MEAN = 60;
	const OBJECT_STD = 30;

	// fast-time threshold -> under 20 secs probably bot
	const PUZZLE_FAST_THRESHOLD = 20;

	// gaussian-ish curve (prefers near-mean)
	// slow times minor decay
	// very fast times penalized
	function timeScore(t, mean, std, fastThreshold = null) {
		if (t <= 0) return 0;
		const d = t - mean;

		let base;
		if (t <= mean) {
			base = Math.exp(- (d * d) / (2 * std * std));
		} else {
			base = 1 / (1 + Math.abs(d) / Math.max(1, std));
		}

		if (fastThreshold && t < fastThreshold) {
			const factor = Math.pow(Math.max(0.01, t / fastThreshold), 0.5);
			return base * factor;
		}
		return base;
	}

	const puzzleTimeScore = timeScore(puzzleTime, PUZZLE_MEAN, PUZZLE_STD, PUZZLE_FAST_THRESHOLD);

	// obejct orientation thresholds
	const OBJECT_FAST_THRESHOLD = 10;
	const OBJECT_LONG_THRESHOLD = 180;
	const OBJECT_LONG_DECAY = 120;

	let objectTimeScore = timeScore(objectTime, OBJECT_MEAN, OBJECT_STD, OBJECT_FAST_THRESHOLD);
	if (objectTime > OBJECT_LONG_THRESHOLD) {
		const extraFactor = 1 / (1 + (objectTime - OBJECT_LONG_THRESHOLD) / OBJECT_LONG_DECAY);
		objectTimeScore = objectTimeScore * extraFactor;
	}

	// errors reduce score. 3-10 errors okay,
	// but many errors heavily penalized.
	const MAX_PUZZLE_ERRORS = 20; 
	const errRatio = Math.min(puzzleErrors, MAX_PUZZLE_ERRORS) / MAX_PUZZLE_ERRORS;
	const ERROR_EXPONENT = 2.5;
	const errorScore = Math.max(0, 1 - Math.pow(errRatio, ERROR_EXPONENT));

	const accuracyScore = objectAccuracy / 100;

	const combinedRaw = (puzzleTimeScore * 0.12) + (objectTimeScore * 0.08) + (accuracyScore * 0.80);

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

