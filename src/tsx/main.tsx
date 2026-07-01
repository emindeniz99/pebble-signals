// M5 — Show: tap toggles a subtree between children and fallback. Each
// side is built in its own root and disposed on swap; heap must return to
// its floor after repeated cycles (leaked effects would grow it).
import { render } from "runtime/jsx-runtime";
import { Show } from "runtime/flow";
import { signal } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const onSkin = new Skin({ fill: "#1a6" });
const offSkin = new Skin({ fill: "#333" });
const base = new Style({ font: "24px Gothic", color: "white" });
const big = new Style({ font: "28px Gothic", color: "white" });
const hint = new Style({ font: "18px Gothic", color: "silver" });

const on = signal(false);
const toggles = signal(0);

render(() => (
	<Container left={0} right={0} top={0} bottom={0} backgroundTouch={true}
		onTap={() => { on.value = !on.value; toggles.value += 1; }}>
		<Column>
			<Label string={() => "M5 toggles: " + toggles.value} />
			<Show when={() => on.value}
				width={180} height={80}
				fallback={() => (
					<Container width={180} height={80} skin={offSkin}>
						<Label style={hint} string="fallback (off)" />
					</Container>
				)}>
				{() => (
					<Container width={180} height={80} skin={onSkin}>
						<Column>
							<Label style={big} string="shown!" />
							<Label style={hint} string={() => "at toggle " + toggles.value} />
						</Column>
					</Container>
				)}
			</Show>
			<Label style={hint} string="tap to toggle" />
		</Column>
	</Container>
), { skin: bg, style: base });
