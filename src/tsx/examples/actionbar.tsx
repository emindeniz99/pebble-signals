// runtime/actionbar receipt — a right-edge button-hint strip beside a reactive
// counter. The up hint is a `() => string` thunk mirroring the count, proving a
// reactive slot follows a signal (idiom 5b); select/down are static hints.
// up-press increments the counter (which re-renders both the counter Label and
// the ActionBar's up hint). Buttons (QEMU touch crashes the firmware — handbook
// gotcha 2): up = +1 · down = -1.
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { ActionBar } from "runtime/actionbar";

const bg = new Skin({ fill: "black" });
// Center the counter in its box (a single-line Label fills the area to the left
// of the bar and centers, so it never clips the round bezel at the top edge).
const base = new Style({ font: "28px Gothic", color: "white", horizontal: "center" });

const [count, setCount] = useState(0);
const inc = () => setCount((c: number) => c + 1);
const dec = () => setCount((c: number) => c - 1);

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0} focus={true} onPressUp={inc} onPressDown={dec}>
			<Label left={0} right={40} top={0} bottom={0} string={() => "Count: " + count()} />
			<ActionBar up={() => String(count())} select="OK" down="-" background="#303030" />
		</Container>
	),
	{ skin: bg, style: base },
);
