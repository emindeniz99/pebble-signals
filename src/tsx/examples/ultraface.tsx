// Example: an Apple-Watch-Ultra "Wayfinder"-style watchface on the ROUND screen.
// Design (Jony Ive / the Ultra face): TYPOGRAPHY is the hero — HH:MM white and
// :SS the SAME size in quiet gray, baseline-locked as one wide unit; the EDGE is
// an instrument tick dial (white), and the SECONDS step it TICK BY TICK — the
// ticks 12→now light accent orange one per second (discrete "çubuk çubuk", not a
// smooth sweep), the current tick brightest. ONE accent (Apple orange), deep
// black, disciplined grays, the complications pushed toward the rim to use the
// whole circle without clutter.
//
// `useClock("second")` repaints once a second, so the lit tick steps forward
// exactly one bar each second. One draw.ts Canvas Port (arc/line/circle/text).
import { render, screen } from "runtime/jsx-runtime";
import { Canvas } from "runtime/draw";
import { useClock } from "runtime/clock";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "18px Gothic", color: "white" });
// App-scope Styles are fine (only PRELOADED runtime/ modules freeze them).
const hhmm = new Style({ font: "bold 49px Roboto", color: "white" });
const hhmmGray = new Style({ font: "bold 49px Roboto", color: "#8e8e93" }); // :SS same SIZE, gray
const lblO = new Style({ font: "18px Gothic", color: "#ff9500" });
const lblW = new Style({ font: "14px Gothic", color: "#e5e5ea" });
const lblD = new Style({ font: "14px Gothic", color: "#636366" });
const num = new Style({ font: "bold 18px Gothic", color: "white" });
const dir = new Style({ font: "bold 14px Gothic", color: "#e5e5ea" });

const ORANGE = "#ff9500";
const ORANGE_DIM = "#7a4a10";
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

						// ---- instrument bezel + TICK-BY-TICK seconds ----
						// 60 ticks; the ones 12→now light orange one-per-second (the current
						// tick brightest), the rest are the white dial. This IS the seconds:
						// each second one more bar lights, stepping çubuk çubuk.
						for (let i = 0; i < 60; i++) {
							const a = (i * 6 - 90) * RAD;
							const ca = Math.cos(a);
							const sa = Math.sin(a);
							const hour = i % 5 === 0;
							let col: string;
							let th: number;
							if (i === s) {
								col = ORANGE;
								th = 3;
							} else if (i < s) {
								col = ORANGE_DIM;
								th = hour ? 2 : 1;
							} else {
								col = hour ? "#d0d0d2" : "#48484a";
								th = hour ? 2 : 1;
							}
							const rIn = hour || i === s ? R - 13 : R - 7;
							g.line(cx + rIn * ca, cy + rIn * sa, cx + (R - 2) * ca, cy + (R - 2) * sa, th, col);
						}

						// ---- top complications, pushed toward the rim ----
						// left gauge "53" + 50/56
						const lgx = cx - 58;
						const gy = 58;
						g.arc(lgx, gy, 20, 145, 145 + 250, 3, "#2c2c2e");
						g.arc(lgx, gy, 20, 145, 145 + 250 * 0.55, 3, EXER);
						g.text("53", num, "white", lgx - 11, gy - 11);
						g.text("50", lblD, "#636366", lgx - 25, gy + 15);
						g.text("56", lblD, "#636366", lgx + 13, gy + 15);
						// center compass: ring + N/E/S/W + orange needle at 315°
						g.strokeCircle(cx, gy, 19, "#48484a", 2);
						g.text("N", dir, "#e5e5ea", cx - 4, gy - 30);
						g.text("S", lblD, "#636366", cx - 3, gy + 20);
						g.text("W", lblD, "#636366", cx - 26, gy - 8);
						g.text("E", lblD, "#636366", cx + 20, gy - 8);
						g.line(cx, gy, cx + 13 * Math.cos((315 - 90) * RAD), gy + 13 * Math.sin((315 - 90) * RAD), 2, ORANGE);
						g.fillCircle(cx, gy, 2, "#e5e5ea");
						// right gauge "4" (UV)
						const rgx = cx + 58;
						g.arc(rgx, gy, 20, 145, 145 + 250, 3, "#2c2c2e");
						g.arc(rgx, gy, 20, 145, 145 + 250 * 0.33, 3, ORANGE);
						g.text("4", num, "white", rgx - 5, gy - 11);

						// ---- HERO time: HH:MM white + :SS gray, SAME size, one baseline ----
						const yt = cy - 30;
						g.text(TWO(d.getHours()) + ":" + TWO(d.getMinutes()), hhmm, "white", cx - 96, yt);
						g.text(":" + TWO(s), hhmmGray, "#8e8e93", cx + 28, yt);

						// ---- heading strip: 315° NW … 0°, scale numbers, orange marker ----
						const hy = cy + 32;
						g.text("315°", lblW, "#e5e5ea", cx - 76, hy);
						g.text("NW", lblO, ORANGE, cx - 38, hy);
						g.text("0°", lblO, ORANGE, cx + 58, hy);
						const ly = hy + 22;
						for (let i = -8; i <= 8; i++) {
							const x = cx + i * 7;
							g.line(x, ly, x, ly + (i % 3 === 0 ? 8 : 4), 1, "#48484a");
						}
						g.line(cx - 4, ly - 7, cx, ly - 1, 2, ORANGE);
						g.line(cx, ly - 1, cx + 4, ly - 7, 2, ORANGE);
						g.text("NW", lblD, "#636366", cx - 8, ly + 10);

						// ---- bottom: activity rings + sunset + temp ----
						const ay = H - 38;
						g.arc(cx, ay, 17, -90, 270, 4, "#3a0a1a");
						g.arc(cx, ay, 17, -90, 250, 4, MOVE);
						g.arc(cx, ay, 11, -90, 190, 4, EXER);
						g.arc(cx, ay, 5, -90, 120, 4, STAND);
						g.text("7:33", lblW, "#e5e5ea", cx - 50, ay - 7);
						g.text("53°", lblW, "#e5e5ea", cx + 26, ay - 7);
					}}
				/>
			</Container>
		);
	},
	{ skin: bg, style: base },
);
