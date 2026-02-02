import { ObjectDetector, FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";
import * as THREE from "https://cdn.skypack.dev/three@0.128.0";
import { GLTFLoader } from "https://cdn.skypack.dev/three@0.128.0/examples/jsm/loaders/GLTFLoader.js";

export class ObjectAlignModule {

  constructor() {
    // task and start setup
    this.canvasElement = document.getElementById("output_canvas");
    this.ctx = this.canvasElement.getContext("2d");
    this.statusTextElement = document.getElementById("alignment-status");
    this.instrEl = document.getElementById("captcha-instruction");
    this.debugMode = true;
    this.allowedEyes = ["one", "two", "three", "four", "five", "six"];
    this.displayLabel = "one";
    this.calibImg = new Image();
    this.calibImg.src = `./dice/front/${this.displayLabel}.png`;
    this.calibImgLoaded = false;
    this.calibImg.onload = () => { this.calibImgLoaded = true; };

    // 3d setup
    this.threeWidth = 400;
    this.threeHeight = 400;
    this.virtualCanvas = document.createElement('canvas');
    this.virtualCanvas.width = this.threeWidth;
    this.virtualCanvas.height = this.threeHeight;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.virtualCanvas,
      alpha: true,
      antialias: true
    });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    this.camera.position.z = 7;
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(2, 5, 5);
    this.scene.add(dirLight);
    const backLight = new THREE.DirectionalLight(0xffffff, 0.5);
    backLight.position.set(-2, -5, -5);
    this.scene.add(backLight);

    this.diceModel = new THREE.Group();
    this.scene.add(this.diceModel);
    this.isModelLoaded = false;

    // laod GLB model
    const loader = new GLTFLoader();
    loader.load('./dice/dice.glb', (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 2.0 / maxDim;
      model.scale.set(scale, scale, scale);
      this.diceModel.add(model);
      this.isModelLoaded = true;
    }, undefined, (error) => {
      console.error("Error loading dice model:", error);
    });

    // state
    this.isReady = false;
    this.isVerified = false;
    this.state = "WAITING_FOR_ANCHOR";

    // randomized goal rotation
    //this.goalRoll = (0.5 + Math.random() * 0.8) * (Math.random() < 0.5 ? -1 : 1);
    //this.goalPitch = (0.3 + Math.random() * 0.4) * (Math.random() < 0.5 ? -1 : 1);
    this.goalRoll = (0.35 + Math.random() * 0.45) * (Math.random() < 0.5 ? -1 : 1);
    this.goalPitch = (0.25 + Math.random() * 0.30) * (Math.random() < 0.5 ? -1 : 1);

    // timer/thresholds
    this.calibTimer = 0;
    this.calibThreshold = 30;
    this.diceStableCount = 0;
    this.maxStableCount = 10;
    this.diceLostThreshold = 5;

    // tracking
    this.smoothX = 0;
    this.smoothY = 0;
    this.currentRoll = 0;
    this.currentPitch = 0;
    this.currentYaw = 0; // Hinzugefügt aus V2
    this.holdProgress = 0;
    this.lastDiceScore = 0;
    this.lastDiceLabel = "none";
    
    this.currentQuaternion = new THREE.Quaternion();
    this.baseQuaternion = new THREE.Quaternion();
  }

  // initialize
  async init() {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );

    this.objectDetector = await ObjectDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "model/custom20e32b.tflite",
        delegate: "CPU",
        categoryAllowlist: this.allowedEyes
      },
      scoreThreshold: 0.30,
      runningMode: "VIDEO",
      maxResults: 1
    });

    this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numHands: 1
    });

    if (this.instrEl) {
      this.instrEl.innerHTML = `Show your dice to the camera to calibrate.`;
    }
    this.isReady = true;
  }

  // run loop
  runStep(video) {
    if (!this.isReady) return false;

    if (this.canvasElement.width !== video.videoWidth) {
      this.canvasElement.width = video.videoWidth;
      this.canvasElement.height = video.videoHeight;
    }
    const width = this.canvasElement.width;
    const height = this.canvasElement.height;
    const screenCenter = { x: width / 2, y: height / 2 };

    // background
    this.ctx.drawImage(video, 0, 0, width, height);
    this.ctx.fillStyle = "rgba(15, 20, 30, 0.85)";
    this.ctx.fillRect(0, 0, width, height);

    if (video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = video.currentTime;
      const now = performance.now();
      const handRes = this.handLandmarker.detectForVideo(video, now);
      
      let objRes = null;
      if (this.state === "WAITING_FOR_ANCHOR") {
          objRes = this.objectDetector.detectForVideo(video, now);
      }
      
      this.updateLogic(handRes, objRes, width, height);
    }

    this.renderScene(screenCenter);
    return this.isVerified;
  }

  smoothValue(c, t, f) { return c + (t - c) * f; }

  // calculate rotation based on dice between fingers
  computeDiceOrientation(worldLandmarks) {
      const v = i => new THREE.Vector3(
        worldLandmarks[i].x,
        worldLandmarks[i].y,
        worldLandmarks[i].z
      );

      // axis rotation relative to wirst and finger movements (roll, yaw)
      const wrist = v(0);
      const indexMCP = v(5);
      const pinkyMCP = v(17);
      const indexTip = v(8);
      const xAxis = new THREE.Vector3()
        .subVectors(indexMCP, pinkyMCP)
        .normalize();
      const yAxis = new THREE.Vector3()
        .subVectors(indexTip, wrist)
        .normalize();
      const zAxis = new THREE.Vector3()
        .crossVectors(xAxis, yAxis)
        .normalize();
      yAxis.crossVectors(zAxis, xAxis).normalize();

      const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
      return new THREE.Quaternion().setFromRotationMatrix(m);
  }

  // logic
  updateLogic(handRes, objRes, w, h) {
      const landmarks = handRes.landmarks && handRes.landmarks[0];
      const worldLandmarks = handRes.worldLandmarks && handRes.worldLandmarks[0];
      
      // deetct dice on screen
      let rawDetected = false;
      if (this.state === "WAITING_FOR_ANCHOR" && objRes && objRes.detections.length > 0) {
          const det = objRes.detections[0];
          this.lastDiceLabel = det.categories[0].categoryName;
          this.lastDiceScore = det.categories[0].score;
          rawDetected = true;
      }

      if (rawDetected) this.diceStableCount = Math.min(this.maxStableCount, this.diceStableCount + 1);
      else this.diceStableCount = Math.max(0, this.diceStableCount - 1);
      const isDiceStable = this.diceStableCount > this.diceLostThreshold;

      // track hand with dice
      if (!landmarks || !worldLandmarks) return;

      const thumb = landmarks[4];
      const index = landmarks[8];
      const currentX = (thumb.x + index.x) / 2 * w;
      const currentY = (thumb.y + index.y) / 2 * h;

      if (this.smoothX === 0 && this.smoothY === 0) {
        this.smoothX = currentX;
        this.smoothY = currentY;
      } else {
        this.smoothX = this.smoothValue(this.smoothX, currentX, 0.2);
        this.smoothY = this.smoothValue(this.smoothY, currentY, 0.2);
      }
      
      // 3D orientation of dice between fingers
      const targetQuat = this.computeDiceOrientation(worldLandmarks);
      
      if (this.currentQuaternion.length() === 0) {
        this.currentQuaternion.copy(targetQuat);
      } else {
        this.currentQuaternion.slerp(targetQuat, 0.12);
      }
      this.currentQuaternion.normalize();

      if (this.state === "WAITING_FOR_ANCHOR") {
          if (isDiceStable && this.lastDiceScore > 0.35) {
              this.calibTimer++;
              if (this.calibTimer > this.calibThreshold) {
                  this.baseQuaternion = this.currentQuaternion.clone().invert();
                  
                  this.state = "ACTIVE";
                  if (this.instrEl) this.instrEl.innerText = "Match the orientation of the dice above!";
              }
          } else {
              this.calibTimer = Math.max(0, this.calibTimer - 2);
          }
      } 
      else if (this.state === "ACTIVE") {
          const relativeQuat = this.currentQuaternion.clone().multiply(this.baseQuaternion);
          const relativeEuler = new THREE.Euler().setFromQuaternion(relativeQuat, "YXZ");
          
          this.currentRoll = relativeEuler.z; 
          this.currentPitch = relativeEuler.x;
          this.currentYaw = relativeEuler.y;
          
          this.checkTargetMatch();
      }
      
      // visual debug
      if (this.ctx && this.debugMode) {
          this.ctx.beginPath();
          this.ctx.moveTo(thumb.x * w, thumb.y * h);
          this.ctx.lineTo(index.x * w, index.y * h);
          this.ctx.lineWidth = 4;
          this.ctx.strokeStyle = this.state === "ACTIVE" ? "#4ade80" : "rgba(255, 255, 255, 0.3)";
          this.ctx.stroke();
      }
  }

  // check position / match
  checkTargetMatch() {
      let dR = this.currentRoll - this.goalRoll;
      while (dR > Math.PI) dR -= 2*Math.PI; while (dR < -Math.PI) dR += 2*Math.PI;
      
      let dP = this.currentPitch - this.goalPitch;
      while (dP > Math.PI) dP -= 2*Math.PI; while (dP < -Math.PI) dP += 2*Math.PI;

      if (Math.abs(dR) < 0.25 && Math.abs(dP) < 0.35) {
          this.holdProgress += 0.05;
      } else {
          this.holdProgress = Math.max(0, this.holdProgress - 0.05);
      }
      if (this.holdProgress >= 1) {
          this.state = "SUCCESS";
          this.isVerified = true;
          if (this.instrEl) this.instrEl.innerText = "Verified!";
      }
  }

  renderScene(screenCenter) {
      const ctx = this.ctx;
      const renderX = (this.smoothX > 0) ? this.smoothX : screenCenter.x;
      const renderY = (this.smoothY > 0) ? this.smoothY : screenCenter.y;
      
      // anchor staring position
      if (this.state === "WAITING_FOR_ANCHOR") {
          const imgSize = 100;
          if (this.calibImgLoaded) {
              const pulse = 1 + Math.sin(Date.now() / 200) * 0.05;
              ctx.save(); 
              ctx.translate(renderX, renderY); 
              ctx.scale(pulse, pulse);
              ctx.drawImage(this.calibImg, -imgSize/2, -imgSize/2, imgSize, imgSize);
              ctx.restore();
          }
          if(this.calibTimer > 0) {
              const p = this.calibTimer / this.calibThreshold;
              ctx.beginPath(); 
              ctx.arc(renderX, renderY, imgSize/2 + 20, -Math.PI/2, -Math.PI/2 + Math.PI*2*p); 
              ctx.strokeStyle="#fbbf24"; ctx.lineWidth=6; ctx.stroke();
          }
      } 
      else {
          if (!this.isModelLoaded) return;

          const targetSize = 120;
          const targetX = 80;
          const targetY = 80;

          // target orintation
          ctx.fillStyle = "rgba(0,0,0,0.5)";
          ctx.beginPath(); 
          ctx.roundRect(targetX - 70, targetY - 70, 140, 140, 15);
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 2; ctx.stroke();
          
          ctx.fillStyle = "#aaaaaa"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
          
          // Fix for mirrored text
          ctx.save();
          ctx.scale(-1, 1);
          ctx.fillText("TARGET", -targetX, targetY - 50);
          ctx.restore();

          // screen ice
          this.diceModel.quaternion.identity();
          this.diceModel.rotation.set(this.goalPitch, 0, this.goalRoll);
          this.renderer.render(this.scene, this.camera);
          ctx.drawImage(this.virtualCanvas, targetX - targetSize/2, targetY - targetSize/2, targetSize, targetSize);


          // 3d model of controlled dice
          const playerSize = 250; 
          const ringRadius = 130; 
          if (this.state === "ACTIVE" || this.state === "SUCCESS") {
             const relativeQuat = this.currentQuaternion.clone().multiply(this.baseQuaternion);
             this.diceModel.quaternion.copy(relativeQuat);
          } else {
             this.diceModel.rotation.set(0, 0, 0);
          }   
          this.renderer.render(this.scene, this.camera);
          ctx.save();
          ctx.translate(renderX, renderY);
          ctx.drawImage(this.virtualCanvas, -playerSize/2, -playerSize/2, playerSize, playerSize);
          
          // visual progress
          ctx.beginPath(); ctx.arc(0, 0, ringRadius, 0, 2*Math.PI); 
          ctx.strokeStyle="rgba(255,255,255,0.1)"; ctx.lineWidth=2; ctx.stroke(); 
          // verify
          if (this.holdProgress > 0) {
              ctx.beginPath();
              ctx.arc(0, 0, ringRadius + 10, 0, Math.PI*2*this.holdProgress);
              ctx.strokeStyle = "#4ade80"; ctx.lineWidth = 8; ctx.stroke();
          }

          ctx.restore();
      }

      // state feedback
      if (this.statusTextElement) {
          if (this.state === "SUCCESS") {
               this.statusTextElement.innerText = "It's a Match!";
               this.statusTextElement.style.color = "#4ade80";
          } else if (this.state === "ACTIVE") {
               this.statusTextElement.innerText = "Rotate your dice to match the orientation of the image above!";
               this.statusTextElement.style.color = "white";
          } else {
               this.statusTextElement.innerText = "Calibrating your dice...";
               this.statusTextElement.style.color = "#fbbf24";
          }
      }
  }
}