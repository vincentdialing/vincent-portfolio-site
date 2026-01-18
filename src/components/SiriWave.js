export class SiriWave {
  constructor(options) {
    this.container = options.container;
    this.canvas = options.canvas;
    this.ctx = this.canvas.getContext('2d');

    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    this.canvas.width = this.width * 2; // Retina resolution
    this.canvas.height = this.height * 2;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.scale(2, 2);

    this.phase = 0;
    this.run = false;
    this.amplitude = 0;
    this.targetAmplitude = 0;

    // Matches the blue/cyan/white curves in the image
    // Adjusted for thinner, glowing look
    this.curves = [
      { color: 'rgba(59, 130, 246, 0.6)', speed: 0.1, amplitude: 0.5, width: 1.5 }, // Outer Blue
      { color: 'rgba(6, 182, 212, 0.8)', speed: 0.2, amplitude: 0.8, width: 1.5 },  // Middle Cyan
      { color: 'rgba(255, 255, 255, 1.0)', speed: 0.3, amplitude: 1.0, width: 2.0 }  // Core White
    ];

    this._animate = this._animate.bind(this);
  }

  start() {
    this.run = true;
    this._animate();
  }

  stop() {
    this.run = false;
  }

  setAmplitude(val) {
    this.targetAmplitude = val;
  }

  _animate() {
    if (!this.run) return;

    // Smooth dampening
    this.amplitude += (this.targetAmplitude - this.amplitude) * 0.1;

    this.ctx.clearRect(0, 0, this.width, this.height);
    // Darker composite operation for glow effect might be needed, but default source-over is fine with shadow
    // this.ctx.globalCompositeOperation = 'lighter'; 

    this.phase += 0.08; // Slower, calmer speed

    this.curves.forEach((curve) => {
      this._drawCurve(curve);
    });

    requestAnimationFrame(this._animate);
  }

  _drawCurve(curve) {
    this.ctx.beginPath();
    const midY = this.height / 2;
    // Modulate amplitude by the instance's active state
    const maxAmp = 30 * this.amplitude * curve.amplitude;

    for (let x = 0; x <= this.width; x += 2) {
      const xRatio = (x / this.width) - 0.5; // -0.5 to 0.5

      // Gaussian/Bell Curve function for sharp center focus
      // e^(-k * x^2)
      const scaling = Math.exp(-12 * (xRatio * xRatio));

      // Sine wave with varying frequency
      const y = midY + Math.sin(x * 0.03 * curve.speed + this.phase + curve.speed * 5) * maxAmp * scaling;

      if (x === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    }

    this.ctx.strokeStyle = curve.color;
    this.ctx.lineWidth = curve.width;

    // Glow Effect
    this.ctx.shadowBlur = 15;
    this.ctx.shadowColor = curve.color;

    this.ctx.stroke();

    // Reset shadow for performance if needed, or leave it
    this.ctx.shadowBlur = 0;
  }
}
