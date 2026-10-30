import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as RPointerEvent } from "react";
import { DEFAULT_ATMOS, Engine } from "./engine/Engine";
import type { Atmos, ShotName } from "./engine/Engine";
import { PALETTES } from "./gen/materials";
import type { PaletteName } from "./gen/materials";
import { loadFonts } from "./gen/signs";
import { preloadTextures } from "./gen/textures";
import { TYPE_INFO } from "./gen/types";
import { Preloader } from "./ui/Preloader";
import { ContactCard } from "./ui/ContactCard";
import type { BootState } from "./ui/Preloader";
import type { BuildingType, OptDef, Params } from "./gen/types";
import type { TextSpec } from "./gen/builder";

const TYPES: BuildingType[] = ["hive", "arcology", "capsule", "lineup"];
const SHOTS: [ShotName, string][] = [["hero", "Hero"], ["street", "Street"], ["worm", "Worm's-eye"], ["detail", "Detail"], ["roof", "Roof"], ["aerial", "Aerial"]];

function paramsFor(type: BuildingType, seed: number, palette: PaletteName, texts: Record<string, string> = {}): Params {
  return {
    type, seed, palette, floors: 12, width: 6, depth: 4, clutter: 0.7, signs: 0.8, ac: 0.6, cables: 0.6,
    ...TYPE_INFO[type].defaults, opts: {}, texts,
  } as Params;
}

/** a random value for every style option: one click, a new variation */
function randomOpts(defs: OptDef[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of defs) {
    if (d.kind === "toggle") out[d.key] = Math.random() < 0.75 ? 1 : 0;
    else if (d.kind === "select") out[d.key] = Math.floor(Math.random() * (d.choices?.length ?? 1));
    else {
      const steps = Math.round(((d.max ?? 1) - (d.min ?? 0)) / (d.step ?? 0.05));
      out[d.key] = +((d.min ?? 0) + Math.round(Math.random() * steps) * (d.step ?? 0.05)).toFixed(3);
    }
  }
  return out;
}

/** ?capture: the video recorder drives the app (tools/video) */
const CAPTURE = new URLSearchParams(location.search).has("capture");

const NEON_HINT = "Neon tubes: A-Z, 0-9 and - / ! < > \u2665";

function readUrl(): { type: BuildingType; seed: number; palette: PaletteName; shot: ShotName | null; ui: boolean } {
  const q = new URLSearchParams(location.search);
  const type = (TYPES.includes(q.get("type") as BuildingType) ? q.get("type") : "hive") as BuildingType;
  const pal = (q.get("palette") && q.get("palette")! in PALETTES ? q.get("palette") : "Kabukicho") as PaletteName;
  return { type, seed: Number(q.get("seed") ?? 7) || 7, palette: pal, shot: (q.get("shot") as ShotName) ?? null, ui: q.get("ui") !== "0" };
}

