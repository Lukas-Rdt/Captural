import { DrawingUtils, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

/* 
    FILLER CODE FOR TESTING PURPOSES PLS DELETE ASAP
 */

export class ObjectAlignModule {
    constructor(canvasElement) {
        this.canvasElement = canvasElement;
        this.ctx = canvasElement.getContext("2d");
        this.frameCount = 0;
    }

    async init() {
        // Hier ggf. 3D Modelle laden
        console.log("Object Align Init");
        // Simuliere Ladezeit
        await new Promise(r => setTimeout(r, 1000));
    }

    runStep(video) {
        this.frameCount++;
        
        // Canvas Setup (falls resize nötig)
        const cw = this.canvasElement.width;
        const ch = this.canvasElement.height;
        
        this.ctx.clearRect(0, 0, cw, ch);
        
        // Zeichne Dummy Content
        this.ctx.fillStyle = "#8b5cf6";
        this.ctx.font = "30px DM Sans";
        this.ctx.textAlign = "center";
        this.ctx.fillText("Object Alignment Phase", cw/2, ch/2 - 20);
        
        this.ctx.fillStyle = "rgba(255,255,255,0.7)";
        this.ctx.font = "20px DM Sans";
        this.ctx.fillText("Click anywhere in the black area to pass", cw/2, ch/2 + 20);

        // Zeichne einen rotierenden Kreis als Platzhalter
        this.ctx.beginPath();
        this.ctx.arc(cw/2, ch/2, 100, 0 + (this.frameCount*0.05), 1.5 * Math.PI + (this.frameCount*0.05));
        this.ctx.strokeStyle = "#8b5cf6";
        this.ctx.lineWidth = 5;
        this.ctx.stroke();

        // Dummy-Erfolgsbedingung: Klick auf Canvas (in der echten App z.B. Handgeste)
        // Wir tricksen hier, indem wir global auf Click lauschen, aber eigentlich sollte das über Gesten gehen.
        // Für den Prototyp lassen wir den FrameCount entscheiden (Automatischer Pass nach 5 Sekunden zum Testen)
        
        if (this.frameCount > 300) { // 300 frames @ 60fps ~ 5 sekunden
            return true;
        }

        return false;
    }
}