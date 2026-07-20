// runtime/state receipt — three ergonomic state hooks on the watch. A toggle
// (SELECT flips ON/OFF), a counter clamped to 0..10 (UP/DOWN step ±1, BACK
// resets to 0), and a debounced mirror of the counter that lags 500ms behind:
// mash UP and "count" jumps instantly while "settled" only catches up once you
// stop pressing for 500ms. useDebounce composes useTimeout (a self-clearing
// setInterval — setTimeout is not on device); all three hooks are called INSIDE
// the component so render's root OWNS them and they auto-clean on teardown.
// Buttons (QEMU touch crashes the firmware — README gotcha 2):
//   up = count +1 · down = count -1 · select = toggle · back = reset count
// Build: APP=state ./build.sh
import { render } from "runtime/jsx-runtime";
import { useToggle, useCounter, useDebounce } from "runtime/state";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "18px Gothic", color: "white" });
const title = new Style({ font: "bold 24px Gothic", color: "#22cc55" });

const App = () => {
	const [on, toggle] = useToggle();
	const [count, counter] = useCounter(0, { min: 0, max: 10 });
	// Debounce the live counter: `settled` follows `count` only after it has been
	// quiet for 500ms, so a burst of presses collapses to the final value.
	const settled = useDebounce(count, 500);
	return (
		<Container
			left={0}
			right={0}
			top={0}
			bottom={0}
			focus={true}
			onPressUp={counter.inc}
			onPressDown={counter.dec}
			onPressSelect={toggle}
			onPressBack={counter.reset}
		>
			<Column>
				<Label style={title} string="state hooks" />
				<Label string={() => "toggle: " + (on() ? "ON" : "OFF")} />
				<Label string={() => "count: " + count() + " (0..10)"} />
				<Label string={() => "settled: " + settled()} />
			</Column>
		</Container>
	);
};

render(() => <App />, { skin: bg, style: base });
