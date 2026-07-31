// runtime/kvstore receipt — a persisted STRUCTURED value that survives relaunch.
// Unlike localstore.tsx (strings only, hand-rolled String()/parseInt), the whole
// state is one { count } OBJECT stored as JSON: it is parsed from localStorage on
// boot (so a screenshot after a reinstall shows where the previous run left off,
// not 0), and up-press increments count + persists the new object.
// Buttons (QEMU touch crashes the firmware — handbook gotcha 2):
//   up = increment (and persist).
import { render } from "runtime/jsx-runtime";
import { useKVStorage } from "runtime/kvstore";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "28px Gothic", color: "white" });

const [state, setState] = useKVStorage("kv-counter", { count: 0 });
// a FRESH object each press — the structured store persists on identity change,
// not on deep equality, so a new object always writes through to flash.
const inc = () => setState({ count: state().count + 1 });

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0} focus={true} onPressUp={inc}>
			<Column>
				<Label string={() => "Count: " + state().count} />
			</Column>
		</Container>
	),
	{ skin: bg, style: base },
);
