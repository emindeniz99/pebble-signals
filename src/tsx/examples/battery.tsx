// battery — the reactive battery gauge on the watch itself: live charge percent
// plus a charging indicator, straight from runtime/battery's useBattery hook. The
// getter is SEEDED from the host at construction (the battery host supports an
// immediate probe — unlike accel/compass), so the first paint shows the true
// charge, not a placeholder; each later battery event repaints only the Label that
// read the changed field. Drive it headlessly from the emulator (no wrist needed):
//   pebble emu-battery --percent 20              # charge drops to 20%
//   pebble emu-battery --percent 20 --charging   # ... and shows "charging"
//   pebble emu-battery --percent 100             # full
//
// useBattery is called INSIDE the render build on purpose: jsx-runtime runs the
// build under a root owner (createRoot), so the hook's onCleanup binds there and
// the shared Battery is close()d when the app is torn down (no sensor leak). No
// buttons: the value is driven externally by emu-battery, so there is nothing
// useful to bind a press to (mirrors examples/accel.tsx, a read-only sensor face).
import { render } from "runtime/jsx-runtime";
import { useBattery } from "runtime/battery";

const bg = new Skin({ fill: "black" });
const title = new Style({ font: "bold 24px Gothic", color: "white" });
const body = new Style({ font: "18px Gothic", color: "#AAAAAA" });

render(
	() => {
		const battery = useBattery(); // one shared host Battery, seeded immediately at construction
		return (
			<Container left={0} right={0} top={0} bottom={0}>
				<Column>
					<Label style={title} string={() => `${battery().percent}%`} />
					<Label
						style={body}
						string={() =>
							battery().charging ? "charging" : battery().plugged ? "on power" : "on battery"
						}
					/>
				</Column>
			</Container>
		);
	},
	{ skin: bg, style: body },
);
