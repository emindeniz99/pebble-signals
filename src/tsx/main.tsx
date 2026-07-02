// M9 — windowed dynamic list over the runtime's typed byte-record store
// (createStore): records live as BYTES in one Uint8Array instead of per-row
// JS objects (each M7 row cost ~450B of slots; the arena died adding row
// 5). The store encodes primitives automatically and supports custom
// codecs — this demo pushes ints and strings mixed. The screen is a fixed
// 3-row window of bound labels following the list tail; growth re-runs
// three string bindings and allocates nothing but label text.
// tools/memtest.py --ramp proves it: memory stays FLAT to --max.
//
// Buttons (QEMU touch crashes the firmware — see README gotcha 2):
// up = push record (odd ids: string "sN"; even ids: int32 N) ·
// down = remove the FIRST record.
import { render } from "runtime/jsx-runtime";
import { useState, createStore } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "24px Gothic", color: "white" });

const W = 3;			// visible window rows
const st = createStore(512);	// ~85 int records (6B each)
st.load("d");			// records PERSIST across launches (localStorage)
const [count, setCount] = useState(st.count());
let nextId = st.count() + 1;

function push() {
	const id = nextId++;
	const n = st.push(id % 2 ? "s" + id : id);
	if (n >= 0) {
		st.save("d");
		setCount(n);
	}
}

function drop() {
	const n = st.remove(0);
	if (n >= 0) {
		st.save("d");
		setCount(n);
	}
}

// Window slot 0..W-1 -> display text. Reading count() re-runs the row
// bindings on push/drop; the window tracks the tail.
function row(slot: number) {
	const n = count();
	const i = (n > W ? n - W : 0) + slot;
	if (i >= n)
		return "";
	const v = st.get(i);
	return typeof v === "number" ? "#" + v : String(v);
}

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressUp={push} onPressDown={drop}>
		<Column>
			<Label string={() => "n" + count()} />
			<Label string={() => row(0)} />
			<Label string={() => row(1)} />
			<Label string={() => row(2)} />
		</Column>
	</Container>
), { skin: bg, style: base });
