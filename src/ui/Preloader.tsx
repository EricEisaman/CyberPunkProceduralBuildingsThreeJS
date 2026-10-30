/**
 * Boot screen: a night skyline of the three buildings whose windows light up
 * as loading progresses, a glitching title, a neon progress bar, the current
 * step and a short boot log. Fades out when the city is ready.
 */
import { useMemo } from "react";

export interface BootState {
  progress: number; // 0..1
  step: string;
  log: string[];
  active: number; // which building is being built: 0 hive, 1 arcology, 2 capsule, -1 none
  done: boolean;
}

const NEON = ["#ff2a6d", "#05d9e8", "#ffd23f", "#ff6ec7", "#7b61ff", "#ff9e3d", "#e8f4ff", "#ffb070"];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Win { x: number; y: number; w: number; h: number; at: number; c: string; round?: boolean }

/** windows for the three silhouettes, each with the progress at which it lights */
function useWindows() {
  return useMemo(() => {
    const r = rng(7);
    const wins: Win[][] = [[], [], []];
    // HIVE: lumpy block, 6 x 11 windows
    for (let f = 0; f < 11; f++) for (let b = 0; b < 6; b++) {
      if (r() < 0.12) continue;
      wins[0].push({ x: 34 + b * 15 + (r() - 0.5) * 3, y: 112 + f * 13, w: 8 + r() * 3, h: 6, at: r() * 0.95, c: NEON[Math.floor(r() * NEON.length)] });
    }
    // ARCOLOGY: tall tower, 7 x 26 office windows
    for (let f = 0; f < 26; f++) for (let b = 0; b < 7; b++) {
      if (r() < 0.35) continue;
      const inset = f < 13 ? 0 : f < 20 ? 6 : 12;
      if (b * 9 < inset - 2 || b * 9 > 54 - inset) continue;
      wins[1].push({ x: 154 + b * 9, y: 40 + f * 9.4, w: 6, h: 5, at: r() * 0.95, c: r() < 0.7 ? "#cfe6ff" : "#ffd9a0" });
    }
    // CAPSULE: two cores of round portholes
    for (let f = 0; f < 10; f++) for (let b = 0; b < 4; b++) {
      if (r() < 0.2) continue;
      wins[2].push({ x: 252 + b * 15 + (b > 1 ? 10 : 0), y: 92 + f * 14, w: 5, h: 5, at: r() * 0.95, c: NEON[Math.floor(r() * NEON.length)], round: true });
    }
    return wins;
  }, []);
}

export function Preloader({ state }: { state: BootState }) {
  const wins = useWindows();
  const pct = Math.round(state.progress * 100);
  return (
    <div className={state.done ? "preloader out" : "preloader"} aria-busy={!state.done} aria-label="Loading">
      <div className="pl-scan" />
      <svg className="pl-city" viewBox="0 0 360 270" role="img" aria-label="The three buildings lighting up">
        <defs>
          <linearGradient id="pl-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#12101e" />
            <stop offset="1" stopColor="#07060c" />
          </linearGradient>
        </defs>
        {/* skyline behind */}
        {[10, 58, 120, 214, 300, 330].map((x, i) => (
          <rect key={i} x={x} y={150 - (i % 3) * 22} width={30} height={120} fill="#0b0a14" />
        ))}
        {/* HIVE */}
        <g className={state.active === 0 ? "pl-b on" : "pl-b"}>
          <path d="M30 106 h96 v4 h3 v40 h-3 v118 h-96 v-40 h-4 v-40 h4z" fill="url(#pl-fade)" />
          <rect x="44" y="92" width="40" height="12" fill="#0d0c16" />
          <text x="64" y="101" textAnchor="middle" className="pl-neon" fill="#ff2a6d">SYNTH</text>
        </g>
        {/* ARCOLOGY */}
        <g className={state.active === 1 ? "pl-b on" : "pl-b"}>
          <path d="M150 284 V160 l4 -4 V100 l6 -6 V40 l8 -8 h30 l8 8 v54 l6 6 v56 l4 4 v128z" fill="url(#pl-fade)" />
          <ellipse cx="183" cy="22" rx="20" ry="4" fill="none" stroke="#ffd23f" strokeWidth="1.4" className="pl-ring" />
          <line x1="183" y1="2" x2="183" y2="32" stroke="#555" strokeWidth="1" />
          <circle cx="183" cy="3" r="1.6" fill="#ff1a1a" className="pl-beacon" />
          <line x1="151" y1="150" x2="151" y2="270" stroke="#05d9e8" strokeWidth="1" className="pl-led" />
          <line x1="215" y1="150" x2="215" y2="270" stroke="#05d9e8" strokeWidth="1" className="pl-led" />
        </g>
        {/* CAPSULE */}
        <g className={state.active === 2 ? "pl-b on" : "pl-b"}>
          <rect x="246" y="86" width="34" height="150" fill="url(#pl-fade)" />
          <rect x="286" y="96" width="34" height="140" fill="url(#pl-fade)" />
          <rect x="236" y="232" width="96" height="38" fill="#100e1a" />
          <text x="284" y="246" textAnchor="middle" className="pl-neon" fill="#05d9e8">KARAOKE</text>
          {Array.from({ length: 9 }).map((_, i) => (
            <circle key={i} cx={242 + i * 10.5} cy={256} r="2" fill="#ff5a2a" className="pl-lantern" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </g>
        {/* windows */}
        {wins.map((list, bi) =>
          list.map((w, i) => {
            const lit = state.progress >= w.at;
            return w.round ? (
              <circle key={`${bi}-${i}`} cx={w.x + 2.5} cy={w.y + 2.5} r={2.6} fill={lit ? w.c : "#16141f"} className={lit ? "pl-w lit" : "pl-w"} />
            ) : (
              <rect key={`${bi}-${i}`} x={w.x} y={w.y} width={w.w} height={w.h} fill={lit ? w.c : "#16141f"} className={lit ? "pl-w lit" : "pl-w"} />
            );
          }),
        )}
        {/* wet street reflection */}
        <rect x="0" y="268" width="360" height="2" fill="#ff2a6d" opacity="0.25" />
      </svg>

      <div className="pl-title" data-text="NEON//DISTRICT">NEON<span>//</span>DISTRICT</div>
      <div className="pl-sub">procedural cyberpunk buildings</div>

      <div className="pl-bar">
        <div className="pl-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="pl-row">
        <span className="pl-step">{state.step}<i className="pl-caret">_</i></span>
        <span className="pl-pct">{String(pct).padStart(3, "0")}%</span>
      </div>
      <ul className="pl-log">
        {state.log.slice(-4).map((l, i) => <li key={i + l}>&gt; {l}</li>)}
      </ul>
    </div>
  );
}
