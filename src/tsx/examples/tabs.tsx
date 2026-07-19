// runtime/tabs receipt — a horizontal tab bar whose active tab follows a signal.
// Tabs is DISPLAY-ONLY: the app owns the active index and swaps the body; the
// bar just reflects it. The highlight moves for free — `active` is a thunk read
// inside Tabs's internal effect (idiom 5b), so no bind wiring at the call site.
// Buttons (QEMU touch crashes the firmware — README gotcha 2):
//   up = previous tab (wraps) · down = next tab (wraps).
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { Tabs } from "runtime/tabs";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "24px Gothic", color: "white" });

const LABELS = ["Home", "Stats", "Set"];
const [tab, setTab] = useState(0);
const next = () => setTab((t: number) => (t + 1) % LABELS.length);
const prev = () => setTab((t: number) => (t - 1 + LABELS.length) % LABELS.length);

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0} focus={true} onPressUp={prev} onPressDown={next}>
			<Column>
				<Tabs labels={LABELS} active={tab} activeFill="#004466" />
				<Label string={() => LABELS[tab()]} />
			</Column>
		</Container>
	),
	{ skin: bg, style: base },
);
