// runtime/spinner receipt — an animated loading indicator that OWNS its spin.
// Unlike the display-only widgets, a Spinner drives its own ~30fps arc rotation
// (internal signal + a lazily created setInterval, stopped on screen dispose) —
// no `value` prop, nothing for the app to tick. `running` is a reactive thunk,
// so a button freezes and resumes the animation without any bind wiring.
// Buttons only (QEMU touch crashes the firmware — handbook gotcha 2):
//   up = pause / resume the spinner.
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { Spinner } from "runtime/spinner";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "18px Gothic", color: "white" });

const [running, setRunning] = useState(true);

render(
	() => (
		<Container
			left={0}
			right={0}
			top={0}
			bottom={0}
			focus={true}
			onPressUp={() => setRunning((r: boolean) => !r)}
		>
			<Column>
				<Spinner size={72} trackColor="#202020" thickness={6} running={running} />
				<Label top={16} string={() => (running() ? "Loading..." : "Paused")} />
			</Column>
		</Container>
	),
	{ skin: bg, style: base },
);
