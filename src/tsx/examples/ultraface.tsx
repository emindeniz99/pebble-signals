// Example: an Apple-Watch-Ultra "Wayfinder"-style watchface on the ROUND screen.
// Design principles (Jony Ive / the Ultra face): TYPOGRAPHY is the hero — a big
// baseline-locked HH:MM with a quiet gray :SS reading as one unit; the circular
// EDGE is an instrument-grade bezel (fine tick dial) with seconds counting up as
// a thin accent fill; ONE accent (Apple system orange), everything else a
// disciplined grayscale on deep black; precise spacing, nothing crude.
//
// Seconds live in THREE places (as the Ultra offers): the outer FILL sweeping
// 12→now, a crisp marker at its head, and the digital gray :SS. `useClock(
// "second")` repaints once a second, so it steps second-by-second. One draw.ts
// Canvas Port (arc/line/circle/text). Colours assume gabbro's colour round.
import { render, screen } from "runtime/jsx-runtime";
import { Canvas } from "runtime/draw";
import { useClock } from "runtime/clock";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "18px Gothic", color: "white" });
// App-scope Styles are fine (only PRELOADED runtime/ modules freeze them).
const hhmm = new Style({ font: "bold 49px Roboto", color: "white" });
const ss = new Style({ font: "bold 24px Gothic", color: "#8e8e93" });
const lblO = new Style({ font: "18px Gothic", color: "#ff9500" });
const lblW = new Style({ font: "14px Gothic", color: "#e5e5ea" });
const lblD = new Style({ font: "14px Gothic", color: "#636366" });
const num = new Style({ font: "bold 18px Gothic", color: "white" });

const ORANGE = "#ff9500"; // Apple system orange
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
		const R = Math.min(cx, cy);
		return (
			<Container left={0} right={0} top={0} bottom={0}>
				<Canvas
					width={W}
					height={H}
					paint={(g) => {
						const d = now();
						const s = d.getSeconds();

						// ---- instrument bezel: a fine tick dial, brighter at the hours ----
						for (let i = 0; i < 60; i++) {
							const a = (i * 6 - 90) * RAD;
							const hour = i % 5 === 0;
							const ca = Math.cos(a);
							const sa = Math.sin(a);
							const rIn = hour ? R - 12 : R - 6;
							g.line(
								cx + rIn * ca,
								cy + rIn * sa,
								cx + (R - 2) * ca,
								cy + (R - 2) * sa,
								hour ? 2 : 1,
								hour ? "#d0d0d2" : "#48484a",
							);
						}
						// seconds fill: a thin accent arc 12→now, with a crisp head marker
						if (s > 0) g.arc(cx, cy, R - 4, -90, -90 + s * 6, 3, ORANGE);
						const sa = (s * 6 - 90) * RAD;
						g.line(
							cx + (R - 12) * Math.cos(sa),
							cy + (R - 12) * Math.sin(sa),
							cx + R * Math.cos(sa),
							cy + R * Math.sin(sa),
							4,
							ORANGE,
						);

						// ---- top complications: gauge · compass · gauge, evenly spaced ----
						// left gauge "53" with 50/56 min-max
						const lgx = cx - 56;
						const gy = 60;
						g.arc(lgx, gy, 20, 145, 145 + 250, 3, "#2c2c2e");
						g.arc(lgx, gy, 20, 145, 145 + 250 * 0.55, 3, EXER);
						g.text("53", num, "white", lgx - 11, gy - 11);
						g.text("50", lblD, "#636366", lgx - 24, gy + 16);
						g.text("56", lblD, "#636366", lgx + 12, gy + 16);
						// center compass ring with N and an orange needle at 315°
						g.strokeCircle(cx, gy, 18, "#48484a", 2);
						g.text("N", lblW, "#e5e5ea", cx - 4, gy - 30);
						g.line(cx, gy, cx + 12 * Math.cos((315 - 90) * RAD), gy + 12 * Math.sin((315 - 90) * RAD), 2, ORANGE);
						g.fillCircle(cx, gy, 2, "#e5e5ea");
						// right gauge "4" (UV index)
						const rgx = cx + 56;
						g.arc(rgx, gy, 20, 145, 145 + 250, 3, "#2c2c2e");
						g.arc(rgx, gy, 20, 145, 145 + 250 * 0.33, 3, ORANGE);
						g.text("4", num, "white", rgx - 5, gy - 11);

						// ---- HERO time: HH:MM white + :SS gray, baseline-locked, centered
						const hm = TWO(d.getHours()) + ":" + TWO(d.getMinutes());
						const yt = cy - 30; // HH:MM top
						g.text(hm, hhmm, "white", cx - 80, yt);
						// :SS smaller, its top dropped so the baseline matches HH:MM
						g.text(":" + TWO(s), ss, "#8e8e93", cx + 46, yt + 19);

						// ---- heading strip: 315° NW … 0°, a scale, an orange marker ----
						const hy = cy + 30;
						g.text("315° NW", lblO, ORANGE, cx - 74, hy);
						g.text("0°", lblD, "#8e8e93", cx + 56, hy);
						const ly = hy + 24;
						for (let i = -7; i <= 7; i++) {
							const x = cx + i * 8;
							const big = i % 3 === 0;
							g.line(x, ly, x, ly + (big ? 9 : 5), 1, "#48484a");
						}
						// orange marker triangle at center of the scale
						g.line(cx - 4, ly - 6, cx, ly - 1, 2, ORANGE);
						g.line(cx, ly - 1, cx + 4, ly - 6, 2, ORANGE);
						g.text("NW", lblD, "#636366", cx - 8, ly + 11);

						// ---- bottom: activity rings + sunset ----
						const ay = H - 40;
						g.arc(cx, ay, 18, -90, 270, 4, "#3a0a1a");
						g.arc(cx, ay, 18, -90, 250, 4, MOVE);
						g.arc(cx, ay, 12, -90, 190, 4, EXER);
						g.arc(cx, ay, 6, -90, 120, 4, STAND);
						g.text("7:33", lblW, "#e5e5ea", cx - 52, ay - 7);
						g.text("53°", lblW, "#e5e5ea", cx + 28, ay - 7);
					}}
				/>
			</Container>
		);
	},
	{ skin: bg, style: base },
);
