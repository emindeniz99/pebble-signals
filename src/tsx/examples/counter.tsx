// Example: the classic counter (react-pebble's "counter" equivalent).
// up = +1 · down = -1. Build: APP=counter ./build.sh
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "28px Gothic", color: "white" });

const [count, setCount] = useState(0);

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressUp={() => setCount((c: number) => c + 1)}
		onPressDown={() => setCount((c: number) => c - 1)}>
		<Column>
			<Label string={() => "Count: " + count()} />
		</Column>
	</Container>
), { skin: bg, style: base });
