// Example: an Apple-Watch-Ultra "Wayfinder"-style watchface on the ROUND screen.
// Design (Jony Ive / the Ultra face): TYPOGRAPHY is the hero — HH:MM white and
// :SS the SAME size in quiet gray, baseline-locked as one wide unit. The EDGE is
// a STATIC instrument dial: the ticks are LONGEST + WHITE at 12 o'clock and
// taper — shorter and dimmer — SYMMETRICALLY toward the sides/bottom (a spotlight
// at the top, exactly like the reference frame). It does NOT grow with elapsed
// seconds. The seconds read DIGITALLY (`:SS` gray); a single bright orange tick
// marks the current second and STEPS one bar per second around the rim (çubuk
// çubuk) — the only moving mark on the frame. ONE accent (Apple orange), deep
// black, disciplined grays, complications pushed to the rim to use the circle.
//
// `useClock("second")` repaints once a second, so the orange second tick steps
// forward exactly one bar each second. One draw.ts Canvas Port (arc/line/circle/text).
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

						// ---- STATIC instrument bezel + a single stepping orange second ----
						// 60 ticks. The dial is a SYMMETRIC gradient centered on 12 o'clock:
						// longest + white at the top, tapering shorter + dimmer toward the
						// sides/bottom (the reference "spotlight at the top", NOT a growing
						// wedge). The current second is ONE bright orange tick that steps a
						// bar per second — the only moving mark on the frame.
						for (let i = 0; i < 60; i++) {
							const a = (i * 6 - 90) * RAD;
							const ca = Math.cos(a);
							const sa = Math.sin(a);
							// angular distance from 12 o'clock, 0 (top) .. 1 (bottom)
							const fromTop = Math.min(i, 60 - i) / 30;
							const hour = i % 5 === 0;
							let col: string;
							let th: number;
							let len: number; // inward length from the rim
							if (i === s) {
								col = ORANGE;
								th = 3;
								len = 16; // the moving second: brightest, tallest — no tail
							} else if (fromTop < 0.18) {
								col = "#ffffff";
								th = 2;
								len = hour ? 15 : 13;
							} else if (fromTop < 0.38) {
								col = "#c7c7cc";
								th = 2;
								len = hour ? 12 : 10;
							} else if (fromTop < 0.58) {
								col = "#8e8e93";
								th = 1;
								len = hour ? 9 : 7;
							} else if (fromTop < 0.78) {
								col = "#5a5a5e";
								th = 1;
								len = hour ? 7 : 5;
							} else {
								col = "#3a3a3c";
								th = 1;
								len = hour ? 5 : 4;
							}
							const rIn = R - 2 - len;
							g.line(cx + rIn * ca, cy + rIn * sa, cx + (R - 2) * ca, cy + (R - 2) * sa, th, col);
						}

						// ---- top complications, pushed toward the rim (reference layout:
						//      [53 gauge] [compass] [conditions icon]) ----
						// left gauge "53" + 50/56
						const lgx = cx - 58;
						const gy = 58;
						g.arc(lgx, gy, 20, 145, 145 + 250, 3, "#2c2c2e");
						g.arc(lgx, gy, 20, 145, 145 + 250 * 0.55, 3, EXER);
						g.text("53", num, "white", lgx - 11, gy - 11);
						g.text("50", lblD, "#636366", lgx - 25, gy + 15);
						g.text("56", lblD, "#636366", lgx + 13, gy + 15);
						// center compass: ring + N/E/S/W + orange CROSSHAIR (⌖, as in the ref)
						g.strokeCircle(cx, gy, 19, "#48484a", 2);
						g.text("N", dir, "#e5e5ea", cx - 4, gy - 30);
						g.text("S", lblD, "#636366", cx - 3, gy + 20);
						g.text("W", lblD, "#636366", cx - 26, gy - 8);
						g.text("E", lblD, "#636366", cx + 20, gy - 8);
						g.line(cx - 6, gy, cx + 6, gy, 2, ORANGE);
						g.line(cx, gy - 6, cx, gy + 6, 2, ORANGE);
						g.strokeCircle(cx, gy, 3, ORANGE, 1);
						// right: conditions glyph — an orange mountain/tent triangle outline
						const rgx = cx + 58;
						g.line(rgx - 10, gy + 8, rgx, gy - 9, 2, ORANGE);
						g.line(rgx, gy - 9, rgx + 10, gy + 8, 2, ORANGE);
						g.line(rgx - 10, gy + 8, rgx + 10, gy + 8, 2, ORANGE);
						g.line(rgx - 3, gy - 1, rgx + 3, gy - 1, 2, ORANGE);

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

						// ---- bottom row (reference: [rings] [sunset] [UV gauge]) ----
						const ay = H - 40;
						// left: activity rings
						const blx = cx - 56;
						g.arc(blx, ay, 16, -90, 270, 4, "#3a0a1a");
						g.arc(blx, ay, 16, -90, 250, 4, MOVE);
						g.arc(blx, ay, 10, -90, 190, 4, EXER);
						g.arc(blx, ay, 4, -90, 120, 4, STAND);
						// center: sunset — a small orange sun over the horizon + "7:33"
						g.arc(cx, ay - 6, 6, 180, 360, 2, ORANGE);
						g.line(cx - 9, ay - 6, cx + 9, ay - 6, 1, "#636366");
						g.text("7:33", lblW, "#e5e5ea", cx - 15, ay + 2);
						// right: UV index gauge "4"
						const brx = cx + 56;
						g.arc(brx, ay, 16, 145, 145 + 250, 3, "#2c2c2e");
						g.arc(brx, ay, 16, 145, 145 + 250 * 0.33, 3, ORANGE);
						g.text("4", num, "white", brx - 5, ay - 9);
					}}
				/>
			</Container>
		);
	},
	{ skin: bg, style: base },
);
