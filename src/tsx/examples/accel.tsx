// accel — the reactive accelerometer on the watch itself: live x/y/z (RAW
// milli-g, ~+/-4000 with 1000 ~= 1g) plus the last tap direction, straight from
// runtime/accel's hooks. useAccel and useTap SHARE the one host Accelerometer
// (the C wrapper allows "only one"); each Label binds a thunk, so only the axis
// that changed repaints. Drive it headlessly from the emulator (no wrist needed):
//   pebble emu-accel gravity+x           # tilt: x -> ~ +1000, y/z -> ~0
//   pebble emu-accel gravity-z           # face-up/down flips z's sign
//   pebble emu-tap --direction x+        # a tap -> the tap Label shows "x+"
//
// The hooks are called INSIDE the render build on purpose: jsx-runtime runs the
// build under a root owner (createRoot), so each hook's onCleanup binds there and
// the shared Accelerometer is close()d when the app is torn down (no sensor leak).
import { render } from "runtime/jsx-runtime";
import { useAccel, useTap } from "runtime/accel";

const bg = new Skin({ fill: "black" });
const title = new Style({ font: "bold 24px Gothic", color: "white" });
const body = new Style({ font: "18px Gothic", color: "#AAAAAA" });

render(
	() => {
		const accel = useAccel(); // one shared Accelerometer, default 25 Hz ({ hz: 50 } etc. to go faster)
		const tap = useTap(); // shares that same instance — single tap direction
		return (
			<Container left={0} right={0} top={0} bottom={0}>
				<Column>
					<Label style={title} string="accel milli-g" />
					<Label style={body} string={() => `x ${accel().x}`} />
					<Label style={body} string={() => `y ${accel().y}`} />
					<Label style={body} string={() => `z ${accel().z}`} />
					<Label style={body} string={() => `tap ${tap() ?? "-"}`} />
				</Column>
			</Container>
		);
	},
	{ skin: bg, style: body },
);
