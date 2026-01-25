import {
  HandLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

// --- KONFIGURATION ---
const IMAGE_SRC = import.meta.env.BASE_URL + "images/apple.jpg";
const ROWS = 3;
const COLS = 3;
const SNAP_DIST_THRESHOLD = 0.1; // 0-1 snap 
const SNAP_ROT_THRESHOLD = 0.5; // Radiant für rotation (~17 Grad)
const PINCH_THRESHOLD = 0.08; // Abstand Daumen-Zeigefinger zum Greifen

// --- HELPER CLASS: PUZZLE PIECE ---
class PuzzlePiece {
  constructor(id, row, col, img) {
    this.id = id;
    this.targetRow = row;
    this.targetCol = col;
    this.img = img;
    
    this.snappedRow = -1; 
    this.snappedCol = -1;

    this.sizePercent = 0.6 / Math.max(ROWS, COLS); 
    
    this.x = 0.1 + Math.random() * 0.8;
    this.y = 0.1 + Math.random() * 0.8;
    this.rotation = (Math.random() * Math.PI * 2);
    
    this.isLocked = false;
    this.grabbedByHandId = null; 
    this.grabOffset = { x: 0, y: 0, angle: 0 };
  }

  isCorrect() {
    if (!this.isLocked) return false;
    if (this.snappedRow !== this.targetRow || this.snappedCol !== this.targetCol) return false;

    let rot = this.rotation % (Math.PI * 2);
    if (rot < 0) rot += Math.PI * 2;
    const isUpright = (Math.abs(rot) < 0.01 || Math.abs(rot - Math.PI * 2) < 0.01);
    return isUpright;
  }

  getSlotPos(cw, ch, r, c) {
    const puzzleSize = Math.min(cw, ch) * 0.6;
    const pieceSizePx = puzzleSize / ROWS;
    const startX = (cw - puzzleSize) / 2;
    const startY = (ch - puzzleSize) / 2;
    
    return {
      x: startX + c * pieceSizePx + pieceSizePx / 2,
      y: startY + r * pieceSizePx + pieceSizePx / 2,
      size: pieceSizePx
    };
  }

  getTargetPos(cw, ch) {
    return this.getSlotPos(cw, ch, this.targetRow, this.targetCol);
  }

  draw(ctx, cw, ch) {
    let renderX, renderY, renderSize;

    if (this.isLocked && this.snappedRow !== -1) {
        const slot = this.getSlotPos(cw, ch, this.snappedRow, this.snappedCol);
        renderX = slot.x;
        renderY = slot.y;
        renderSize = slot.size;
    } else {
        renderX = this.x * cw;
        renderY = this.y * ch;
        renderSize = this.getTargetPos(cw, ch).size;
    }
    
    const r = this.rotation;
    const correct = this.isCorrect();

    ctx.save();
    ctx.translate(renderX, renderY);
    ctx.rotate(r);

    if (this.grabbedByHandId !== null) {
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 20;
      ctx.scale(1.1, 1.1);
    } else if (correct) {
      ctx.strokeStyle = "#00FF00";
      ctx.lineWidth = 4;
    } else {
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 5;
    }

    ctx.beginPath();
    ctx.rect(-renderSize/2, -renderSize/2, renderSize, renderSize);
    
    if (correct) {
       ctx.stroke();
       ctx.filter = "brightness(70%)"; 
    } else if (this.isLocked) {
       ctx.filter = "brightness(80%) grayscale(60%)"; 
    }
    
    ctx.clip(); 

    const srcPieceW = this.img.width / COLS;
    const srcPieceH = this.img.height / ROWS;
    
    ctx.drawImage(
      this.img,
      this.targetCol * srcPieceW, this.targetRow * srcPieceH, srcPieceW, srcPieceH,
      -renderSize/2, -renderSize/2, renderSize, renderSize
    );

    ctx.restore();
  }
}

// --- MAIN MODULE CLASS ---
export class PuzzleModule {
  constructor(canvasElement) {
    this.handLandmarker = null;
    this.puzzlePieces = [];
    this.sourceImage = null;
    
    this.canvasElement = canvasElement;
    this.ctx = this.canvasElement.getContext("2d");
    this.drawUtils = new DrawingUtils(this.ctx);

    this.puzzleErrors = 0;
  }

  /**
   * Initialisiert MediaPipe und lädt Assets.
   * Wird vom AppManager einmalig aufgerufen.
   */
  async init() {
    
    // 1. MediaPipe laden
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );

    this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 2,
    });

    await this.loadPuzzleImage();
    this.generatePuzzlePieces();
    }

  async loadPuzzleImage() {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = IMAGE_SRC;
      img.onload = () => {
        this.sourceImage = img;
        resolve();
      };
      img.onerror = () => {
        console.error("Bild konnte nicht geladen werden:", IMAGE_SRC);
        resolve(); // Trotzdem resolven, um App nicht zu crashen
      }
    });
  }

  generatePuzzlePieces() {
    this.puzzlePieces = [];
    let idCounter = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        this.puzzlePieces.push(new PuzzlePiece(idCounter++, r, c, this.sourceImage));
      }
    }
  }

  /**
   * Haupt-Update-Funktion. Wird vom AppManager Loop aufgerufen.
   * @param {HTMLVideoElement} video - Der Video-Stream vom Manager
   * @returns {boolean} true, wenn Puzzle gelöst ist
   */
  runStep(video) {
    if (!this.handLandmarker) return false;

    // 1. Canvas Größe anpassen falls nötig
    if (this.canvasElement.width !== video.videoWidth || this.canvasElement.height !== video.videoHeight) {
      this.canvasElement.width = video.videoWidth;
      this.canvasElement.height = video.videoHeight;
    }
    const canvasW = this.canvasElement.width;
    const canvasH = this.canvasElement.height;

    // 2. Landmarks erkennen
    let startTimeMs = performance.now();
    const results = this.handLandmarker.detectForVideo(video, startTimeMs);

    // 3. Canvas bereinigen
    this.ctx.clearRect(0, 0, canvasW, canvasH);

    // 4. Spiellogik ausführen
    if (results.landmarks) {
      this.updateGameLogic(results.landmarks, canvasW, canvasH);
    }

    // 5. Zeichnen
    this.drawGridPlaceholder(canvasW, canvasH);

    // Teile sortieren (gegriffene oben)
    const sortedPieces = [...this.puzzlePieces].sort((a, b) => {
      if (a.grabbedByHandId !== null) return 1;
      if (b.grabbedByHandId !== null) return -1;
      return 0;
    });

    sortedPieces.forEach((p) => p.draw(this.ctx, canvasW, canvasH));

    // Hände zeichnen
    if (results.landmarks) {
      this.drawHands(results.landmarks);
    }

    // 6. Prüfen ob gewonnen
    const allCorrect = this.puzzlePieces.every(piece => piece.isCorrect());
    return allCorrect;
  }

  // --- LOGIC HELPER ---
  updateGameLogic(landmarksArray, cw, ch) {
    if(landmarksArray.length === 0) return;
    for (let handIdx = 0; handIdx < landmarksArray.length; handIdx++) {
      const landmarks = landmarksArray[handIdx];
      
      const wrist = landmarks[0];
      const thumb = landmarks[4];
      const index = landmarks[8];
  
      const dist = Math.hypot(thumb.x - index.x, thumb.y - index.y);
      const midX = (thumb.x + index.x) / 2;
      const midY = (thumb.y + index.y) / 2;
      const angle = Math.atan2(midY - wrist.y, midX - wrist.x);
  
      const isPinching = dist < PINCH_THRESHOLD;
  
      let heldPiece = this.puzzlePieces.find(p => p.grabbedByHandId === handIdx);
  
      if (isPinching) {
        if (heldPiece) {
          // Bewegen
          let newRot = angle - heldPiece.grabOffset.angle;
          heldPiece.x += (midX - heldPiece.grabOffset.x - heldPiece.x) * 0.5;
          heldPiece.y += (midY - heldPiece.grabOffset.y - heldPiece.y) * 0.5;
          heldPiece.rotation = newRot;
          
          // Limits
          heldPiece.x = Math.max(0, Math.min(1, heldPiece.x));
          heldPiece.y = Math.max(0, Math.min(1, heldPiece.y));
  
        } else {
          // Versuchen zu greifen
          const candidates = this.puzzlePieces.filter(p => 
              p.grabbedByHandId === null && 
              !p.isCorrect()
          );
          
          let closest = null;
          let minD = Infinity;
  
          candidates.forEach(p => {
              const d = Math.hypot((p.x - midX), (p.y - midY) * (ch/cw)); 
              if (d < 0.1) { 
                 if (d < minD) { minD = d; closest = p; }
              }
          });
  
          if (closest) {
            closest.grabbedByHandId = handIdx;
            closest.isLocked = false;
            closest.snappedRow = -1;
            closest.snappedCol = -1;
            
            closest.grabOffset = {
              x: 0, 
              y: 0,
              angle: angle - closest.rotation 
            };
          }
        }
      } else {
        // Loslassen
        if (heldPiece) {
          heldPiece.grabbedByHandId = null;
          this.checkSnap(heldPiece, cw, ch);
        }
      }
    }
  }

  checkSnap(p, cw, ch) {
    const PI_HALF = Math.PI / 2;
    
    let currentRot = p.rotation % (Math.PI * 2);
    if (currentRot < 0) currentRot += Math.PI * 2;
  
    const step = Math.round(currentRot / PI_HALF);
    const targetRot = step * PI_HALF; 
    const rotDiff = Math.abs(currentRot - targetRot);
  
    if (rotDiff > SNAP_ROT_THRESHOLD) return;
  
    // Bester Slot finden
    let bestCandidate = null;
    let minDistance = Infinity;
  
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        
        const slotPos = p.getSlotPos(cw, ch, r, c);
        const slotXNorm = slotPos.x / cw;
        const slotYNorm = slotPos.y / ch;
  
        const dist = Math.hypot(
            p.x - slotXNorm, 
            (p.y - slotYNorm) * (ch / cw)
        );
  
        if (dist < SNAP_DIST_THRESHOLD && dist < minDistance) {
          minDistance = dist;
          bestCandidate = { r, c, x: slotXNorm, y: slotYNorm };
        }
      }
    }
  
    // Snappen ausführen
    if (bestCandidate) {
      const { r, c, x, y } = bestCandidate;
  
      const occupied = this.puzzlePieces.find(other => 
        other.isLocked && other.id !== p.id && 
        other.snappedRow === r && other.snappedCol === c 
      );
  
      if (occupied) {
        if (occupied.isCorrect()) {
           return; 
        }
        // Verdrängen
        occupied.isLocked = false;
        occupied.snappedRow = -1;
        occupied.snappedCol = -1;
        occupied.x += (Math.random() - 0.5) * 0.2;
        occupied.y += (Math.random() - 0.5) * 0.2;
        occupied.rotation += (Math.random() - 0.5);
      }
  
      // Lock on
      p.isLocked = true;
      p.grabbedByHandId = null;
      p.rotation = targetRot; 
      p.x = x; 
      p.y = y;
      p.snappedRow = r;
      p.snappedCol = c;

      if (!p.isCorrect()) {
          this.puzzleErrors++;
          console.log("Fehlerhafter Move! Total Errors:", this.puzzleErrors);
      }
    }
  }

  drawGridPlaceholder(cw, ch) {
    const puzzleSize = Math.min(cw, ch) * 0.6;
    const startX = (cw - puzzleSize) / 2;
    const startY = (ch - puzzleSize) / 2;
  
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(startX, startY, puzzleSize, puzzleSize);
  
    // Gitterlinien
    this.ctx.beginPath();
    const step = puzzleSize / ROWS;
    for (let i = 1; i < ROWS; i++) {
      this.ctx.moveTo(startX, startY + i * step);
      this.ctx.lineTo(startX + puzzleSize, startY + i * step);
      this.ctx.moveTo(startX + i * step, startY);
      this.ctx.lineTo(startX + i * step, startY + puzzleSize);
    }
    this.ctx.stroke();
  }
  
  drawHands(landmarks) {
    for (const hand of landmarks) {
      this.drawUtils.drawConnectors(hand, HandLandmarker.HAND_CONNECTIONS, {
        color: "#00FF00",
        lineWidth: 3,
      });
      this.drawUtils.drawLandmarks(hand, {
        color: "#FF0000",
        lineWidth: 1,
        radius: 3,
      });
    }
  }
}