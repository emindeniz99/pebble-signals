// runtime/toggle receipt — a reactive on/off Toggle over a boolean signal. The
// knob slides to the right end (pill green) when on and the left end (pill gray)
// when off, proving the Toggle repaints for free: `on` is read inside the
// composed Canvas's paint, so its reads auto-track (signal flip → Canvas effect
// → invalidate → repaint) with no bind wiring.
// Buttons (QEMU touch crashes the firmware — README gotcha 2):
//   select = flip on/off.
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { Toggle } from "runtime/toggle";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "24px Gothic", color: "white" });

const [on, setOn] = useState(false);
const flip = () => setOn((b: boolean) => !b);

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0} focus={true} onPressSelect={flip}>
			<Column>
				<Toggle on={on} width={64} height={32} />
				<Label string={() => "on=" + on()} />
			</Column>
		</Container>
	),
	{ skin: bg, style: base },
);
