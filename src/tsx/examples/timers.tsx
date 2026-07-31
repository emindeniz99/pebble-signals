// runtime/timers receipt — ergonomic reactive timer hooks on the watch.
// A counter ticks up once per "second" via useInterval; a one-shot useTimeout
// flips a "done" label after 3s (a setInterval that clears ITSELF — setTimeout
// is not assumed on device); pause/resume is a REACTIVE delay that toggles
// between 1000 and null (null = no live timer). Both hooks are owned by the
// render root, so they auto-clean if the tree is ever torn down.
// Buttons (QEMU touch crashes the firmware — handbook gotcha 2):
//   up = pause / resume the counter · down = reset the counter to 0.
// Build: APP=timers ./build.sh
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { useInterval, useTimeout } from "runtime/timers";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "24px Gothic", color: "white" });
const title = new Style({ font: "bold 24px Gothic", color: "#22cc55" });

const [count, setCount] = useState(0);
const [done, setDone] = useState(false);
const [paused, setPaused] = useState(false);

// The hooks are called INSIDE the component (Rule 5 — lazy at runtime, owned by
// render's root), not at module scope.
const App = () => {
	// One tick per "second". The delay is a THUNK, so it is reactive: null while
	// paused (no live timer) and 1000 while running — flipping `paused` tears the
	// interval down / brings it back with no manual timer juggling.
	useInterval(() => setCount((c: number) => c + 1), () => (paused() ? null : 1000));
	// Fire ONCE after 3s: flip the done flag, then self-clear.
	useTimeout(() => setDone(true), 3000);
	return (
		<Container
			left={0}
			right={0}
			top={0}
			bottom={0}
			focus={true}
			onPressUp={() => setPaused((p: boolean) => !p)}
			onPressDown={() => setCount(0)}
		>
			<Column>
				<Label style={title} string="timers" />
				<Label string={() => "count " + count()} />
				<Label string={() => (paused() ? "paused - UP resumes" : "running - UP pauses")} />
				<Label string={() => (done() ? "done!" : "waiting 3s...")} />
			</Column>
		</Container>
	);
};

render(() => <App />, { skin: bg, style: base });