export default function App() {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const init = useRef(readUrl());
  const [params, setParams] = useState<Params>(() => paramsFor(init.current.type, init.current.seed, init.current.palette));
  const [atmos, setAtmos] = useState<Atmos>({ ...DEFAULT_ATMOS });
  const [ready, setReady] = useState(false);
  const [ui, setUi] = useState(init.current.ui);
  const [stats, setStats] = useState({ fps: 0, calls: 0, tris: 0 });
  const [busy, setBusy] = useState(false);
  const firstBuild = useRef(true);

  // boot: fonts -> renderer -> build + compile every building type -> reveal
  const [boot, setBoot] = useState<BootState>({ progress: 0, step: "Connecting to the grid", log: [], active: -1, done: false });
  const [showBoot, setShowBoot] = useState(true);
  const prebuilt = useRef(false);
  useEffect(() => {
    let alive = true;
    const tick = () => new Promise(r => setTimeout(r, 40));
    const report = (progress: number, step: string, active = -1) => {
      if (!alive) return;
      setBoot(b => ({ ...b, progress, step, active, log: b.step !== step ? [...b.log, b.step] : b.log }));
    };
    (async () => {
      const t0 = performance.now();
      report(0.03, "Loading fonts");
      // fonts and the Improved-textures PBR sets load side by side
      let fontsDone = 0, texDone = 0, texTotal = 37;
      const step = () => {
        const f = (fontsDone / 5) * 0.12 + (texTotal ? texDone / texTotal : 0) * 0.18;
        report(0.03 + f, texDone < texTotal ? `Loading textures ${texDone}/${texTotal}` : `Loading fonts ${fontsDone}/5`);
      };
      await Promise.all([
        loadFonts(d => { fontsDone = d; step(); }),
        preloadTextures((d, t) => { texDone = d; texTotal = t; step(); }),
      ]);
      if (!alive || !host.current) return;
      report(0.32, "Starting renderer");
      await tick();
      const e = new Engine(host.current);
      engine.current = e;
      e.onStats = setStats;
      (window as unknown as { engine: Engine }).engine = e;
      e.setAtmos(atmos);
      // build + compile the starting building, then reveal; the other types
      // compile in the background so switching later doesn't stall
      const start = init.current.type;
      const name = TYPE_INFO[start].name;
      const singles: BuildingType[] = ["hive", "arcology", "capsule"];
      report(0.36, `Generating ${name}`, singles.indexOf(start));
      await tick();
      if (!alive) return;
      report(0.55, `Compiling shaders · ${name}`, singles.indexOf(start));
      await tick();
      await e.warm(paramsFor(start, init.current.seed, init.current.palette));
      setSlots(e.textSlots);
      if (!alive) return;
      prebuilt.current = true;
      setTimeout(async () => {
        for (const t of singles.filter(t => t !== start)) {
          if (!alive || !engine.current) return;
          await engine.current.precompile(paramsFor(t, init.current.seed, init.current.palette));
          await tick();
        }
      }, 1200);
      console.info(`[boot] ready in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
      report(0.98, "Lighting the neon");
      setReady(true);
      (window as unknown as { __ready: boolean }).__ready = true;
      await tick();
      report(1, "Welcome to the district");
      setTimeout(() => alive && setBoot(b => ({ ...b, done: true })), 450);
      setTimeout(() => alive && setShowBoot(false), 1500);
    })();
    return () => {
      alive = false;
      engine.current?.dispose();
      engine.current = null;
    };
  }, []);

  // rebuild (debounced)
  const version = useRef(0);
  const built = useRef(0);
  useEffect(() => {
    if (!ready || !engine.current) return;
    const v = ++version.current;
    setBusy(true);
    const id = setTimeout(() => {
      // the preloader already built the starting building
      if (!(firstBuild.current && prebuilt.current)) engine.current!.setParams(params);
      setSlots(engine.current!.textSlots);
      if (editorRef.current) engine.current!.setHover(editorRef.current.id);
      if (firstBuild.current) {
        firstBuild.current = false;
        engine.current!.shot(init.current.shot ?? "hero", true);
      }
      built.current = v;
      setBusy(false);
    }, firstBuild.current || CAPTURE ? 0 : 140);
    return () => clearTimeout(id);
  }, [params, ready]);

  useEffect(() => {
    engine.current?.setAtmos(atmos);
  }, [atmos, ready]);

  const set = <K extends keyof Params>(k: K, v: Params[K]) => setParams(p => ({ ...p, [k]: v }));
  const setOpt = (k: string, v: number) => setParams(p => ({ ...p, opts: { ...p.opts, [k]: v } }));
  const optVal = (d: OptDef) => params.opts[d.key] ?? d.def;

  // ---------------------------------------------------------------- text editing
  const [slots, setSlots] = useState<TextSpec[]>([]);
  const [editor, setEditor] = useState<{ id: string; x: number; y: number; draft: string } | null>(null);
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const down = useRef<{ x: number; y: number; t: number } | null>(null);
  const setText = (id: string, v: string) => setParams(p => ({ ...p, texts: { ...p.texts, [id]: v } }));
  const resetText = (id: string) => setParams(p => {
    const texts = { ...p.texts };
    delete texts[id];
    return { ...p, texts };
  });
  const closeEditor = () => {
    setEditor(null);
    engine.current?.setHover(null);
  };
  const onPointerDown = (e: RPointerEvent) => {
    down.current = { x: e.clientX, y: e.clientY, t: performance.now() };
  };
  const onPointerMove = (e: RPointerEvent) => {
    if (!engine.current || e.buttons || editor) return;
    const hit = engine.current.pickText(e.clientX, e.clientY);
    engine.current.setHover(hit?.id ?? null);
    if (host.current) host.current.style.cursor = hit ? "text" : "";
  };
  const onPointerUp = (e: RPointerEvent) => {
    const d = down.current;
    down.current = null;
    if (!d || !engine.current) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || performance.now() - d.t > 450) return; // that was a drag
    const hit = engine.current.pickText(e.clientX, e.clientY);
    if (!hit) {
      if (editor) closeEditor();
      return;
    }
    engine.current.setHover(hit.id);
    setEditor({ id: hit.id, x: e.clientX, y: e.clientY, draft: hit.text });
  };
  const edited = Object.keys(params.texts);
  const slotOf = (id: string) => slots.find(t => t.id === id);
  const setA = <K extends keyof Atmos>(k: K, v: Atmos[K]) => setAtmos(a => ({ ...a, [k]: v }));
  const switchType = (t: BuildingType) => {
    setParams(p => paramsFor(t, p.seed, p.palette, p.texts));
    closeEditor();
    setTimeout(() => engine.current?.shot("hero"), 200);
  };
  const reroll = () => set("seed", Math.floor(Math.random() * 99999));

  const capture = useCallback(async () => {
    if (!engine.current) return;
    const url = await engine.current.capture();
    const a = document.createElement("a");
    a.href = url;
    a.download = `neon-district-${params.type}-${params.seed}.png`;
    a.click();
  }, [params.type, params.seed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "Escape") closeEditor();
      const k = e.key.toLowerCase();
      if (k === "h") setUi(u => !u);
      else if (k === "p") capture();
      else if (k === "r") reroll();
      else if (k === "o") setA("orbit", !atmos.orbit);
      else if (k === "t" && e.shiftKey) setA("texShuffle", atmos.texShuffle + 1);
      else if (k === "t") setA("textures", !atmos.textures);
      else if (k === "1" || k === "2" || k === "3" || k === "4") switchType(TYPES[Number(k) - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });


  // recording hook for tools/video: drive the same state the panel does, so the UI shows every change
  useEffect(() => {
    (window as unknown as { __app: unknown }).__app = {
      set: (p: Partial<Params>) => setParams(prev => ({ ...prev, ...p })),
      setOpt: (k: string, v: number) => setParams(prev => ({ ...prev, opts: { ...prev.opts, [k]: v } })),
      setAtmos: (a: Partial<Atmos>) => setAtmos(prev => ({ ...prev, ...a })),
      setUi: (v: boolean) => setUi(v),
      settled: () => built.current === version.current,
      /** one batched update (params, style options, atmosphere): a single rebuild */
      batch: (b: { p?: Partial<Params>; o?: Record<string, number>; a?: Partial<Atmos> }) => {
        if (b.p || b.o) setParams(prev => ({ ...prev, ...(b.p ?? {}), opts: b.o ? { ...prev.opts, ...b.o } : prev.opts }));
        if (b.a) setAtmos(prev => ({ ...prev, ...b.a }));
      },
      randomStyle: () => setParams(prev => ({ ...prev, opts: randomOpts(TYPE_INFO[prev.type].options) })),
      shuffle: () => setAtmos(prev => ({ ...prev, texShuffle: prev.texShuffle + 1 })),
      params: () => params,
    };
  });

  const info = TYPE_INFO[params.type];

  return (
    <>
      <div ref={host} className="viewport" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />
      {showBoot && <Preloader state={boot} />}
      {ui && ready && (
        <>
          <header className="brand">
            <div className="brand-title">NEON<span>//</span>DISTRICT</div>
            <div className="brand-sub">procedural cyberpunk buildings · three.js</div>
            <button className={atmos.textures ? "tex-btn on" : "tex-btn"} onClick={() => setA("textures", !atmos.textures)}
              title="Switch between real PBR textures (ambientCG, CC0) and the procedural materials (T)">
              <i />{atmos.textures ? "Improved textures · ON" : "Improved textures · OFF"}
            </button>
            {atmos.textures && (
              <button className="tex-btn shuffle" onClick={() => setA("texShuffle", atmos.texShuffle + 1)}
                title="Roll other ambientCG / Poly Haven sets for every surface (Shift+T)">⟳ Shuffle textures</button>
            )}
          </header>
          <nav className="types">
            {TYPES.map((t, i) => (
              <button key={t} className={t === params.type ? "on" : ""} onClick={() => switchType(t)}>
                <b>{TYPE_INFO[t].name}</b>
                <small>{i + 1} · {TYPE_INFO[t].tag}</small>
              </button>
            ))}
          </nav>
          <aside className="panel">
            <section>
              <h3>Structure · {info.name}</h3>
              {info.sliders.length === 0 && <p className="note">HIVE, ARCOLOGY and CAPSULE side by side. Pick one of them to change its size.</p>}
              {info.sliders.map(s => (
                <Range key={s.key} label={s.label} min={s.min} max={s.max} step={s.step} value={params[s.key] as number} onChange={v => set(s.key, v as never)} />
              ))}
              <div className="row">
                <label>Seed</label>
                <input className="seed" type="number" value={params.seed} onChange={e => set("seed", Number(e.target.value) || 0)} />
                <button className="dice" onClick={reroll} title="Random seed (R)">⟳</button>
              </div>
            </section>
            {info.options.length > 0 && (
              <section>
                <h3>Style · {info.name}</h3>
                <div className="style-actions">
                  <button onClick={() => setParams(p => ({ ...p, opts: randomOpts(info.options) }))} title="Randomize every style option">⚄ Random style</button>
                  <button onClick={() => setParams(p => ({ ...p, opts: {} }))}>Reset</button>
                </div>
                {[...new Set(info.options.map(o => o.group))].map(group => (
                  <div key={group} className="opt-group">
                    <h4>{group}</h4>
                    {info.options.filter(o => o.group === group).map(d =>
                      d.kind === "toggle" ? (
                        <Toggle key={d.key} label={d.label} value={optVal(d) > 0} onChange={v => setOpt(d.key, v ? 1 : 0)} />
                      ) : d.kind === "select" ? (
                        <div key={d.key} className="row">
                          <label>{d.label}</label>
                          <select className="opt-select" value={optVal(d)} onChange={e => setOpt(d.key, Number(e.target.value))}>
                            {d.choices!.map((c, i) => <option key={c} value={i}>{c}</option>)}
                          </select>
                        </div>
                      ) : (
                        <Range key={d.key} label={d.label} min={d.min!} max={d.max!} step={d.step!} value={optVal(d)} onChange={v => setOpt(d.key, v)} />
                      ),
                    )}
                  </div>
                ))}
              </section>
            )}
            <section>
              <h3>Text</h3>
              <p className="note">Click any sign, neon or screen in the scene to edit its text. {slots.length} editable here.</p>
              {edited.map(id => (
                <div key={id} className="edited">
                  <span title={id}>{slotOf(id)?.label ?? `${TYPE_INFO[id.split(".")[0] as BuildingType]?.name ?? ""} · ${id.split(".").slice(1).join(" ")}`}</span>
                  <b>{params.texts[id]}</b>
                  <button onClick={() => resetText(id)} title="Back to the generated text">✕</button>
                </div>
              ))}
              {edited.length > 0 && <button className="capture" onClick={() => setParams(p => ({ ...p, texts: {} }))}>Reset all texts</button>}
            </section>
            <section>
              <h3>Detail</h3>
              <Range label="Signs" min={0} max={1} step={0.05} value={params.signs} onChange={v => set("signs", v)} />
              <Range label="AC units" min={0} max={1} step={0.05} value={params.ac} onChange={v => set("ac", v)} />
              <Range label="Clutter" min={0} max={1} step={0.05} value={params.clutter} onChange={v => set("clutter", v)} />
              <Range label="Cables" min={0} max={1} step={0.05} value={params.cables} onChange={v => set("cables", v)} />
            </section>
            <section>
              <h3>Neon palette</h3>
              <div className="palettes">
                {(Object.keys(PALETTES) as PaletteName[]).map(n => (
                  <button key={n} className={n === params.palette ? "on" : ""} onClick={() => set("palette", n)} title={n}>
                    {PALETTES[n].slice(0, 4).map(c => <i key={c} style={{ background: "#" + c, boxShadow: `0 0 6px #${c}` }} />)}
                    <span>{n}</span>
                  </button>
                ))}
              </div>
              <Range label="Neon power" min={0} max={2} step={0.05} value={atmos.neon} onChange={v => setA("neon", v)} />
              <Range label="Lit windows" min={0} max={1} step={0.05} value={atmos.lit} onChange={v => setA("lit", v)} />
            </section>
            <section>
              <h3>Atmosphere</h3>
              <Toggle label="Rain" value={atmos.rain} onChange={v => setA("rain", v)} />
              <Range label="Rain amount" min={0.05} max={1} step={0.05} value={atmos.rainAmount} onChange={v => setA("rainAmount", v)} />
              <Range label="Wetness" min={0} max={1} step={0.05} value={atmos.wet} onChange={v => setA("wet", v)} />
              <Range label="Fog" min={0} max={1} step={0.05} value={atmos.fog} onChange={v => setA("fog", v)} />
              <Range label="Bloom" min={0} max={2} step={0.05} value={atmos.bloom} onChange={v => setA("bloom", v)} />
              <Range label="Grain" min={0} max={0.1} step={0.005} value={atmos.grain} onChange={v => setA("grain", v)} />
              <Toggle label="Ambient occlusion" value={atmos.ao} onChange={v => setA("ao", v)} />
            </section>
            <section>
              <h3>Camera</h3>
              <div className="shots">
                {SHOTS.map(([k, l]) => <button key={k} onClick={() => engine.current?.shot(k)}>{l}</button>)}
              </div>
              <Toggle label="Auto-orbit (O)" value={atmos.orbit} onChange={v => setA("orbit", v)} />
              <div className="row">
                <label>Letterbox</label>
                <select value={atmos.letterbox} onChange={e => setA("letterbox", Number(e.target.value))}>
                  <option value={0}>off</option>
                  <option value={1.85}>1.85 : 1</option>
                  <option value={2.39}>2.39 : 1</option>
                </select>
              </div>
              <button className="capture" onClick={capture}>◉ Save PNG (P)</button>
            </section>
          </aside>
          {editor && (() => {
            const spec = slotOf(editor.id);
            if (!spec) return null;
            const left = Math.min(editor.x + 14, window.innerWidth - 340);
            const top = Math.min(editor.y + 14, window.innerHeight - 190);
            const hint = spec.kind === "neon" ? NEON_HINT : spec.vertical ? "Vertical sign: a few characters read best; kanji and kana work" : "Any text; kanji and kana work";
            return (
              <div className="text-editor" style={{ left, top }} onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}>
                <div className="te-head">
                  <b>{spec.label}</b>
                  <button onClick={closeEditor} title="Close (Esc)">✕</button>
                </div>
                <input
                  autoFocus
                  value={editor.draft}
                  maxLength={spec.maxLen}
                  spellCheck={false}
                  onChange={e => {
                    const v = e.target.value;
                    setEditor(ed => (ed ? { ...ed, draft: v } : ed));
                    setText(spec.id, v);
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === "Escape") closeEditor();
                  }}
                />
                <div className="te-foot">
                  <span>{hint}</span>
                  <span>{[...editor.draft].length}/{spec.maxLen}</span>
                </div>
                <div className="te-actions">
                  <button onClick={() => { resetText(spec.id); setEditor(ed => (ed ? { ...ed, draft: spec.def } : ed)); }}>Reset</button>
                  <button className="on" onClick={closeEditor}>Done</button>
                </div>
              </div>
            );
          })()}
          {!CAPTURE && <ContactCard accent={"#" + PALETTES[params.palette][0]} accent2={"#" + PALETTES[params.palette][1]} />}
          <footer className="hud">
            <span>{stats.fps.toFixed(0)} fps</span>
            <span>{stats.calls} draws</span>
            <span>{(stats.tris / 1e6).toFixed(2)} M tris</span>
            {busy && <span className="busy">generating…</span>}
            <span className="keys">H hide UI · P png · R reroll · T textures · 1-4 building · O orbit</span>
          </footer>
        </>
      )}
    </>
  );
}

function Range(p: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  const dec = p.step < 1 ? (p.step < 0.01 ? 3 : 2) : 0;
  return (
    <div className="row">
      <label>{p.label}</label>
      <input type="range" min={p.min} max={p.max} step={p.step} value={p.value} onChange={e => p.onChange(Number(e.target.value))} />
      <output>{p.value.toFixed(dec)}</output>
    </div>
  );
}

function Toggle(p: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="row toggle" onClick={() => p.onChange(!p.value)}>
      <label>{p.label}</label>
      <span className={p.value ? "sw on" : "sw"}><i /></span>
    </div>
  );
}
