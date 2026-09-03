(function () {
  const canvas = document.createElement("canvas");
  canvas.id = "__shader_bg__";
  Object.assign(canvas.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    zIndex: "0",
    pointerEvents: "none",
    display: "block",
    filter: "blur(2.5px)",
    transform: "translateZ(0)",
  });
  document.body.prepend(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }

  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const COUNT = 260;
  const SPEED = 0.028;
  const TRAIL_MUL = 12;
  const CORE_R = 0.02;
  let W = 0, H = 0, CX = 0, CY = 0, MAXR = 0;

  function resize() {
    W = window.innerWidth * DPR;
    H = window.innerHeight * DPR;
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    CX = W / 2;
    CY = H / 2;
    MAXR = Math.hypot(CX, CY);
  }
  resize();
  window.addEventListener("resize", resize);

  function spawn(initial) {
    return {
      a: Math.random() * Math.PI * 2,
      r: initial ? Math.random() : Math.random() * CORE_R + 0.001,
      d: 0.35 + Math.random() * 0.65,
      hueTint: Math.random() < 0.18,
    };
  }

  const P = new Array(COUNT).fill(0).map(() => spawn(true));

  function frame() {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(6, 6, 10, 0.28)";
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < COUNT; i++) {
      const p = P[i];
      const prevR = p.r;
      p.r *= 1 + SPEED * (0.6 + p.d);

      if (p.r > 1.05) {
        P[i] = spawn(false);
        continue;
      }

      const cosA = Math.cos(p.a);
      const sinA = Math.sin(p.a);
      const r0 = prevR * MAXR;
      const r1 = p.r * MAXR;

      const step = (r1 - r0) * TRAIL_MUL;
      const x0 = CX + cosA * (r1 - step);
      const y0 = CY + sinA * (r1 - step);
      const x1 = CX + cosA * r1;
      const y1 = CY + sinA * r1;

      const t = p.r;
      const alpha = Math.min(0.9, 0.05 + t * 0.85 * p.d);
      const width = (0.4 + t * 2.2) * p.d * DPR;

      const grad = ctx.createLinearGradient(x0, y0, x1, y1);
      const core = p.hueTint
        ? "rgba(170, 210, 255, "
        : "rgba(255, 250, 240, ";
      grad.addColorStop(0, core + "0)");
      grad.addColorStop(0.55, core + (alpha * 0.35).toFixed(3) + ")");
      grad.addColorStop(1, core + alpha.toFixed(3) + ")");

      ctx.strokeStyle = grad;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();

      if (t > 0.35) {
        const headR = width * 1.2;
        ctx.fillStyle = core + Math.min(1, alpha * 1.6).toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(x1, y1, headR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    raf = requestAnimationFrame(frame);
  }

  let raf = requestAnimationFrame(frame);

  window.__shaderBg__ = {
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.remove();
      delete window.__shaderBg__;
    },
  };
})();
