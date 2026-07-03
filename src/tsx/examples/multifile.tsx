// MULTI-FILE app (#gap) — the entry imports two sibling component modules.
// esbuild --bundle stitches them into one app/main.js (runtime/* stays
// external/preloaded), and lowering runs across the whole bundle. Proves a
// real multi-module app, not just single-file examples. Build: APP=multifile
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { Readout } from "./multifile/readout";
import { Hint } from "./multifile/hint";

const bg = new Skin({ fill: "black" });
const big = new Style({ font: "bold 28px Gothic", color: "white" });

const [count, setCount] = useState(0);

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressUp={() => setCount((c: number) => c + 1)}
		onPressDown={() => setCount((c: number) => c - 1)}>
		<Column>
			<Readout value={count} />
			<Hint />
		</Column>
	</Container>
), { skin: bg, style: big });
