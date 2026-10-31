/**
 * The author card, bottom right: who built this, the "available for work"
 * status, and the links that matter — the source code, the feed the work is
 * posted to and the studio site.
 *
 * Dressed like the rest of the district: dark glass, cut corners, Orbitron
 * capitals and neon. The portrait frame and the studio link take the first two
 * colours of the neon palette on the stage, so the card follows the street.
 * The source link is the exception: it is hazard yellow whatever the palette,
 * and stays out as a tag when the card is collapsed (the default on phones), so
 * the code is always one tap away.
 *
 * The settings panel runs down the right edge; the card keeps its height in
 * `--contact-clear` and the panel stops that much short of the bottom
 * (contact.css), so the two stack into one column.
 */
import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import "./contact.css";

const SITE_URL = "https://linkedin.com/in/eisaman";
const X_URL = "https://x.com/SirFizX207";
const REPO_URL = "https://github.com/EricEisaman/CyberPunkProceduralBuildingsThreeJS";

const STORE_KEY = "chiro.contact.collapsed";

/**
 * Where the card opens by default: below this it starts as the portrait alone,
 * so a small window keeps its room for the panel.
 */
const ROOM = "(min-width: 761px) and (min-height: 640px)";

/** gap kept between the bottom of the panel and the top of the card */
const PANEL_GAP = 10;

/** reads / writes are best-effort: private windows throw on the first touch */
function readCollapsed(): boolean {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORE_KEY);
  } catch {
    /* fall through to the window's own answer */
  }
  if (stored !== null) return stored === "1";
  return !window.matchMedia(ROOM).matches;
}

function writeCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(STORE_KEY, collapsed ? "1" : "0");
  } catch {
    /* the card just forgets between visits */
  }
}

/** GitHub's mark (Octicons mark-github, 24 box) */
const IconGithub = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M12 1C5.923 1 1 5.923 1 12c0 4.867 3.149 8.979 7.521 10.436.55.096.756-.233.756-.522 0-.262-.013-1.128-.013-2.049-2.764.509-3.479-.674-3.699-1.292-.124-.317-.66-1.293-1.127-1.554-.385-.207-.936-.715-.014-.729.866-.014 1.485.797 1.691 1.128.99 1.663 2.571 1.196 3.204.907.096-.715.385-1.196.701-1.471-2.448-.275-5.005-1.224-5.005-5.432 0-1.196.426-2.186 1.128-2.956-.111-.275-.496-1.402.11-2.915 0 0 .921-.288 3.024 1.128a10.193 10.193 0 0 1 2.75-.371c.936 0 1.871.123 2.75.371 2.104-1.43 3.025-1.128 3.025-1.128.605 1.513.221 2.64.111 2.915.701.77 1.127 1.747 1.127 2.956 0 4.222-2.571 5.157-5.019 5.432.399.344.743 1.004.743 2.035 0 1.471-.014 2.654-.014 3.025 0 .289.206.632.756.522C19.851 20.979 23 16.854 23 12c0-6.077-4.922-11-11-11Z" />
  </svg>
);

/** X, from the official mark */
const IconX = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

/** a globe for the studio */
const IconSite = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M3.4 9h17.2M3.4 15h17.2" />
    <path d="M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3z" />
  </svg>
);

const IconGo = () => (
  <svg className="contact__go" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
    <path d="M7 17 17 7M9 7h8v8" />
  </svg>
);

function Link(p: { href: string; kind: string; icon: ReactNode; label: string; sub: string }) {
  return (
    <a className={`contact__link contact__link--${p.kind}`} href={p.href} target="_blank" rel="noopener noreferrer">
      <span className="contact__icon">{p.icon}</span>
      <span className="contact__link-text"><b>{p.label}</b><em>{p.sub}</em></span>
      <IconGo />
    </a>
  );
}

/** `accent` and `accent2`: hex colours from the neon palette on the stage */
export function ContactCard({ accent, accent2 }: { accent: string; accent2: string }) {
  const root = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggle = () => {
    setCollapsed(c => {
      writeCollapsed(!c);
      return !c;
    });
  };

  // room the panel leaves at the bottom of the window for the card
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const clear = () => {
      const bottom = parseFloat(getComputedStyle(el).bottom) || 0;
      document.documentElement.style.setProperty("--contact-clear", `${el.offsetHeight + bottom + PANEL_GAP}px`);
    };
    clear();
    const ro = new ResizeObserver(clear);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--contact-clear");
    };
  }, []);

  const cls = ["contact-wrap", collapsed && "is-collapsed"].filter(Boolean).join(" ");
  const style = { "--contact-accent": accent, "--contact-accent-2": accent2 } as CSSProperties;

  return (
    <aside id="contact" ref={root} className={cls} style={style} aria-label="About the author">
      <div className="contact">
        <div className="contact__body">
          <button
            className="contact__toggle"
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Show the contact card" : "Hide the contact card"}
            title={collapsed ? "Work with me" : "Hide"}
          >
            <span className="contact__toggle-bar" />
          </button>

          <div className="contact__head">
            <div className="contact__portrait">
              <span className="contact__frame">
                <img src="contact/p.jpg" alt="Portrait of SirFizX" decoding="async" draggable={false} />
              </span>
            </div>
            <div className="contact__who">
              <span className="contact__status"><i />Available for work</span>
              <span className="contact__name" data-text="SirFizX">SirFizX</span>
              <span className="contact__role">Creative dev &mdash; 3D, motion, games</span>
            </div>
          </div>

          <div className="contact__rule"><b /></div>

          <p className="contact__note">
            Every tube, sign and window generated from a seed, live in three.js. Your district could be next.
          </p>

          <div className="contact__links">
            <Link href={REPO_URL} kind="code" icon={<IconGithub />} label="Get the source code" sub="Open source · MIT · GitHub" />
            <Link href={X_URL} kind="x" icon={<IconX />} label="@SirFizX207" sub="Work in motion, daily" />
            <Link href={SITE_URL} kind="site" icon={<IconSite />} label="Sigma Scholar Alliance" sub="Keep Siggin!" />
          </div>
        </div>
      </div>

      {/* outside the cut-corner tile, which would clip them */}
      <span className="contact__hint" aria-hidden="true">Work with me</span>
      <a className="contact__code-pill" href={REPO_URL} target="_blank" rel="noopener noreferrer" aria-label="Get the source code on GitHub">
        <IconGithub /><span>Get the code</span>
      </a>
    </aside>
  );
}
