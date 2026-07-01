// M4 — touch: onTap maps to active:true + a Behavior whose onTouchEnded
// calls the handler; a tap anywhere increments the counter signal.
import { render } from "runtime/jsx-runtime";
import { signal } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "24px Gothic", color: "white" });
const big = new Style({ font: "36px Gothic", color: "white" });
const hint = new Style({ font: "18px Gothic", color: "silver" });

const count = signal(0);

render(() => (
	<Container left={0} right={0} top={0} bottom={0} backgroundTouch={true}
		onTap={() => { count.value += 1; }}>
		<Column>
			<Label string="signal-piu M4" />
			<Label style={big} string={() => "count: " + count.value} />
			<Label style={hint} string="tap screen to increment" />
		</Column>
	</Container>
), { skin: bg, style: base });
