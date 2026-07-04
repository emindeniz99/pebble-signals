// 100 DIFFERENT screens, ONE in RAM — the "infinite load/unload" model asked
// for in review: drill SELECT through screen #1 → #2 → … → #100; every screen
// has its own content (title, flavor line, live tick), yet the arena holds
// exactly ONE screen at any depth. How it works (this is Navigator's whole
// design, see runtime/flow.ts):
//   * pushing DISPOSES the current screen's Piu nodes + effects, then builds
//     the child — RAM is O(1 screen), not O(depth);
//   * popping disposes the child and REBUILDS the parent from its builder —
//     builders are tiny closures on a stack (O(depth) closures ≈ bytes);
//   * screen CODE lives in the mod archive in flash (ROM) — what costs arena
//     is only the LIVE nodes of the top screen;
//   * screen DATA here derives from the index (zero table RAM). A real app
//     with heavy per-screen data keeps it in a byte store / lazy fetch.
// So yes: 1 → 10 → 100 → N screens, load/unload forever, each screen budgeted
// against the full arena, never accumulating. Build: --app navmany
//
// SIZE NOTE (measured): app code loads INTO the heap — a 3-label variant of
// this screen died at boot (fxAbort, slot 6464/8176). Until PRELOAD_PURE
// routes pure app code to ROM, keep demo screens lean; that feature is the
// real fix (docs/roadmap.md, auto pure-module preload).
import { render } from "runtime/jsx-runtime";
import { Navigator } from "runtime/flow";
import { useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const big = new Style({ font: "bold 28px Gothic", color: "white" });
const small = new Style({ font: "18px Gothic", color: "#AAAAAA" });

let NAV: any = null;
const [pings, setPings] = useState(0);
setInterval(() => setPings((p: number) => p + 1), 1000);

// A distinct screen for every index — content derived, not stored.
const screen = (i: number) => () => (
	<Column>
		<Label style={big} string={"Screen #" + i} />
		<Label style={small} string={() => "tick " + pings()} />
	</Column>
);

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressSelect={() => { if (NAV) NAV.push(screen(NAV.depth() + 1)); }}
		onPressBack={() => { if (NAV && NAV.canPop()) { NAV.pop(); return true; } return false; }}>
		<Column>
			<Navigator root={(nav: any) => { NAV = nav; return screen(1)(); }} />
		</Column>
	</Container>
), { skin: bg, style: small });
