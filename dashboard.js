/* const performanceData = {
  puzzleTime: 8.4, // Time for puzzle (seconds)
  objectTime: 5.2, // Time for object alignment (seconds)
  totalTime: 13.6, // Total time (seconds)
  puzzleErrors: 2, // Errors in puzzle task
  objectErrors: 1, // Errors in object alignment
  puzzleAccuracy: 87, // Accuracy percentage for puzzle
  objectAccuracy: 94, // Accuracy percentage for object
  passed: true, // Captcha passed aka user verified?
}; */

export function updateDashboard(data) {
  const circumference = 2 * Math.PI * 54; // 339.292

  // Update status badge
  const badge = document.getElementById("statusBadge");
  const statusText = document.getElementById("statusText");
  if (data.passed) {
    badge.className = "status-badge passed";
    statusText.textContent = "VERIFIED";
  } else {
    badge.className = "status-badge failed";
    statusText.textContent = "FAILED";
  }

  // Animate circular progress
  setTimeout(() => {
    animateCircle(
      "puzzleCircle",
      "puzzleValue",
      data.puzzleTime,
      15,
      circumference,
    );
  }, 300);

  setTimeout(() => {
    animateCircle(
      "objectCircle",
      "objectValue",
      data.objectTime,
      15,
      circumference,
    );
  }, 500);

  setTimeout(() => {
    animateCircle(
      "totalCircle",
      "totalValue",
      data.totalTime,
      30,
      circumference,
    );
  }, 700);

  // Update metrics
  setTimeout(() => {
    const avgAccuracy = Math.round(
      (data.puzzleAccuracy + data.objectAccuracy) / 2,
    );
    document.getElementById("accuracyValue").textContent = avgAccuracy + "%";

    const totalErrors = data.puzzleErrors + data.objectErrors;
    document.getElementById("errorsValue").textContent = totalErrors;
    document.getElementById("errorsSub").textContent =
      `${data.puzzleErrors} puzzle · ${data.objectErrors} alignment`;
  }, 900);

  // Update phase bars
  setTimeout(() => {
    updatePhaseBar(
      "puzzleBar",
      "puzzleTime",
      "puzzleErrors",
      data.puzzleTime,
      15,
      data.puzzleErrors,
    );
  }, 1200);

  setTimeout(() => {
    updatePhaseBar(
      "objectBar",
      "objectTime",
      "objectErrors",
      data.objectTime,
      15,
      data.objectErrors,
    );
  }, 1400);
}

function animateCircle(circleId, valueId, value, max, circumference) {
  const circle = document.getElementById(circleId);
  const valueEl = document.getElementById(valueId);
  const percentage = Math.min((value / max) * 100, 100);
  const offset = circumference - (percentage / 100) * circumference;

  circle.style.strokeDashoffset = offset;

  // Animate the number
  let current = 0;
  const duration = 1500;
  const startTime = Date.now();

  function animate() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    current = value * eased;
    valueEl.textContent = current.toFixed(1);

    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  }
  animate();
}

function updatePhaseBar(barId, timeId, errorsId, time, maxTime, errors) {
  const bar = document.getElementById(barId);
  const percentage = (time / maxTime) * 100;

  // Set color based on percentage
  if (percentage < 40) {
    bar.className = "phase-bar-fill fast";
  } else if (percentage < 70) {
    bar.className = "phase-bar-fill medium";
  } else {
    bar.className = "phase-bar-fill slow";
  }

  bar.style.width = percentage + "%";
  document.getElementById(timeId).textContent = time.toFixed(1) + "s";
  document.getElementById(errorsId).textContent =
    errors + (errors === 1 ? " error" : " errors");
}
