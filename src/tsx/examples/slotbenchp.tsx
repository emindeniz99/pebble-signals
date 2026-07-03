// BENCH B — marginal XS-heap cost of the PACKED reactive core prototype
// (task #15): a signal is an INTEGER INDEX, values live in a Float64Array,
// subscriber sets are u32 BITMASKS (effect id = bit), and the per-effect
// dependency list is GONE — reverse edges are derived from the forward
// bitmasks (unsubscribe = one AND-mask pass over all signals). All graph
// bookkeeping is chunk-heap bytes; the only slot cost per pair is the
// reaction closure itself. Capacity: 32 effects per u32 word (plenty for a
// watchface — the biggest example uses ~6).
// Same bench protocol as slotbench.tsx (UP adds 2 pairs, DOWN bumps all):
//   APP=slotbenchp ./build.sh && pebble install --emulator gabbro
//   pkill -9 -f '[p]ypkjs'; python3 tools/memtest.py gabbro --ramp --max 16
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const st = new Style({ font: "bold 24px Gothic", color: "white" });

// ---- packed core (inline prototype; ~0 slots per signal) ----
const NV = new Float64Array(32);	// values            (chunk)
const SUB = new Uint32Array(32);	// subscriber masks   (chunk)
const EFF: any[] = [];				// effect id -> reaction closure
let nSig = 0;
let running = -1;
const pSig = (v: number) => { NV[nSig] = v; return nSig++; };
const pGet = (i: number) => {
	if (running >= 0) SUB[i] |= (1 << running);
	return NV[i];
};
const pRun = (e: number) => {
	const fn = EFF[e];
	if (!fn) return;
	const m = ~(1 << e);
	for (let s = 0; s < nSig; s++) SUB[s] &= m;	// unsubscribe: one mask pass
	const prev = running;
	running = e;
	try { fn(); } finally { running = prev; }
};
const pSet = (i: number, v: number) => {
	if (NV[i] === v) return;
	NV[i] = v;
	let m = SUB[i];
	while (m) {						// iterate set bits: lowest via m & -m
		const b = m & -m;
		m &= m - 1;
		pRun(31 - Math.clz32(b));
	}
};
const pEff = (fn: any) => { const e = EFF.length; EFF.push(fn); pRun(e); return e; };

// ---- bench ----
const sink = [0];
const [n, setN] = useState("0");
const addPair = () => {
	const i = pSig(0);
	pEff(() => { sink[0] += pGet(i); });
};

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressUp={() => { addPair(); addPair(); setN(nSig + "p"); }}
		onPressDown={() => {
			for (let i = 0; i < nSig; i++) pSet(i, NV[i] + 1);
			setN(nSig + "p s" + sink[0]);
		}}>
		<Column>
			<Label style={st} string={() => "B " + n()} />
		</Column>
	</Container>
), { skin: bg, style: st });
