// Example: an Apple-Watch-Ultra-style watchface on the ROUND screen — the circle
// is the canvas, edge to edge. Seconds live in THREE places (as on the Ultra):
//   1. a bright FILLED arc that sweeps the OUTERMOST ring from 12 o'clock to the
//      current second (fills once a minute),
//   2. a bright marker tick riding the head of that fill,
//   3. digital ":SS" in gray, right of the big HH:MM.
// Around it, Ultra-style complications (a gauge, a compass, activity rings, a
// sunset, a heading strip) — hardcoded to match the reference, a design demo.
// One draw.ts Canvas Port (arc/line/circle/text), repainted every second by
// useClock("second"). Colours assume gabbro's colour round.
import { render, screen } from "runtime/jsx-runtime";
import { Canvas } from "runtime/draw";
import { useClock } from "runtime/clock";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "18px Gothic", color: "white" });
// App-scope Styles are fine (only PRELOADED runtime/ modules freeze them).
const timeStyle = new Style({ font: "bold 42px Bitham", color: "white" });
const secStyle = new Style({ font: "bold 24px Gothic", color: "#8a8a8a" });
const headStyle = new Style({ font: "18px Gothic", color: "#ff7a00" });
const tiny = new Style({ font: "14px Gothic", color: "#c0c0c0" });
const tinyDim = new Style({ font: "14px Gothic", color: "#6a6a6a" });

const ACCENT = "#ff7a00";
const TWO = (n: number) => (n < 10 ? "0" : "") + n;
const RAD = Math.PI / 180;

const now = useClock("second");

render(
	() => {
		const W = screen.width;
		const H = screen.height;
		const cx = W / 2;
		const cy = H / 2;
		const R = Math.min(cx, cy);
		return (
			<Container left={0} right={0} top={0} bottom={0}>
				<Canvas
					width={W}
					height={H}
					paint={(g) => {
						const d = now();
						const s = d.getSeconds();

						// ---- outer dial: 60 dim minute ticks (12 brighter hour ticks) ----
						for (let i = 0; i < 60; i++) {
							const a = (i * 6 - 90) * RAD;
							const hour = i % 5 === 0;
							const rIn = hour ? R - 13 : R - 7;
							const ca = Math.cos(a);
							const sa = Math.sin(a);
							g.line(
								cx + rIn * ca,
								cy + rIn * sa,
								cx + (R - 2) * ca,
								cy + (R - 2) * sa,
								hour ? 3 : 1,
								hour ? "#7a7a7a" : "#333333",
							);
						}

						// ---- seconds FILL: a bright arc from 12 o'clock to the current
						//      second on the outermost ring (fills once a minute) ----
						if (s > 0) g.arc(cx, cy, R - 4, -90, -90 + s * 6, 4, ACCENT);
						// marker tick at the head of the fill
						const sa = (s * 6 - 90) * RAD;
						g.line(
							cx + (R - 16) * Math.cos(sa),
							cy + (R - 16) * Math.sin(sa),
							cx + (R - 1) * Math.cos(sa),
							cy + (R - 1) * Math.sin(sa),
							5,
							ACCENT,
						);

						// ---- top-left gauge complication: "53" over a green→yellow arc ----
						const gx = cx - 58;
						const gy = 62;
						g.arc(gx, gy, 22, 150, 150 + 240, 4, "#303030");
						g.arc(gx, gy, 22, 150, 150 + 240 * 0.66, 4, "#a6ff00");
						g.text("53", base, "white", gx - 12, gy - 12);

						// ---- top-center compass ring ----
						const mx = cx;
						const my = 56;
						g.strokeCircle(mx, my, 20, "#505050", 2);
						g.text("N", tiny, "white", mx - 5, my - 26);
						g.line(mx, my, mx + 12 * Math.cos((315 - 90) * RAD), my + 12 * Math.sin((315 - 90) * RAD), 3, ACCENT);

						// ---- top-right gauge "4" (UV) ----
						const ux = cx + 58;
						const uy = 62;
						g.arc(ux, uy, 22, 150, 150 + 240, 4, "#303030");
						g.arc(ux, uy, 22, 150, 150 + 240 * 0.4, 4, "#ffcc00");
						g.text("4", base, "white", ux - 6, uy - 12);

						// ---- BIG time: HH:MM white, :SS gray, centered on one baseline ----
						const time = TWO(d.getHours()) + ":" + TWO(d.getMinutes());
						g.text(time, timeStyle, "white", cx - 84, cy - 26);
						g.text(TWO(s), secStyle, "#8a8a8a", cx + 58, cy - 14);

						// ---- heading strip: "315° NW" + a thin linear scale ----
						g.text("315° NW", headStyle, ACCENT, cx - 34, cy + 24);
						const ty = cy + 52;
						for (let i = -6; i <= 6; i++) {
							const x = cx + i * 9;
							const big = i % 3 === 0;
							g.line(x, ty, x, ty + (big ? 8 : 4), 1, i === 0 ? ACCENT : "#5a5a5a");
						}
						g.text("NW", tinyDim, "#6a6a6a", cx - 8, ty + 10);

						// ---- bottom: activity rings + sunset ----
						const ax = cx;
						const ay = H - 44;
						g.arc(ax, ay, 20, -90, 210, 4, "#3a1020");
						g.arc(ax, ay, 20, -90, 210, 4, "#ff2d70"); // move ring (full)
						g.arc(ax, ay, 14, -90, 150, 4, "#a6ff00"); // exercise
						g.arc(ax, ay, 8, -90, 90, 4, "#00d0ff"); // stand
						g.text("7:33", tiny, "#c0c0c0", cx - 46, ay - 8);
						g.text("53°", tiny, "#c0c0c0", cx + 30, ay - 8);
					}}
				/>
			</Container>
		);
	},
	{ skin: bg, style: base },
);
