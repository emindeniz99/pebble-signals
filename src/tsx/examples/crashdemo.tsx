// Example: the DEFAULT error boundary in action (2026-07 redesign).
// A per-second binding starts throwing at n=3: render()'s boundary tears the
// tree down and paints the crash screen — the actual error on the watch plus
// "[any button: exit]"; pressing a button rethrows (fxAbort, stack in
// `pebble logs`) and the host exits the mod. The interval below is a
// module-level (unowned) effect ON PURPOSE: it keeps writing after the
// crash, proving post-teardown notifies hit disposed effects and no-op.
// Build: APP=crashdemo node build.mts
import { render } from "runtime/jsx-runtime";
import { useEffect, useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "bold 24px Gothic", color: "white" });

const [n, setN] = useState(0);
useEffect(() => {
	const id = setInterval(() => setN((v: number) => v + 1), 1000);
	return () => clearInterval(id);
});

render(
	() => (
		<Column left={0} right={0} top={0} bottom={0}>
			<Label
				string={() => {
					if (n() >= 3) throw new Error("demo boom at n=" + n());
					return "n=" + n();
				}}
			/>
		</Column>
	),
	{ skin: bg, style: base },
);
