// Example: TRUE virtualized infinite scroll — the VirtualList component
// (our FlatList) over the byte-record store. The store holds the records as
// bytes; only ROWS (=3) recycled Labels ever exist, so RAM is O(rows), not
// O(records). A scroll `offset` signal moves the window. Scrolling is
// self-evident from the changing content (no reactive header — a 4th bound
// label pushed boot to 97% of the arena and scroll transients then crashed
// it; three bound rows sit at the safe ~85%, gotcha 16 territory).
// up = scroll up (older) · down = scroll down (newer) · select = append.
// Build: APP=scroll ./build.sh
import { render } from "runtime/jsx-runtime";
import { useState, createStore } from "runtime/signals";
import { VirtualList } from "runtime/flow";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "24px Gothic", color: "white" });

const ROWS = 3;
const st = createStore(256);
for (let i = 1; i <= 8; i++)	// seed a list bigger than the 3-row viewport
	st.push(i % 3 === 0 ? "item" + i : i);

const [offset, setOffset] = useState(0);
const maxOffset = () => Math.max(0, st.count() - ROWS);

function up() { setOffset((o: number) => Math.max(0, o - 1)); }
function down() { setOffset((o: number) => Math.min(maxOffset(), o + 1)); }
function append() {
	const id = st.count() + 1;
	st.push(id % 3 === 0 ? "item" + id : id);
	setOffset(maxOffset());		// scroll to the new record (also re-renders)
}

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressUp={up} onPressDown={down} onPressSelect={append}>
		<VirtualList data={st} rows={ROWS}
			at={() => offset()}
			format={(v: any, i: number) => (i + 1) + ": " + (typeof v === "number" ? "#" + v : v)} />
	</Container>
), { skin: bg, style: base });
