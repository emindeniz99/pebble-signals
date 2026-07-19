// runtime/actionbar receipt — a right-edge button-hint strip beside a reactive
// counter. The up hint is a `() => string` thunk mirroring the count, proving a
// reactive slot follows a signal (idiom 5b); select/down are static hints.
// up-press increments the counter (which re-renders both the counter Label and
// the ActionBar's up hint). Buttons (QEMU touch crashes the firmware — README
// gotcha 2): up = +1 · down = -1.
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { ActionBar } from "runtime/actionbar";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "28px Gothic", color: "white" });

const [count, setCount] = useState(0);
const inc = () => setCount((c: number) => c + 1);
const dec = () => setCount((c: number) => c - 1);

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0} focus={true} onPressUp={inc} onPressDown={dec}>
			<Column left={0} right={30} top={0} bottom={0}>
				<Label string={() => "Count: " + count()} />
			</Column>
			<ActionBar up={() => String(count())} select="OK" down="-" background="#303030" />
		</Container>
	),
	{ skin: bg, style: base },
);
