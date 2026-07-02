// Gotcha-16 testbed: reactive bindings INSIDE For rows. up = bump signal.
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { For } from "runtime/flow";
const bg = new Skin({ fill: "black" });
const base = new Style({ font: "24px Gothic", color: "white" });
const [n, setN] = useState(0);
render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressUp={() => setN((v: number) => v + 1)}>
		<For each={() => [0, 1, 2]} width={120}>
			{(i: number) => <Label string={() => "r" + i + ":" + n()} />}
		</For>
	</Container>
), { skin: bg, style: base });
