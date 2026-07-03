// FIVE live reactive rows via recycled cells (task #18). Raw keyed `For`
// over 5 rows (forbind5) blew the boot ceiling — each row cost a createRoot
// + owner + wrapper + keyed-reconcile bookkeeping. VirtualList recycles a
// FIXED set of row nodes and re-reads a reactive data source per slot, so
// the same 5 live rows cost O(5 nodes) with no per-row create/dispose. Each
// row's get() reads the shared `bump` signal, so UP re-runs all five
// slot-effects. Build: APP=forbind5vl ./build.sh
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { VirtualList } from "runtime/flow";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "24px Gothic", color: "white" });

const [bump, setBump] = useState(0);
const data = { count: () => 5, get: (i: number) => bump() + i };

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressUp={() => setBump((b: number) => b + 1)}>
		<VirtualList data={data} rows={5}
			at={() => 0}
			format={(v: any, i: number) => "row " + i + " = " + v} />
	</Container>
), { skin: bg, style: base });
