import { PuzzleModule } from "./puzzle.js";
import { ObjectAlignModule } from "./objectAlign.js";
import { updateDashboard } from "./dashboard.js"; // Wir müssen dashboard.js leicht anpassen!

class AppManager {
  constructor() {
    // DOM Elements
    this.loginView = document.getElementById("login-view");
    this.dashboardView = document.getElementById("dashboard-view");
    this.modal = document.getElementById("captcha-modal");
    
    this.video = document.getElementById("webcam");
    this.canvas = document.getElementById("output_canvas");
    this.ctx = this.canvas.getContext("2d");
    
    this.titleEl = document.getElementById("captcha-step-title");
    this.instrEl = document.getElementById("captcha-instruction");
    this.spinner = document.getElementById("loading-spinner");

    // Modules
    this.puzzleModule = new PuzzleModule(this.canvas);
    this.objectModule = new ObjectAlignModule(this.canvas);
    
    // State
    this.state = 0; // 0=Login, 1=Puzzle, 2=Object, 3=Dashboard
    this.isRunning = false;
    this.startTime = 0;
    
    this.sessionData = {
      puzzleTime: 0,
      objectTime: 0,
      totalTime: 0,
      puzzleErrors: 0,
      objectAccuracy: 100,
      passed: false
    };

    this.bindEvents();
  }

  bindEvents() {
    document.getElementById("start-captcha-btn").addEventListener("click", () => this.startCaptchaSequence());
    document.getElementById("reset-btn").addEventListener("click", () => location.reload());
  }

  async startCaptchaSequence() {
    this.setState(1); // Go to Puzzle
  }

  async setState(newState) {
    console.log(`Transitioning to State ${newState}`);
    this.state = newState;

    if (newState === 1) {
      // INIT PUZZLE
      this.loginView.classList.add("hidden");
      this.modal.classList.remove("hidden");
      this.spinner.classList.remove("hidden");
      
      // Start Camera if not running
      if (!this.video.srcObject) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            this.video.srcObject = stream;
            await new Promise(r => this.video.onloadeddata = r);
        } catch(e) {
            this.instrEl.innerText = "Error: Camera access denied.";
            return;
        }
      }

      this.titleEl.innerText = "Step 1/2: Puzzle";
      this.instrEl.innerText = "Pinch pieces to solve the puzzle.";
      
      await this.puzzleModule.init();
      
      this.spinner.classList.add("hidden");
      this.startTime = Date.now();
      this.isRunning = true;
      this.loop();
    }
    else if (newState === 2) {      
      this.titleEl.innerText = "Step 2/2: Object Alignment";
      this.instrEl.innerText = "Use your hand to rotate the object.";
      this.spinner.classList.remove("hidden");

      await this.objectModule.init();

      this.spinner.classList.add("hidden");
      this.startTime = Date.now(); // Reset timer for phase 2
    }

    else if (newState === 3) {
      // DASHBOARD
      this.isRunning = false;
      
      // Save Object Stats
      const duration = (Date.now() - this.startTime) / 1000;
      this.sessionData.objectTime = duration;
      this.sessionData.totalTime = this.sessionData.puzzleTime + this.sessionData.objectTime;
      this.sessionData.passed = true;

      // Stop Camera
      const tracks = this.video.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      this.video.srcObject = null;

      // UI Switch
      this.modal.classList.add("hidden");
      this.dashboardView.classList.remove("hidden");
      document.body.style.overflow = "auto";

      // Render Dashboard
      updateDashboard(this.sessionData);
    }
  }

  loop = () => {
    if (!this.isRunning) return;

    // State Logic
    if (this.state === 1) {
      const isDone = this.puzzleModule.runStep(this.video);
      if (isDone) {
        const duration = (Date.now() - this.startTime) / 1000;
        this.sessionData.puzzleTime = duration;
        this.sessionData.puzzleErrors = this.puzzleModule.puzzleErrors;

        console.log(`Puzzle Done! Time: ${duration}s, Errors: ${this.sessionData.puzzleErrors}`);

        this.setState(3); // change to phase 2
        return;
      }
    } 
    else if (this.state === 2) {
      const isDone = this.objectModule.runStep(this.video);
      if (isDone) {
        const duration = (Date.now() - this.startTime) / 1000;
        this.sessionData.objectTime = duration;
        
        this.setState(3);
        return;
      }
    }

    requestAnimationFrame(this.loop);
  }
}

// Start App
document.addEventListener("DOMContentLoaded", () => {
  new AppManager();
});