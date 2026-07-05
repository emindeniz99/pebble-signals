// Example: the DEFAULT error boundary in action (2026-07 redesign).
// A per-second binding starts throwing at n=3: render()'s boundary tears the
// tree down and paints the crash screen — the actual error on the watch plus
// "[select: retry · back: exit]". State and timer live INSIDE the component,
// so SELECT (retry) rebuilds under a fresh root and the face starts over at
// n=0 (three more good seconds, then it crashes again — the full loop is
// drivable in the emulator via tools/drive.py). BACK rethrows the original
// error: fxAbort with stack in `pebble logs`, and the host exits the mod.
// Build: APP=crashdemo node build.mts
import { render } from "runtime/jsx-runtime";
import { useEffect, useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "bold 24px Gothic", color: "white" });

function Face() {
	const [n, setN] = useState(0);
	// owned by the render root: the boundary's teardown clears this interval
	useEffect(() => {
		const id = setInterval(() => setN((v: number) => v + 1), 1000);
		return () => clearInterval(id);
	});
	return (
		<Column left={0} right={0} top={0} bottom={0}>
			<Label
				string={() => {
					if (n() >= 3) throw new Error("demo boom at n=" + n());
					return "n=" + n();
				}}
			/>
		</Column>
	);
}

render(() => <Face />, { skin: bg, style: base });
