// Apple-Watch-Ultra "Modular Ultra" instrument face, RE-INTERPRETED NATIVELY for
// the ROUND Pebble (gabbro, 260×260) — not a rectangular layout crammed into a
// circle. The hero is a CIRCULAR SEGMENTED PERIMETER SECONDS RING: 60 RADIAL
// segments (each points at the center like a clock index / sun ray), one per
// second, exactly 6° apart, second 0 at 12 o'clock, stepping CLOCKWISE (15→3
// o'clock, 30→6, 45→9). Four states carried by LENGTH + THICKNESS + COLOR (never
// colour alone — e-paper + accessibility): future ticks dim gray, elapsed light
// gray, the CURRENT second the accent (longer + thicker + 1px further out), and
// every-5th/quadrant ticks longer for rhythm. Discrete: `useClock("second")`
// repaints once a second, one bar steps — no sweep, no glow, no animation. Inside
// the ring: three top mini-complications on the wide upper band, the big white
// HH:MM (with a small gray numeric SS), a short heading line, and three bottom
// complications. e-paper discipline: solid colours snapped to the 64-colour
// palette, integer-ish coords, one accent (amber/orange). One draw.ts Canvas Port.
//
// MEMORY (Rule 4 — the 32KB XS arena): every per-second value is a LOCAL NUMBER
// computed inline. An earlier build retained a 60-object geometry array and the
// arena fxAbort'd "memory full" at boot — so there is NO retained per-tick array;
// cos/sin are recomputed each frame (CPU is cheap, RAM is not).
import { render, screen } from "runtime/jsx-runtime";
import { Canvas } from "runtime/draw";
import { useClock } from "runtime/clock";

const bg = new Skin({ fill: "black" });
// Just THREE Style objects — one per FONT — to spare the 32KB XS arena (each live
// Style is arena RAM, and this face sits right on the ceiling: a per-colour Style
// set fxAbort'd "memory full" at boot). `g.text(str, style, COLOR, x, y)` passes
// the colour EXPLICITLY (Piu's drawString colour arg overrides the Style's), so
// one Style per font backs every colour. Fonts: {49px Roboto hero digits, 18px
// Gothic, 14px Gothic}. `g18` doubles as the render's base Style.
const g49 = new Style({ font: "bold 49px Roboto", color: "white" });
const g28 = new Style({ font: "bold 28px Gothic", color: "white" }); // big-ish numeric SS
const g18 = new Style({ font: "18px Gothic", color: "white" });
const g14 = new Style({ font: "14px Gothic", color: "white" });

// One accent (amber/orange) + e-paper-safe grays. Elapsed light, inactive dark —
// the current tick alone wears the accent.
const ORANGE = "#ff9500";
const SEC_EL = "#aaaaaa"; // elapsed: light gray
const SEC_IN = "#555555"; // future: dim but visible dark gray
const MOVE = "#fa114f";
const EXER = "#92e82a";
const STAND = "#1eeaef";
const TWO = (n: number) => (n < 10 ? "0" : "") + n;
const RAD = Math.PI / 180;

const now = useClock("second");

