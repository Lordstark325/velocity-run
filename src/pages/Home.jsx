import { useCallback, useEffect, useRef, useState } from "react";

const COLORS = { coral: "#ff5b45", ink: "#17213f", cyan: "#20d8ee", yellow: "#ffd62e" };

export default function Home() {
  const canvasRef = useRef(null);
  const phaseRef = useRef("menu");
  const audioRef = useRef(null);
  const soundOnRef = useRef(true);
  const [phase, setPhaseState] = useState("menu");
  const [score, setScore] = useState(0);
  const [coins, setCoins] = useState(0);
  const [best, setBest] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [powers, setPowers] = useState({ magnet: 0, shield: 0, mult: 0 });
  const game = useRef({
    lane: 0, laneVisual: 0, y: 0, vy: 0, rolling: 0,
    distance: 0, speed: 0.34, score: 0, coins: 0,
    items: [], particles: [], spawnAt: 12, flash: 0, shake: 0,
    powers: { magnet: 0, shield: 0, mult: 0 }, hudTimer: 0, dust: 0
  });

  const setPhase = (p) => { phaseRef.current = p; setPhaseState(p); };

  useEffect(() => {
    setBest(Number(localStorage.getItem("metro-rush-best") || 0));
  }, []);

  const playSound = useCallback((kind) => {
    if (!soundOnRef.current || typeof window === "undefined") return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const audio = audioRef.current || new AudioContext();
    audioRef.current = audio;
    if (audio.state === "suspended") audio.resume();
    const notes = {
      start: [220, 0.08, "square", 0.035], coin: [880, 0.05, "sine", 0.045],
      power: [520, 0.16, "triangle", 0.06], jump: [310, 0.09, "triangle", 0.035],
      roll: [150, 0.08, "square", 0.025], shield: [120, 0.18, "sawtooth", 0.05],
      crash: [70, 0.28, "sawtooth", 0.07]
    };
    const [frequency, duration, type, volume] = notes[kind] || notes.coin;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(45, frequency * 0.72), audio.currentTime + duration);
    gain.gain.setValueAtTime(volume, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
    oscillator.connect(gain); gain.connect(audio.destination);
    oscillator.start(); oscillator.stop(audio.currentTime + duration);
  }, []);

  const feedback = useCallback((kind) => {
    playSound(kind);
    const patterns = { coin: 8, power: [18, 20, 18], jump: 10, roll: 10, shield: [30, 25, 30], crash: [70, 35, 90] };
    if (navigator.vibrate && patterns[kind]) navigator.vibrate(patterns[kind]);
  }, [playSound]);

  const toggleSound = () => {
    soundOnRef.current = !soundOnRef.current;
    setSoundOn(soundOnRef.current);
    if (soundOnRef.current) playSound("start");
  };

  const start = useCallback(() => {
    game.current = {
      lane: 0, laneVisual: 0, y: 0, vy: 0, rolling: 0,
      distance: 0, speed: 0.34, score: 0, coins: 0,
      items: [], particles: [], spawnAt: 10, flash: 0, shake: 0,
      powers: { magnet: 0, shield: 0, mult: 0 }, hudTimer: 0, dust: 0
    };
    setScore(0); setCoins(0); setPowers({ magnet: 0, shield: 0, mult: 0 });
    playSound("start");
    setPhase("playing");
  }, [playSound]);

  const move = useCallback((action) => {
    const g = game.current;
    if (phaseRef.current !== "playing") return;
    if (action === "left") g.lane = Math.max(-1, g.lane - 1);
    if (action === "right") g.lane = Math.min(1, g.lane + 1);
    if (action === "jump" && g.y === 0) { g.vy = 12.5; g.dust = 1; feedback("jump"); }
    if (action === "roll" && g.y === 0) { g.rolling = 0.65; g.dust = 1; feedback("roll"); }
  }, [feedback]);

  useEffect(() => {
    const pauseHiddenGame = () => {
      if (document.hidden && phaseRef.current === "playing") setPhase("paused");
    };
    document.addEventListener("visibilitychange", pauseHiddenGame);
    return () => document.removeEventListener("visibilitychange", pauseHiddenGame);
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

    const burst = (x, y, color, count = 10) => {
      const g = game.current;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.35;
        const force = 45 + Math.random() * 95;
        g.particles.push({
          x, y, color, life: 0.55 + Math.random() * 0.35,
          vx: Math.cos(angle) * force, vy: Math.sin(angle) * force - 35,
          size: 2.5 + Math.random() * 4
        });
      }
    };

    const draw = (dt) => {
      const W = canvas.clientWidth, H = canvas.clientHeight;
      const g = game.current;
      const playing = phaseRef.current === "playing";

      if (playing) {
        g.distance += g.speed * dt * 60;
        g.speed = Math.min(0.72, 0.34 + g.distance / 9000);
        const multiplier = g.powers.mult > 0 ? 2 : 1;
        g.score += g.speed * dt * 60 * 12 * multiplier;
        g.laneVisual += (g.lane - g.laneVisual) * Math.min(1, dt * 13);
        g.powers.magnet = Math.max(0, g.powers.magnet - dt);
        g.powers.shield = Math.max(0, g.powers.shield - dt);
        g.powers.mult = Math.max(0, g.powers.mult - dt);

        if (g.vy !== 0 || g.y > 0) {
          g.y += g.vy * dt * 5.8;
          g.vy -= 34 * dt;
          if (g.y < 0) { g.y = 0; g.vy = 0; }
        }
        if (g.rolling > 0) g.rolling -= dt;

        if (g.distance > g.spawnAt) {
          const lanes = [-1, 0, 1];
          const safe = Math.floor(Math.random() * 3) - 1;
          const pattern = Math.random();
          const blocked = lanes.filter(lane => lane !== safe);

          // Every pattern has one intentional solution: change lane, jump, or roll.
          blocked.forEach((lane, index) => {
            if (pattern > 0.32 || index === 0) g.items.push({ lane, z: 100, type: "train" });
          });
          if (pattern > 0.65) g.items.push({ lane: safe, z: 100, type: "barrier" });
          else if (pattern > 0.42) g.items.push({ lane: safe, z: 100, type: "overhead" });

          for (let i = 0; i < 5; i++) g.items.push({ lane: safe, z: 108 + i * 7, type: "coin" });

          if (Math.random() < 0.28) {
            const kinds = ["magnet", "shield", "mult"];
            g.items.push({ lane: safe, z: 148, type: "power", kind: kinds[Math.floor(Math.random() * kinds.length)] });
          }
          // Keep dangerous waves farther apart than their travel distance so
          // two individually fair patterns can never combine into a dead end.
          g.spawnAt = g.distance + 78 + Math.random() * 18;
        }

        for (const o of g.items) o.z -= g.speed * dt * 75;

        for (const o of g.items) {
          const magnetCatch = o.type === "coin" && g.powers.magnet > 0 && o.z < 18 && o.z > 0;
          if (o.hit || o.z > (magnetCatch ? 18 : 8) || o.z < 0 || (!magnetCatch && Math.abs(o.lane - g.laneVisual) > 0.38)) continue;
          if (o.type === "coin") {
            o.hit = true;
            g.coins++;
            g.score += 75 * multiplier;
            const q = project(o.lane, o.z, 28, 28);
            burst(q.x + q.w / 2, q.y + q.h / 2, COLORS.yellow, 9);
            feedback("coin");
          } else if (o.type === "power") {
            o.hit = true;
            g.powers[o.kind] = o.kind === "shield" ? 12 : 8;
            const q = project(o.lane, o.z, 44, 44);
            const color = o.kind === "magnet" ? COLORS.cyan : o.kind === "shield" ? "#7cf29a" : "#c88cff";
            burst(q.x + q.w / 2, q.y + q.h / 2, color, 18);
            g.shake = 0.18;
            feedback("power");
          } else {
            const clear = o.type === "barrier" ? g.y > 25 : o.type === "overhead" ? g.rolling > 0 : false;
            if (!clear) {
              o.hit = true;
              if (g.powers.shield > 0) {
                g.powers.shield = 0;
                g.flash = 0.45;
                g.shake = 0.55;
                burst(canvas.clientWidth / 2 + g.laneVisual * canvas.clientWidth * 0.25, canvas.clientHeight * 0.72, "#7cf29a", 24);
                feedback("shield");
              } else {
                g.flash = 1;
                g.shake = 0.8;
                const finalScore = Math.floor(g.score);
                const b = Math.max(best, finalScore);
                localStorage.setItem("metro-rush-best", String(b));
                setBest(b);
                setScore(finalScore);
                setCoins(g.coins);
                feedback("crash");
                setPhase("over");
              }
            }
          }
        }

        g.items = g.items.filter(o => o.z > -10 && !o.hit);
        g.hudTimer += dt;
        if (g.hudTimer > 0.08) {
          g.hudTimer = 0;
          setScore(Math.floor(g.score));
          setCoins(g.coins);
          setPowers({ ...g.powers });
        }
      }

      // Sky
      ctx.clearRect(0, 0, W, H);
      const shakeAmount = g.shake > 0 ? g.shake * 9 : 0;
      const shakeX = (Math.random() - 0.5) * shakeAmount;
      const shakeY = (Math.random() - 0.5) * shakeAmount;
      g.shake = Math.max(0, g.shake - dt * 2.8);
      ctx.save();
      ctx.translate(shakeX, shakeY);
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

      // Speed streaks appear gradually as the run accelerates.
      if (playing && g.speed > 0.43) {
        const intensity = Math.min(1, (g.speed - 0.43) / 0.24);
        ctx.strokeStyle = `rgba(190,241,255,${0.18 + intensity * 0.3})`;
        ctx.lineWidth = 1.5 + intensity * 2;
        for (let i = 0; i < 9; i++) {
          const seed = (i * 0.137 + g.distance * 0.018) % 1;
          const side = i % 2 ? 1 : -1;
          const x = W / 2 + side * W * (0.2 + seed * 0.34);
          const y = H * (0.3 + ((seed * 1.7) % 1) * 0.62);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + side * (8 + 18 * intensity), y + 22 + 40 * intensity); ctx.stroke();
        }
      }

      // Items
      g.items.slice().sort((a, b) => b.z - a.z).forEach(o => {
        const dimensions = o.type === "coin" ? [28, 28] :
          o.type === "power" ? [46, 46] :
          o.type === "barrier" ? [66, 56] :
          o.type === "overhead" ? [92, 118] : [94, 160];
        const q = project(o.lane, o.z, dimensions[0], dimensions[1]);
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
        } else if (o.type === "power") {
          const color = o.kind === "magnet" ? COLORS.cyan : o.kind === "shield" ? "#7cf29a" : "#c88cff";
          ctx.shadowColor = color; ctx.shadowBlur = 16 * q.scale;
          ctx.fillStyle = color;
          ctx.beginPath(); ctx.arc(q.x + q.w / 2, q.y + q.h / 2, q.w / 2, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = "#fff"; ctx.lineWidth = 3 * q.scale; ctx.stroke();
          ctx.fillStyle = COLORS.ink;
          ctx.font = `900 ${Math.max(7, 17 * q.scale)}px Arial`;
          ctx.textAlign = "center";
          ctx.fillText(o.kind === "magnet" ? "M" : o.kind === "shield" ? "S" : "×2", q.x + q.w / 2, q.y + q.h * 0.68);
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
        } else if (o.type === "overhead") {
          rr(q.x + q.w * 0.06, q.y, q.w * 0.12, q.h, 3 * q.scale, COLORS.ink);
          rr(q.x + q.w * 0.82, q.y, q.w * 0.12, q.h, 3 * q.scale, COLORS.ink);
          rr(q.x, q.y + q.h * 0.28, q.w, q.h * 0.34, 6 * q.scale, COLORS.yellow);
          ctx.fillStyle = COLORS.coral;
          for (let i = 0; i < 4; i++) ctx.fillRect(q.x + i * q.w * 0.27, q.y + q.h * 0.28, q.w * 0.11, q.h * 0.34);
          ctx.fillStyle = COLORS.ink;
          ctx.font = `900 ${Math.max(6, 13 * q.scale)}px Arial`;
          ctx.textAlign = "center";
          ctx.fillText("DUCK", q.x + q.w / 2, q.y + q.h * 0.5);
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

      if (g.dust > 0) {
        burst(W / 2 + g.laneVisual * W * 0.25, H * 0.82, "#d8edff", 8);
        g.dust = 0;
      }
      if (playing) {
        for (const particle of g.particles) {
          particle.life -= dt;
          particle.x += particle.vx * dt;
          particle.y += particle.vy * dt;
          particle.vy += 135 * dt;
          particle.vx *= 0.985;
        }
        g.particles = g.particles.filter(particle => particle.life > 0);
      }
      for (const particle of g.particles) {
        ctx.globalAlpha = Math.min(1, particle.life * 2);
        ctx.fillStyle = particle.color;
        ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Player — animated from the runner's distance so the stride accelerates
      // naturally with the game instead of looking like a static marker.
      const px = W / 2 + g.laneVisual * W * 0.25;
      const ground = H * 0.82;
      const jump = g.y * H / 190;
      const rolling = g.rolling > 0;
      const stride = playing ? Math.sin(g.distance * 0.55) : 0;
      const strideLift = playing && g.y === 0 ? Math.abs(Math.cos(g.distance * 0.55)) * 2.5 : 0;
      const laneLean = Math.max(-0.24, Math.min(0.24, (g.lane - g.laneVisual) * -0.3));

      // Contact shadow gives the jump and roll poses a stronger sense of height.
      ctx.save();
      ctx.globalAlpha = Math.max(0.16, 0.42 - jump / 180);
      ctx.fillStyle = "#080d1d";
      ctx.beginPath();
      ctx.ellipse(px, ground + 5, rolling ? 34 : 25, rolling ? 10 : 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (g.powers.shield > 0) {
        const pulse = 3 + Math.sin(g.distance * 0.35) * 2;
        ctx.strokeStyle = "rgba(124,242,154,.78)";
        ctx.lineWidth = pulse;
        ctx.beginPath(); ctx.ellipse(px, ground - jump - 62, 43, 72, 0, 0, Math.PI * 2); ctx.stroke();
      }
      if (g.powers.magnet > 0) {
        ctx.strokeStyle = "rgba(32,216,238,.56)";
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 8]);
        ctx.beginPath(); ctx.arc(px, ground - jump - 60, 58 + Math.sin(g.distance * 0.4) * 4, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }

      const limb = (x1, y1, x2, y2, x3, y3, color, width = 8) => {
        ctx.strokeStyle = COLORS.ink;
        ctx.lineWidth = width + 4;
        ctx.beginPath();
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.stroke();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.stroke();
      };

      ctx.save();
      ctx.translate(px, ground - jump - strideLift);
      ctx.rotate(laneLean);
      ctx.lineCap = "round";

      if (rolling) {
        ctx.rotate(-0.38);
        limb(-9, -43, -28, -23, -15, -4, "#34405f", 7);
        limb(8, -40, 29, -17, 18, 0, "#34405f", 7);
        rr(-29, -65, 58, 43, 18, COLORS.coral);
        rr(-26, -62, 12, 32, 7, "#ff846f");
        rr(-12, -73, 32, 22, 11, "#283451");
        ctx.fillStyle = "#ffd2a6";
        ctx.beginPath(); ctx.arc(17, -63, 16, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = COLORS.ink;
        ctx.beginPath(); ctx.arc(14, -69, 17, Math.PI, Math.PI * 2); ctx.fill();
      } else {
        const airborne = g.y > 0;
        const legSwing = airborne ? 0.45 : stride;
        const armSwing = airborne ? -0.35 : -stride;

        // Back leg first, then front leg to create a readable overlapping run cycle.
        limb(-8, -35, -13 - legSwing * 7, -17, -20 - legSwing * 17, 0, "#34405f", 7);
        limb(8, -35, 12 + legSwing * 7, -18, 19 + legSwing * 18, 0, "#425071", 8);
        rr(-28 - legSwing * 17, -5, 20, 8, 4, COLORS.cyan);
        rr(9 + legSwing * 18, -5, 21, 8, 4, "#43e6f3");

        // Backpack and arms sit behind the hoodie.
        rr(-28, -83, 17, 44, 8, "#25314e");
        rr(-25, -77, 11, 22, 5, "#35c7df");
        limb(-18, -77, -28 - armSwing * 8, -56, -23 - armSwing * 19, -35, COLORS.coral, 7);
        limb(18, -77, 28 + armSwing * 8, -57, 23 + armSwing * 19, -36, "#ff735d", 7);
        ctx.fillStyle = "#ffd2a6";
        ctx.beginPath(); ctx.arc(-23 - armSwing * 19, -35, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(23 + armSwing * 19, -36, 5, 0, Math.PI * 2); ctx.fill();

        // Hoodie with rim light and a small logo gives the character more identity.
        rr(-23, -91, 46, 61, 14, COLORS.coral);
        rr(-20, -87, 9, 50, 5, "#ff806b");
        ctx.fillStyle = COLORS.yellow;
        ctx.beginPath(); ctx.arc(9, -61, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#fff0d9";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-6, -85); ctx.lineTo(-4, -75); ctx.moveTo(6, -85); ctx.lineTo(4, -75); ctx.stroke();

        // Neck, head, ears, hair and cap — all drawn from the rear camera angle.
        rr(-7, -101, 14, 15, 5, "#efb883");
        ctx.fillStyle = "#ffd2a6";
        ctx.beginPath(); ctx.arc(0, -112, 20, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#efb883";
        ctx.beginPath(); ctx.arc(-20, -111, 4, 0, Math.PI * 2); ctx.arc(20, -111, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = COLORS.ink;
        ctx.beginPath(); ctx.arc(-2, -119, 21, Math.PI, Math.PI * 2); ctx.lineTo(18, -112); ctx.quadraticCurveTo(3, -117, -19, -111); ctx.fill();
        rr(-19, -126, 38, 10, 5, COLORS.cyan);
        rr(10, -121, 19, 5, 3, "#0fb0ca");
      }
      ctx.restore();
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
  }, [best, feedback, move]);

  return (
    <div className="game-shell">
      <canvas ref={canvasRef} />
      <div className="hud">
        <div className="brand">
          <span>METRO</span>
          <strong>RUSH</strong>
        </div>
        <div className="stats" aria-label="Run statistics">
          <div className="stat score-stat"><span className="stat-icon">⚡</span><span><small>SCORE</small><b>{String(score).padStart(6, "0")}</b></span></div>
          <div className="stat"><span className="stat-icon coin-icon">★</span><span><small>COINS</small><b>{coins}</b></span></div>
          <div className="stat"><span className="stat-icon best-icon">◆</span><span><small>BEST</small><b>{best.toLocaleString()}</b></span></div>
        </div>
        {phase === "playing" && (
          <button className="pause" aria-label="Pause run" onClick={() => setPhase("paused")}><span>Ⅱ</span></button>
        )}
        {phase === "playing" && <div className="run-live"><i /> RUN LIVE</div>}
        <button className={`sound-toggle ${phase === "playing" ? "during-run" : ""}`} aria-label={soundOn ? "Mute sound" : "Enable sound"} onClick={toggleSound}>
          {soundOn ? "♪" : "×"}
        </button>
      </div>

      {phase === "playing" && (powers.magnet > 0 || powers.shield > 0 || powers.mult > 0) && (
        <div className="power-tray" aria-label="Active power-ups">
          {powers.magnet > 0 && <span className="magnet-power"><b>M</b> MAGNET <small>{Math.ceil(powers.magnet)}s</small></span>}
          {powers.shield > 0 && <span className="shield-power"><b>S</b> SHIELD <small>{Math.ceil(powers.shield)}s</small></span>}
          {powers.mult > 0 && <span className="mult-power"><b>×2</b> SCORE <small>{Math.ceil(powers.mult)}s</small></span>}
        </div>
      )}

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
