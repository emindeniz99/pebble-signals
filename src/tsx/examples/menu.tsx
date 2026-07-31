// runtime/menu receipt — a vertical scrolling, selectable list whose selection
// follows a signal. Menu is DISPLAY-ONLY: the app owns the selected index and
// drives it; the list highlights the row and scrolls (inner Column moveBy — the
// device-proven Move idiom) to keep it inside the clipping viewport. The
// highlight + scroll move for free — `selected` is a thunk read inside Menu's
// internal effect (idiom 5b), so there is no bind wiring at the call site.
// 8 rows in a 132px window (28px each = 224px of content) so the list overflows
// and actually scrolls as the selection walks past the bottom / top edges.
// Buttons (QEMU touch crashes the firmware — handbook gotcha 2):
//   up = previous row (wraps) · down = next row (wraps).
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { Menu } from "runtime/menu";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "18px Gothic", color: "white" });

const ITEMS = ["Alarms", "Timers", "Stopwatch", "Music", "Weather", "Settings", "About", "Reset"];
const [sel, setSel] = useState(0);
const next = () => setSel((s: number) => (s + 1) % ITEMS.length);
const prev = () => setSel((s: number) => (s - 1 + ITEMS.length) % ITEMS.length);

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
		>
			<Menu items={ITEMS} selected={sel} height={132} rowHeight={28} activeFill="#1a4d4d" />
		</Container>
	),
	{ skin: bg, style: base },
);
