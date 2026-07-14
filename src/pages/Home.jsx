import { useCallback, useEffect, useRef, useState } from "react";

const COLORS = { coral: "#ff5b45", ink: "#17213f", cyan: "#20d8ee", yellow: "#ffd62e" };

export default function Home() {
  const canvasRef = useRef(null);
  const phaseRef = useRef("menu");
  const [phase, setPhaseState] = useState("menu");
  const [score, setScore] = useState(0);
  const [coins, setCoins] = useState(0);
  const [best, setBest] = useState(0);
  const game = useRef({
    lane: 0, laneVisual: 0, y: 0, vy: 0, rolling: 0,
    distance: 0, speed: 0.34, score: 0, coins: 0,
    items: [], spawnAt: 12, flash: 0
  });

  const setPhase = (p) => { phaseRef.current = p; setPhaseState(p); };

  useEffect(() => {
    setBest(Number(localStorage.getItem("metro-rush-best") || 0));
  }, []);

  const start = useCallback(() => {
    game.current = {
      lane: 0, laneVisual: 0, y: 0, vy: 0, rolling: 0,
      distance: 0, speed: 0.34, score: 0, coins: 0,
      items: [], spawnAt: 10, flash: 0
    };
    setScore(0); setCoins(0); setPhase("playing");
  }, []);

  const move = useCallback((action) => {
    const g = game.current;
    if (phaseRef.current !== "playing") return;
    if (action === "left") g.lane = Math.max(-1, g.lane - 1);
    if (action === "right") g.lane = Math.min(1, g.lane + 1);
    if (action === "jump" && g.y === 0) g.vy = 12.5;
    if (action === "roll" && g.y === 0) g.rolling = 0.65;
  }, []);

  useEffect(() => {
    const key = (e) => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) e.preventDefault();
      if ((phaseRef.current === "menu" || phaseRef.current === "over") && (e.key === " " || e.key === "Enter")) return start();
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") move("left");
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") move("right");
      if (e.key === "ArrowUp" || e.key.toLowerCase() === "w" || e.key === " ") move("jump");
      if (e.key === "ArrowDown" || e.key.toLowerCase() === "s") move("roll");
      if (e.key.toLowerCase() === "p" && phaseRef.current === "playing") setPhase("paused");
      else if (e.key.toLowerCase() === "p" && phaseRef.current === "paused") setPhase("playing");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [move, start]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf = 0, last = performance.now(), touchX = 0, touchY = 0;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = r.width * devicePixelRatio;
      canvas.height = r.height * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const down = (e) => { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; };
    const up = (e) => {
      const t = e.changedTouches[0], dx = t.clientX - touchX, dy = t.clientY - touchY;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
      if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? "right" : "left");
      else move(dy < 0 ? "jump" : "roll");
    };
    canvas.addEventListener("touchstart", down, { passive: true });
    canvas.addEventListener("touchend", up, { passive: true });

    const rr = (x, y, w, h, r, fill) => {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fillStyle = fill;
      ctx.fill();
    };

    const project = (lane, z, w, h) => {
      const W = canvas.clientWidth, H = canvas.clientHeight;
      const horizon = H * 0.25;
      const p = Math.max(0, 1 - z / 100);
      const scale = 0.15 + p * 1.05;
      return {
        x: W / 2 + lane * (W * 0.25) * p - w * scale / 2,
        y: horizon + (H - horizon) * (p * p) - h * scale,
        w: w * scale, h: h * scale, scale, p
      };
    };

    const draw = (dt) => {
      const W = canvas.clientWidth, H = canvas.clientHeight;
      const g = game.current;
      const playing = phaseRef.current === "playing";

      if (playing) {
        g.distance += g.speed * dt * 60;
        g.speed = Math.min(0.72, 0.34 + g.distance / 9000);
        g.score = Math.floor(g.distance * 12 + g.coins * 75);
        g.laneVisual += (g.lane - g.laneVisual) * Math.min(1, dt * 13);

        if (g.vy !== 0 || g.y > 0) {
          g.y += g.vy * dt * 5.8;
          g.vy -= 34 * dt;
          if (g.y < 0) { g.y = 0; g.vy = 0; }
        }
        if (g.rolling > 0) g.rolling -= dt;

        if (g.distance > g.spawnAt) {
          const safe = Math.floor(Math.random() * 3) - 1;
          for (let lane = -1; lane <= 1; lane++) {
            if (lane !== safe && Math.random() > 0.25)
              g.items.push({ lane, z: 100, type: Math.random() > 0.56 ? "barrier" : "train" });
          }
          for (let i = 0; i < 5; i++)
            g.items.push({ lane: safe, z: 100 + i * 7, type: "coin" });
          g.spawnAt = g.distance + 20 + Math.random() * 15;
        }

        for (const o of g.items) o.z -= g.speed * dt * 75;

        for (const o of g.items) {
          if (o.hit || o.z > 8 || o.z < 0 || Math.abs(o.lane - g.laneVisual) > 0.38) continue;
          if (o.type === "coin") {
            o.hit = true;
            g.coins++;
          } else {
            const clear = o.type === "barrier" ? g.y > 25 : g.rolling > 0;
            if (!clear) {
              o.hit = true;
              g.flash = 1;
              const b = Math.max(best, g.score);
              localStorage.setItem("metro-rush-best", String(b));
              setBest(b);
              setScore(g.score);
              setCoins(g.coins);
              setPhase("over");
            }
          }
        }

        g.items = g.items.filter(o => o.z > -10 && !o.hit);
        setScore(g.score);
        setCoins(g.coins);
      }

      // Sky
      ctx.clearRect(0, 0, W, H);
      const sky = ctx.createLinearGradient(0, 0, 0, H * 0.55);
      sky.addColorStop(0, "#48c8ff");
      sky.addColorStop(1, "#ffd4b0");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // Sun
      ctx.fillStyle = "#fff4de";
      ctx.beginPath();
      ctx.arc(W * 0.78, H * 0.12, W * 0.11, 0, Math.PI * 2);
      ctx.fill();

      // Buildings
      for (let i = 0; i < 12; i++) {
        const bw = W * (0.07 + (i % 3) * 0.025);
        const bh = H * (0.12 + (i % 5) * 0.025);
        ctx.fillStyle = i % 2 ? "#5877a8" : "#6f8bbc";
        ctx.fillRect(i * W / 11 - bw / 2, H * 0.25 - bh, bw, bh);
        ctx.fillStyle = "#9ee7ff";
        for (let y = 0; y < 3; y++)
          for (let x = 0; x < 2; x++)
            ctx.fillRect(i * W / 11 - bw / 3 + x * bw * 0.36, H * 0.25 - bh + 12 + y * 18, 5, 8);
      }

      // Ground/tunnel
      ctx.fillStyle = "#26334e";
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.lineTo(W * 0.38, H * 0.25);
      ctx.lineTo(W * 0.62, H * 0.25);
      ctx.lineTo(W, H);
      ctx.fill();

      // Lane lines
      for (let lane = -1; lane <= 1; lane++) {
        ctx.strokeStyle = "#d9e1ec";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(W / 2 + lane * W * 0.035, H * 0.25);
        ctx.lineTo(W / 2 + lane * W * 0.25, H);
        ctx.stroke();
        ctx.strokeStyle = "#657086";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(W / 2 + lane * W * 0.018, H * 0.25);
        ctx.lineTo(W / 2 + lane * W * 0.19, H);
        ctx.stroke();
      }

      // Cross-ties
      for (let i = 0; i < 15; i++) {
        const z = (i * 8 - (g.distance * 2) % 8 + 8) % 120;
        const p = Math.max(0, 1 - z / 120);
        const y = H * 0.25 + (H * 0.75) * p * p;
        ctx.strokeStyle = "#697084";
        ctx.lineWidth = 2 + p * 8;
        ctx.beginPath();
        ctx.moveTo(W / 2 - W * 0.31 * p, y);
        ctx.lineTo(W / 2 + W * 0.31 * p, y);
        ctx.stroke();
      }

      // Items
      g.items.slice().sort((a, b) => b.z - a.z).forEach(o => {
        const q = project(o.lane, o.z,
          o.type === "coin" ? 28 : o.type === "barrier" ? 66 : 94,
          o.type === "coin" ? 28 : o.type === "barrier" ? 56 : 160);
        if (q.p <= 0) return;

        if (o.type === "coin") {
          ctx.fillStyle = "#ffb800";
          ctx.beginPath();
          ctx.arc(q.x + q.w / 2, q.y + q.h / 2, q.w / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#fff16a";
          ctx.lineWidth = 3 * q.scale;
          ctx.stroke();
          ctx.fillStyle = "#fff16a";
          ctx.font = `${Math.max(6, 15 * q.scale)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText("\u2605", q.x + q.w / 2, q.y + q.h * 0.72);
        } else if (o.type === "barrier") {
          rr(q.x, q.y, q.w, q.h, 5 * q.scale, "#f6f0dd");
          ctx.fillStyle = COLORS.coral;
          for (let i = 0; i < 3; i++) {
            ctx.save();
            ctx.translate(q.x + i * q.w / 3, q.y);
            ctx.transform(1, 0, -0.6, 1, 0, 0);
            ctx.fillRect(0, 0, q.w / 5, q.h);
            ctx.restore();
          }
          rr(q.x + q.w * 0.08, q.y + q.h * 0.72, q.w * 0.12, q.h * 0.45, 2, "#17213f");
          rr(q.x + q.w * 0.8, q.y + q.h * 0.72, q.w * 0.12, q.h * 0.45, 2, "#17213f");
        } else {
          rr(q.x, q.y, q.w, q.h, 10 * q.scale, "#e9434e");
          rr(q.x + q.w * 0.08, q.y + q.h * 0.1, q.w * 0.84, q.h * 0.38, 5 * q.scale, "#a7ecff");
          ctx.fillStyle = "#17213f";
          ctx.fillRect(q.x + q.w * 0.46, q.y, q.w * 0.08, q.h);
          ctx.fillStyle = "#ffe236";
          ctx.beginPath();
          ctx.arc(q.x + q.w * 0.23, q.y + q.h * 0.78, 5 * q.scale, 0, 7);
          ctx.arc(q.x + q.w * 0.77, q.y + q.h * 0.78, 5 * q.scale, 0, 7);
          ctx.fill();
        }
      });

      // Player
      const px = W / 2 + g.laneVisual * W * 0.25;
      const ground = H * 0.82;
      const jump = g.y * H / 190;
      const rolling = g.rolling > 0;

      ctx.save();
      ctx.translate(px, ground - jump);
      if (rolling) { ctx.rotate(-0.8); ctx.scale(1, 0.65); }
      ctx.strokeStyle = "#17213f";
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-8, -35);
      ctx.lineTo(-18, 0);
      ctx.moveTo(8, -35);
      ctx.lineTo(22, 0);
      ctx.stroke();
      rr(-22, -88, 44, 58, 14, COLORS.coral);
      ctx.fillStyle = "#ffd2a6";
      ctx.beginPath();
      ctx.arc(0, -104, 18, 0, 7);
      ctx.fill();
      ctx.fillStyle = "#17213f";
      ctx.beginPath();
      ctx.arc(-3, -111, 20, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = COLORS.cyan;
      ctx.fillRect(-21, -35, 18, 8);
      ctx.fillRect(8, -35, 18, 8);
      ctx.restore();

      // Flash
      if (g.flash > 0) {
        ctx.fillStyle = `rgba(255,70,60,${g.flash})`;
        ctx.fillRect(0, 0, W, H);
        g.flash -= dt * 3;
      }

      raf = requestAnimationFrame(loop);
    };

    const loop = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      draw(dt);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("touchstart", down);
      canvas.removeEventListener("touchend", up);
    };
  }, [best, move]);

  return (
    <div className="game-shell">
      <canvas ref={canvasRef} />
      <div className="hud">
        <div className="brand">
          <span>METRO</span>
          <strong>RUSH</strong>
        </div>
        <div className="stats">
          <div><small>SCORE</small><b>{score}</b></div>
          <div><small>COINS</small><b>{coins}</b></div>
          <div><small>BEST</small><b>{best}</b></div>
        </div>
        {phase === "playing" && (
          <button className="pause" onClick={() => setPhase("paused")}>II</button>
        )}
      </div>

      {phase === "menu" && (
        <div className="panel menu">
          <span className="tag">NEW RUNNER</span>
          <h1>OWN THE <em>UNDERGROUND</em></h1>
          <p>Dodge trains. Grab coins. Rule the rails.</p>
          <button className="play" onClick={start}>{"\u25B6"} RUN NOW</button>
          <div className="how">
            <span>{"\u2194"} CHANGE LANE</span>
            <span>{"\u2191"} JUMP</span>
            <span>{"\u2193"} ROLL</span>
          </div>
        </div>
      )}

      {phase === "paused" && (
        <div className="panel compact">
          <span className="tag">TAKE FIVE</span>
          <h2>PAUSED</h2>
          <button className="play" onClick={() => setPhase("playing")}>KEEP RUNNING</button>
          <button className="text-btn" onClick={() => setPhase("menu")}>QUIT RUN</button>
        </div>
      )}

      {phase === "over" && (
        <div className="panel compact">
          <span className="tag danger">BUSTED!</span>
          <h2>{score.toLocaleString()}</h2>
          <p>BEST {best.toLocaleString()} {"\u00B7"} COINS {coins}</p>
          <button className="play" onClick={start}>RUN AGAIN</button>
          <button className="text-btn" onClick={() => setPhase("menu")}>BACK TO HOME</button>
        </div>
      )}

      <footer>
        <span className="swipe">SWIPE TO MOVE {"\u00B7"} TAP {"\u2191"} JUMP</span>
        <span>METRO RUSH</span>
      </footer>
    </div>
  );
}