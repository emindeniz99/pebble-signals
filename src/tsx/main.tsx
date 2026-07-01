// M3 — reactive binding: a signal ticks on a timer and one Label updates.
// The tree is built once; each tick is a single Piu property assignment.
import { render } from "runtime/jsx-runtime";
import { signal } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "24px Gothic", color: "white" });
const big = new Style({ font: "36px Gothic", color: "white" });

const ticks = signal(0);
setInterval(() => { ticks.value += 1; }, 1000);

render(() => (
	<Column>
		<Label string="signal-piu M3" />
		<Label style={big} string={() => "ticks: " + ticks.value} />
	</Column>
), { skin: bg, style: base });
