// runtime/button receipt — a focusable, pressable Button. Pressing SELECT
// increments a counter; TWO reactive state lines above it follow the count (so the
// press is visible in the UI), and the button's background Skin SWAPS from gray to
// blue WHILE HELD — proving the onPress + reactive-skin substrate on device.
// Holding SELECT past ~0.5s fires onLongPress, which resets the count to 0.
// Button events reach the FOCUSED node, so the Button owns focus (focus defaults
// on) — one focused Button per screen (handbook single-focus note).
// Buttons (QEMU touch crashes the firmware — handbook gotcha 2):
//   select = press (count + 1) · hold select = long press (reset to 0).
// Build: APP=button ./build.sh
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { Button } from "runtime/button";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "18px Gothic", color: "white", horizontal: "center" });
const big = new Style({ font: "bold 24px Gothic", color: "white", horizontal: "center" });

const [count, setCount] = useState(0);

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0}>
			<Column>
				<Label style={big} string={() => "Count: " + count()} />
				<Label style={base} string={() => "Doubled: " + count() * 2} />
				<Button
					label="Press SELECT"
					onPress={() => setCount((c: number) => c + 1)}
					onLongPress={() => setCount(0)}
					width={160}
					height={44}
				/>
			</Column>
		</Container>
	),
	{ skin: bg, style: base },
);
