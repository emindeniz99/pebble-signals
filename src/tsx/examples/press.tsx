// runtime/press receipt — the three press-gesture hooks on ONE focused Container.
// Each hook returns a handler BAG spread onto the (single) focused node; the bag
// keys are the jsx-runtime button events for its button, so all three coexist on
// one node (Select / Up / Down do not collide). The hooks are called INSIDE the
// render build so their `track(clear)` binds to the render root (Rule 5). Labels
// reflect the app-owned state the gestures drive — the hooks own only the timing.
// Buttons (QEMU touch crashes the firmware — handbook gotcha 2):
//   SELECT — hold ~600ms to CONFIRM (release early does nothing).
//   UP     — press-and-hold to auto-repeat the counter, ACCELERATING.
//   DOWN   — double-click to reset (counter + confirm).
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { useLongPress, useMultiClick, useRepeatClick } from "runtime/press";

const bg = new Skin({ fill: "black" });
const title = new Style({ font: "18px Gothic", color: "#808080", horizontal: "center" });
const big = new Style({ font: "bold 42px Bitham", color: "white", horizontal: "center" });
const state = new Style({ font: "bold 24px Gothic", color: "#33cc88", horizontal: "center" });
const hint = new Style({ font: "14px Gothic", color: "#808080", horizontal: "center" });

// App-owned state the gestures drive (module-scope signals, like menu.tsx). The
// hooks never touch these — they just call the callbacks below.
const [count, setCount] = useState(0);
const [confirmed, setConfirmed] = useState(false);
const reset = () => {
	setCount(0);
	setConfirmed(false);
};

render(
	() => (
		<Container
			left={0}
			right={0}
			top={0}
			bottom={0}
			focus={true}
			{...useLongPress("Select", 600, () => setConfirmed(true))}
			{...useRepeatClick("Up", () => setCount((c: number) => c + 1))}
			{...useMultiClick("Down", { 2: reset })}
		>
			<Column>
				<Label style={title} string="press gestures" />
				<Label style={big} string={() => "n " + count()} />
				<Label style={state} string={() => (confirmed() ? "CONFIRMED" : "hold SELECT")} />
				<Label style={hint} string="UP hold · DOWN x2 reset" />
			</Column>
		</Container>
	),
	{ skin: bg, style: title },
);
