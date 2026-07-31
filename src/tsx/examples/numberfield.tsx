// runtime/numberfield receipt — a 0..100 percentage stepper. The APP owns the
// value (a signal); the up/down buttons step it by 5, clamped to [0,100].
// NumberField is DISPLAY-ONLY: it reflects the value (big + centered, a '%'
// suffix, and '+'/'-' affordance hints above/below) and re-strings for free —
// `value` is a thunk read inside NumberField's driving effect (idiom 5b), so a
// signal write updates the number with no bind wiring. `min`/`max` here also
// clamp the DISPLAY, a belt-and-braces guard alongside the app's own clamp.
// Buttons (QEMU touch crashes the firmware — handbook gotcha 2):
//   up = +5 (clamped ≤ 100) · down = -5 (clamped ≥ 0).
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { NumberField } from "runtime/numberfield";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "18px Gothic", color: "white" });

const [pct, setPct] = useState(50);
const up = () => setPct((v: number) => Math.min(v + 5, 100));
const down = () => setPct((v: number) => Math.max(v - 5, 0));

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0} focus={true} onPressUp={up} onPressDown={down}>
			<NumberField value={pct} min={0} max={100} unit="%" />
		</Container>
	),
	{ skin: bg, style: base },
);
