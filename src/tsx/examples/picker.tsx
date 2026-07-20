// runtime/picker receipt — a value carousel whose centered option follows a
// signal. Picker is DISPLAY-ONLY: the app owns the selected index and moves it;
// the 3-row window (prev faded above, current bold+centered, next faded below)
// just reflects it. The window slides for free — `selected` is a thunk read
// inside Picker's internal effect (idiom 5b), so there is no bind wiring at the
// call site. Buttons (QEMU touch crashes the firmware — README gotcha 2):
//   up = previous fruit · down = next fruit · back = jump to the first.
// `wrap` makes the list circular, so the faded neighbors are never blank.
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { Picker } from "runtime/picker";

// Module-scope host objects are FINE in an APP (only runtime/ modules must build
// them per-call): a black background Skin + a valid-font white base Style.
const bg = new Skin({ fill: "black" });
const base = new Style({ font: "18px Gothic", color: "white" });

const FRUITS = ["Apple", "Banana", "Cherry", "Grape", "Mango"];
const [sel, setSel] = useState(0);
// Wrap the index modulo the list so the carousel cycles endlessly (the Picker
// clamps defensively too, but the app owns the value — Rule 8).
const next = () => setSel((i: number) => (i + 1) % FRUITS.length);
const prev = () => setSel((i: number) => (i - 1 + FRUITS.length) % FRUITS.length);

render(
	() => (
		<Container
			left={0}
			right={0}
			top={0}
			bottom={0}
			focus={true}
			onPressUp={prev}
			onPressDown={next}
			onPressBack={() => setSel(0)}
		>
			<Column>
				<Label string="Pick a fruit" />
				<Picker options={FRUITS} selected={sel} wrap={true} height={90} />
			</Column>
		</Container>
	),
	{ skin: bg, style: base },
);
