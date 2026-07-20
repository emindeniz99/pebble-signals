// Example: an "embrace the round" watchface (Apple-Watch-Ultra-style) — the
// circular EDGE is the canvas. A full-bleed dial of 60 minute ticks (12 brighter
// hour ticks) rings the rim, and a bright accent SECONDS marker sweeps the
// OUTERMOST ring once a minute; a big 24h time is anchored in the center. This
// is the opposite of "inset to a safe box": the design USES the whole circle.
//
// REACTIVITY: `useClock("second")` returns a Date thunk that updates every
// second; reading it inside the Canvas paint auto-subscribes, so the seconds
// marker (and the minute rollover) repaint for free — one Port, drawn edge to
// edge (draw.ts Canvas is the device-proven substrate: g.line/g.text only).
import { render, screen } from "runtime/jsx-runtime";
import { Canvas } from "runtime/draw";
import { useClock } from "runtime/clock";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "18px Gothic", color: "white" });
// App-scope Styles are fine (only PRELOADED runtime/ modules freeze them).
const bigStyle = new Style({ font: "bold 49px Roboto", color: "white" });

const TWO = (n: number) => (n < 10 ? "0" : "") + n;

const now = useClock("second");

render(
	() => {
		const W = screen.width;
		const H = screen.height;
		const cx = W / 2;
		const cy = H / 2;
		const R = Math.min(cx, cy); // outer radius (to the rim)
		return (
			<Container left={0} right={0} top={0} bottom={0}>
				<Canvas
					width={W}
					height={H}
					paint={(g) => {
						const d = now();
						const s = d.getSeconds();
						// full-bleed dial: 60 minute ticks, every 5th (the hours) longer/brighter
						for (let i = 0; i < 60; i++) {
							const a = ((i * 6 - 90) * Math.PI) / 180;
							const hour = i % 5 === 0;
							const rIn = hour ? R - 14 : R - 8;
							const rOut = R - 2;
							const ca = Math.cos(a);
							const sa = Math.sin(a);
							g.line(
								cx + rIn * ca,
								cy + rIn * sa,
								cx + rOut * ca,
								cy + rOut * sa,
								hour ? 3 : 1,
								hour ? "#8a8a8a" : "#3a3a3a",
							);
						}
						// the HERO: a bright accent seconds marker on the OUTERMOST ring
						const sAng = ((s * 6 - 90) * Math.PI) / 180;
						const cS = Math.cos(sAng);
						const sS = Math.sin(sAng);
						g.line(cx + (R - 18) * cS, cy + (R - 18) * sS, cx + (R - 1) * cS, cy + (R - 1) * sS, 5, "#ff7a00");
						// big 24h time, anchored center (g.text draws from top-left → offset to center)
						const time = TWO(d.getHours()) + ":" + TWO(d.getMinutes());
						g.text(time, bigStyle, "white", cx - 68, cy - 30);
					}}
				/>
			</Container>
		);
	},
	{ skin: bg, style: base },
);
