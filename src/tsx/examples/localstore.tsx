// runtime/localstorage receipt — a persisted STRING that survives relaunch (the
// string-cell sibling of kvstore's structured JSON). `useLocalStorage` is a
// string-only reactive cell over the host localStorage; here it holds the current
// name, seeded from storage on boot, and UP cycles to the next name (persisted),
// so a screenshot after a reinstall shows where the previous run left off — and
// the "hi <name>" greeting reads visibly DIFFERENT from kvstore's counter.
// Buttons (QEMU touch crashes the firmware — README gotcha 2): up = next name.
import { render } from "runtime/jsx-runtime";
import { useLocalStorage } from "runtime/localstorage";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "28px Gothic", color: "white", horizontal: "center" });

const names = ["world", "Pebble", "Ada", "Turing"];
// persist the CURRENT name string itself (string-only store); UP advances it.
const [name, setName] = useLocalStorage("who", "world");
const next = () => {
	const i = names.indexOf(name());
	setName(names[(i + 1) % names.length]);
};

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0} focus={true} onPressUp={next}>
			<Column>
				<Label left={0} right={0} string={() => "hi " + name()} />
			</Column>
		</Container>
	),
	{ skin: bg, style: base },
);
