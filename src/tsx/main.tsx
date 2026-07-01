// M2 — static JSX path: a Column of Labels rendered through jsx-runtime.
import { render } from "runtime/jsx-runtime";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "24px Gothic", color: "white" });
const small = new Style({ font: "18px Gothic", color: "silver" });

// Round-display note (gabbro): an unconstrained Column measures its
// children and centers in the Application, keeping text in the safe area.
render(() => (
	<Column>
		<Label string="signal-piu M2" />
		<Label string="JSX -> real Piu nodes" style={small} />
		<Label string="no virtual DOM" style={small} />
	</Column>
), { skin: bg, style: base });
