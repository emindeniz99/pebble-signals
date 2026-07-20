// compass — the reactive magnetometer on the watch itself: a north-arrow that
// swings to magnetic north plus the live heading in degrees, straight from
// runtime/compass's useCompass hook. The needle and the Labels each read
// heading() inside their own reactive scope (the Canvas paint / a Label thunk),
// so a new sample repaints only what changed. The heading is DEGREES from magnetic
// north, increasing COUNTER-CLOCKWISE (the host convention); the needle rotates by
// the documented CLOCKWISE conversion `360 - heading`. Drive it headlessly from the
// emulator (no walking outside needed):
//   pebble emu-compass --calibrated --heading 90    # needle swings, "heading 90°"
//   pebble emu-compass --heading 0                  # needle points to the north tick
//
// The hook is called INSIDE the render build on purpose: jsx-runtime runs the build
// under a root owner (createRoot), so useCompass's onCleanup binds there and the one
// host Compass is close()d when the app is torn down (no sensor leak). Integrator
// note: the C magnetometer path is stamped `untested` — confirm the gate fires.
import { render } from "runtime/jsx-runtime";
import { useCompass } from "runtime/compass";
import { Canvas } from "runtime/draw";

const bg = new Skin({ fill: "black" });
const title = new Style({ font: "bold 24px Gothic", color: "white" });
const body = new Style({ font: "18px Gothic", color: "#AAAAAA" });

render(
	() => {
		const heading = useCompass(); // one shared Compass, default 2° filter ({ filter: 15 } to throttle)
		return (
			<Container left={0} right={0} top={0} bottom={0}>
				<Column>
					<Label style={title} string="compass" />
					<Canvas
						width={120}
						height={120}
						fill="black"
						paint={(g) => {
							const h = heading(); // reactive read — the Canvas effect tracks it
							// documented CLOCKWISE north-arrow angle (heading is CCW): 0 = up.
							const a = (((360 - h) % 360) * Math.PI) / 180;
							const cx = 60;
							const cy = 60;
							const r = 46;
							g.strokeCircle(cx, cy, r, "#0088FF", 2); // bezel
							g.fillCircle(cx, cy - r + 5, 3, "#FF4040"); // fixed north tick (12 o'clock)
							// needle: center → `a` clockwise from up (sin/-cos maps 0=up, 90=right)
							g.line(
								cx,
								cy,
								cx + Math.round(r * 0.78 * Math.sin(a)),
								cy - Math.round(r * 0.78 * Math.cos(a)),
								3,
								"white",
							);
							// short tail opposite the tip, dimmer
							g.line(
								cx,
								cy,
								cx - Math.round(r * 0.34 * Math.sin(a)),
								cy + Math.round(r * 0.34 * Math.cos(a)),
								3,
								"#666666",
							);
							g.fillCircle(cx, cy, 4, "#0088FF"); // hub
						}}
					/>
					<Label style={body} string={() => `heading ${Math.round(heading())}°`} />
					<Label style={body} string={() => `arrow ${Math.round((360 - heading()) % 360)}° cw`} />
				</Column>
			</Container>
		);
	},
	{ skin: bg, style: body },
);
