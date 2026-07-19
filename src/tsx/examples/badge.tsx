// runtime/badge receipt — a reactive count Badge. The disc's number follows a
// signal (up-press increments it), proving the Badge repaints for free: `count`
// is read inside the composed Canvas's paint, so its reads auto-track (count
// change → Canvas effect → invalidate → repaint) with no bind wiring.
// Buttons (QEMU touch crashes the firmware — README gotcha 2):
//   up = +1 · down = -1.
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { Badge } from "runtime/badge";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "24px Gothic", color: "white" });

const [count, setCount] = useState(1);
const inc = () => setCount((c: number) => c + 1);
const dec = () => setCount((c: number) => Math.max(c - 1, 0));

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0} focus={true} onPressUp={inc} onPressDown={dec}>
			<Column>
				<Badge count={count} size={56} color="#e01818" />
				<Label string={() => "count=" + count()} />
			</Column>
		</Container>
	),
	{ skin: bg, style: base },
);
