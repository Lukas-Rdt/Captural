import computeNaturalness from "./naturalCalc.js";

export function updateDashboard(data) {
  const circumference = 2 * Math.PI * 54; // 339.292

  const badge = document.getElementById("statusBadge");
  const statusText = document.getElementById("statusText");
  if (data.passed) {
    badge.className = "status-badge passed";
    statusText.textContent = "VERIFIED";
  } else {
    badge.className = "status-badge failed";
    statusText.textContent = "FAILED";
  }

  try {
    const nat = computeNaturalness(data || {});
    const natPercent = nat.percent;
    const natEl = document.getElementById("naturalnessValue");

    if (natEl) {
      natEl.textContent = `${natPercent}% Natural`;
      natEl.classList.remove(
        "naturalness-high",
        "naturalness-med",
        "naturalness-low"
      );
      void natEl.offsetWidth;
      natEl.classList.add("visible");

      if (natPercent >= 60) natEl.classList.add("naturalness-high");
      else if (natPercent >= 30) natEl.classList.add("naturalness-med");
      else natEl.classList.add("naturalness-low");
    }
  } catch (e) {
    console.error("Error updating naturalness:", e);
  }

  try {
    const key = "captural_leaderboard";
    const board = JSON.parse(localStorage.getItem(key) || "[]");
    const entry = {
      ...data,
      timestamp: Date.now(),
      totalTime:
        (Number(data.puzzleTime) || 0) +
        (Number(data.objectTime) || 0),
      totalErrors:
        (Number(data.puzzleErrors) || 0) +
        (Number(data.objectErrors) || 0),
    };
    board.unshift(entry);
    if (board.length > 50) board.length = 50;
    localStorage.setItem(key, JSON.stringify(board));
    renderLeaderboard();
  } catch (e) {
    console.error("Error saving leaderboard:", e);
  }

  setTimeout(() => {
    animateCircle(
      "puzzleCircle",
      "puzzleValue",
      data.puzzleTime,
      15,
      circumference
    );
  }, 300);

  setTimeout(() => {
    animateCircle(
      "objectCircle",
      "objectValue",
      data.objectTime,
      15,
      circumference
    );
  }, 500);

  setTimeout(() => {
    animateCircle(
      "totalCircle",
      "totalValue",
      data.totalTime,
      30,
      circumference
    );
  }, 700);

  setTimeout(() => {
    const pAcc = Number(data.puzzleAccuracy ?? data.objectAccuracy ?? 0);
    const oAcc = Number(data.objectAccuracy ?? data.puzzleAccuracy ?? 0);
    const avgAccuracy = Math.round((pAcc + oAcc) / 2);
    document.getElementById("accuracyValue").textContent = avgAccuracy + "%";

    const totalErrors =
      (Number(data.puzzleErrors) || 0) + (Number(data.objectErrors) || 0);
    document.getElementById("errorsValue").textContent = totalErrors;
    document.getElementById("errorsSub").textContent =
      `${Number(data.puzzleErrors) || 0} puzzle · ${Number(data.objectErrors) || 0} alignment`;
  }, 900);

  setTimeout(() => {
    updatePhaseBar(
      "puzzleBar",
      "puzzleTime",
      "puzzleErrors",
      data.puzzleTime,
      15,
      data.puzzleErrors
    );
  }, 1200);

  setTimeout(() => {
    updatePhaseBar(
      "objectBar",
      "objectTime",
      "objectErrors",
      data.objectTime,
      15,
      data.objectErrors
    );
  }, 1400);
}

function renderLeaderboard() {
  const key = "captural_leaderboard";
  const tbody = document.querySelector("#leaderboardTable tbody");
  if (!tbody) return;
  let board = [];
  try {
    board = JSON.parse(localStorage.getItem(key) || "[]");
    board.sort((a, b) => {
      if (a.totalTime !== b.totalTime) return a.totalTime - b.totalTime;
      if (a.totalErrors !== b.totalErrors)
        return a.totalErrors - b.totalErrors;
      return b.naturalness - a.naturalness;
    });
  } catch (e) {
    board = [];
  }
  // clear
  tbody.innerHTML = "";

  board.forEach((row, i) => {
    const tr = document.createElement("tr");

    const puzzle = row.puzzleName || (row.puzzleImage || "puzzle");
    const time = ((Number(row.puzzleTime) || 0) + (Number(row.objectTime) || 0)).toFixed(1) + "s";
    const errors = Number(row.puzzleErrors) || 0;

    const nat = computeNaturalness(row || {}).percent;

    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${escapeHtml(puzzle)}</td>
      <td>${time}</td>
      <td>${errors}</td>
      <td><span class="leader-nat ${nat >= 60 ? 'naturalness-high' : nat >=30 ? 'naturalness-med' : 'naturalness-low'}">${nat}%</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function escapeHtml(s) {
  if (!s) return "";
  return s.replace(/[&<>'"]/g, function (c) {
    return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
  });
}

function animateCircle(circleId, valueId, value, max, circumference) {
  const circle = document.getElementById(circleId);
  const valueEl = document.getElementById(valueId);
  const percentage = Math.min((value / max) * 100, 100);
  const offset = circumference - (percentage / 100) * circumference;

  circle.style.strokeDashoffset = offset;

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
