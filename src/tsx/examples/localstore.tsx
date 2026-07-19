// runtime/localstorage receipt — a counter that SURVIVES relaunch. The value is
// seeded from `localStorage` on boot (so a screenshot after a reinstall shows
// where the previous run left off, not 0), and up-press increments + persists.
// webstorage is strings-only, so the number round-trips through String()/parseInt.
// Buttons (QEMU touch crashes the firmware — README gotcha 2):
//   up = increment (and persist).
import { render } from "runtime/jsx-runtime";
import { useLocalStorage } from "runtime/localstorage";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "28px Gothic", color: "white" });

const [count, setCount] = useLocalStorage("count", "0");
const inc = () => setCount(String(parseInt(count(), 10) + 1));

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0} focus={true} onPressUp={inc}>
			<Column>
				<Label string={() => "Count: " + count()} />
			</Column>
		</Container>
	),
	{ skin: bg, style: base },
);
