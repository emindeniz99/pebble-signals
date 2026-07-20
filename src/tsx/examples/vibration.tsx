// useHaptics demo — UP = short buzz, SELECT = double, DOWN = a custom pattern.
// The motor is not observable on QEMU (no emu-vibe), so the screen echoes the
// last-fired haptic in a Label as the visible receipt; the buzz is felt on real
// hardware. Build: APP=vibration
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { useHaptics } from "runtime/vibration";

const bg = new Skin({ fill: "black" });
const big = new Style({ font: "bold 28px Gothic", color: "white" });
const dim = new Style({ font: "18px Gothic", color: "#FFAA55" });

const [last, setLast] = useState("ready");

// useHaptics() is called INSIDE the component (Rule 5 — lazy at runtime, owned by
// render's root), not at module scope, so its onCleanup binds and a screen torn
// down mid-buzz stops the motor. A module-scope call would not clean up (see
// runtime/accel.ts) — this mirrors runtime/timers' example.
const App = () => {
	const h = useHaptics();
	return (
		<Container left={0} right={0} top={0} bottom={0} focus={true}
			onPressUp={() => { h.short(); setLast("short"); }}
			onPressSelect={() => { h.double(); setLast("double"); }}
			onPressDown={() => { h.pattern([100, 50, 100]); setLast("pattern"); }}>
			<Column>
				<Label style={big} string={() => last()} />
				<Label style={dim} string="UP short SEL double DN pattern" />
			</Column>
		</Container>
	);
};

render(() => <App />, { skin: bg, style: big });
