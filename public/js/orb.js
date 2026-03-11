class Orb {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = canvas.width;
    this.h = canvas.height;
    this.cx = this.w / 2;
    this.cy = this.h / 2;

    // State: 'idle' | 'listening' | 'speaking'
    this.state = 'idle';
    this.audioLevel = 0;
    this.targetAudioLevel = 0;

    // Animation
    this.t = 0;
    this.particles = [];
    for (let i = 0; i < 24; i++) {
      this.particles.push({
        angle: (Math.PI * 2 * i) / 24,
        radius: 120 + Math.random() * 20,
        speed: 0.3 + Math.random() * 0.4,
        size: 2 + Math.random() * 3,
        phase: Math.random() * Math.PI * 2,
      });
    }

    this.rings = [];
    for (let i = 0; i < 4; i++) {
      this.rings.push({
        radius: 100 + i * 25,
        phase: (Math.PI * 2 * i) / 4,
        amplitude: 3 + i * 2,
      });
    }

    this.animate();
  }

  setState(state) {
    this.state = state;
  }

  setAudioLevel(level) {
    this.targetAudioLevel = Math.min(1, level);
  }

  animate() {
    this.t += 0.016;
    this.audioLevel += (this.targetAudioLevel - this.audioLevel) * 0.15;
    this.targetAudioLevel *= 0.95;

    this.draw();
    requestAnimationFrame(() => this.animate());
  }

  draw() {
    const { ctx, w, h, cx, cy, t, state, audioLevel } = this;
    ctx.clearRect(0, 0, w, h);

    // Parameters per state
    let baseGlow, pulseSpeed, pulseAmount, particleSpeed, ringAlpha;
    switch (state) {
      case 'idle':
        baseGlow = 0.15;
        pulseSpeed = 0.8;
        pulseAmount = 0.08;
        particleSpeed = 0.3;
        ringAlpha = 0.05;
        break;
      case 'listening':
        baseGlow = 0.25;
        pulseSpeed = 1.2;
        pulseAmount = 0.12;
        particleSpeed = 0.5;
        ringAlpha = 0.1;
        break;
      case 'speaking':
        baseGlow = 0.3 + audioLevel * 0.4;
        pulseSpeed = 2 + audioLevel * 3;
        pulseAmount = 0.15 + audioLevel * 0.25;
        particleSpeed = 0.8 + audioLevel * 1.5;
        ringAlpha = 0.15 + audioLevel * 0.3;
        break;
      default:
        baseGlow = 0.15;
        pulseSpeed = 0.8;
        pulseAmount = 0.08;
        particleSpeed = 0.3;
        ringAlpha = 0.05;
    }

    const pulse = Math.sin(t * pulseSpeed) * pulseAmount;
    const coreRadius = 80 * (1 + pulse);

    // Outer glow
    const glowGrad = ctx.createRadialGradient(cx, cy, coreRadius * 0.5, cx, cy, coreRadius * 3);
    glowGrad.addColorStop(0, `rgba(255, 82, 0, ${baseGlow})`);
    glowGrad.addColorStop(0.5, `rgba(255, 82, 0, ${baseGlow * 0.3})`);
    glowGrad.addColorStop(1, 'rgba(255, 82, 0, 0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, w, h);

    // Rings
    for (const ring of this.rings) {
      const r = ring.radius * (1 + pulse * 0.5) + Math.sin(t * pulseSpeed + ring.phase) * ring.amplitude;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 82, 0, ${ringAlpha})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Particles
    for (const p of this.particles) {
      p.angle += p.speed * particleSpeed * 0.016;
      const wobble = Math.sin(t * 2 + p.phase) * 8;
      const pr = p.radius + wobble + pulse * 20;
      const px = cx + Math.cos(p.angle) * pr;
      const py = cy + Math.sin(p.angle) * pr;

      const alpha = state === 'speaking' ? 0.4 + audioLevel * 0.5 : state === 'listening' ? 0.3 : 0.15;
      ctx.beginPath();
      ctx.arc(px, py, p.size * (1 + pulse), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 82, 0, ${alpha})`;
      ctx.fill();
    }

    // Core orb
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius);
    coreGrad.addColorStop(0, `rgba(255, 120, 40, ${0.8 + pulse * 0.2})`);
    coreGrad.addColorStop(0.6, `rgba(255, 82, 0, ${0.6 + pulse * 0.2})`);
    coreGrad.addColorStop(1, 'rgba(255, 82, 0, 0)');
    ctx.beginPath();
    ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
    ctx.fillStyle = coreGrad;
    ctx.fill();

    // Inner bright spot
    const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius * 0.5);
    innerGrad.addColorStop(0, 'rgba(255, 200, 150, 0.6)');
    innerGrad.addColorStop(1, 'rgba(255, 150, 80, 0)');
    ctx.beginPath();
    ctx.arc(cx, cy, coreRadius * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = innerGrad;
    ctx.fill();
  }
}