render(
	() => {
		const W = screen.width;
		const H = screen.height;
		const cx = W / 2;
		const cy = H / 2;
		const R = Math.min(cx, cy); // 130 on gabbro

		return (
			<Container left={0} right={0} top={0} bottom={0}>
				<Canvas
					width={W}
					height={H}
					paint={(g) => {
						const d = now();
						const s = d.getSeconds();

						// ---- CIRCULAR RADIAL 60-SECOND RING (the hero) ----
						// angle = −90° + i·6° puts i=0 at the top and steps clockwise. Each
						// tick is a radial line from `inner` to `outer`; the tier sets its
						// length/thickness, the state (future/elapsed/current) its colour.
						for (let i = 0; i < 60; i++) {
							const a = (-90 + i * 6) * RAD;
							const ca = Math.cos(a);
							const sa = Math.sin(a);
							let outer: number;
							let inner: number;
							let th: number;
							if (i === s) {
								outer = R - 5; // current: longest + thickest, 1px further out
								inner = R - 20;
								th = 3;
							} else if (i % 15 === 0) {
								outer = R - 6; // quadrant (0/15/30/45): the longest markers
								inner = R - 19;
								th = 3;
							} else if (i % 5 === 0) {
								outer = R - 6; // 5-second major
								inner = R - 16;
								th = 2;
							} else {
								outer = R - 6; // normal second
								inner = R - 13;
								th = 2;
							}
							const col = i === s ? ORANGE : i < s ? SEC_EL : SEC_IN;
							g.line(cx + inner * ca, cy + inner * sa, cx + outer * ca, cy + outer * sa, th, col);
						}

						// ---- top complications ([gauge][compass][conditions]) — arc/line/text
						//      only (no strokeCircle/fillCircle: each draw method is a host
						//      symbol and this face sits on the 32KB arena's symbol ceiling) ----
						const gy = 58;
						const lgx = cx - 48;
						g.arc(lgx, gy, 20, 145, 145 + 250, 3, "#2c2c2e");
						g.arc(lgx, gy, 20, 145, 145 + 250 * 0.55, 3, EXER);
						g.text("53", g18, "white", lgx - 11, gy - 11);
						g.text("50", g14, "#636366", lgx - 25, gy + 15);
						g.text("56", g14, "#636366", lgx + 13, gy + 15);
						// center compass (ring via a full arc): N/E/S/W + orange crosshair
						const ccy = 50;
						g.arc(cx, ccy, 18, 0, 360, 2, "#48484a");
						g.text("N", g14, "#e5e5ea", cx - 4, ccy - 29);
						g.text("S", g14, "#636366", cx - 3, ccy + 19);
						g.text("W", g14, "#636366", cx - 25, ccy - 8);
						g.text("E", g14, "#636366", cx + 19, ccy - 8);
						g.line(cx - 6, ccy, cx + 6, ccy, 2, ORANGE);
						g.line(cx, ccy - 6, cx, ccy + 6, 2, ORANGE);
						// right: conditions glyph — an orange mountain/tent triangle
						const rgx = cx + 48;
						g.line(rgx - 10, gy + 8, rgx, gy - 9, 2, ORANGE);
						g.line(rgx, gy - 9, rgx + 10, gy + 8, 2, ORANGE);
						g.line(rgx - 10, gy + 8, rgx + 10, gy + 8, 2, ORANGE);

						// ---- HERO time: big white HH:MM + a BIG gray numeric SS, baselines
						//      aligned (SS drawn lower so its baseline meets the 49px digits) ----
						const yt = cy - 28;
						g.text(TWO(d.getHours()) + ":" + TWO(d.getMinutes()), g49, "white", cx - 74, yt);
						g.text(TWO(s), g28, "#aaaaaa", cx + 54, yt + 16);

						// ---- heading line under the clock ----
						const hy = cy + 30;
						g.text("315°", g14, "#e5e5ea", cx - 40, hy);
						g.text("NW", g18, ORANGE, cx + 6, hy);

						// ---- bottom complications ([activity rings][sunset][UV]) ----
						const ay = H - 44;
						const blx = cx - 48;
						g.arc(blx, ay, 15, -90, 270, 4, "#3a0a1a");
						g.arc(blx, ay, 15, -90, 250, 4, MOVE);
						g.arc(blx, ay, 9, -90, 190, 4, EXER);
						g.arc(blx, ay, 4, -90, 120, 4, STAND);
						const scy = ay + 8;
						g.arc(cx, scy - 6, 6, 180, 360, 2, ORANGE);
						g.line(cx - 9, scy - 6, cx + 9, scy - 6, 1, "#636366");
						g.text("7:33", g14, "#e5e5ea", cx - 15, scy);
						const brx = cx + 48;
						g.arc(brx, ay, 15, 145, 145 + 250, 3, "#2c2c2e");
						g.arc(brx, ay, 15, 145, 145 + 250 * 0.33, 3, ORANGE);
						g.text("4", g18, "white", brx - 5, ay - 9);
					}}
				/>
			</Container>
		);
	},
	{ skin: bg, style: g18 },
);
