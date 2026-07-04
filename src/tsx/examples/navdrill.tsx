// INFINITELY-DEEP nested screens on the 32KB heap (#23) — a utility-app
// navigator. SELECT drills one level deeper (pushes a child screen); BACK pops
// back up. The Navigator keeps ONLY the top screen built, so the stack can
// grow without bound while the arena holds exactly ONE screen — drill 5 or 500
// levels and the heap stays flat (verify with memtest --idle while pressing
// select/back). The screen builders are tiny closures on a stack (O(depth)
// cheap refs); their NODES/effects are O(1). Research (importNow, see
// docs/xs-heap-playbook.md) shows the CODE is already O(1) too: screen bytecode
// runs from flash, never copied into the 32KB heap.
//
// Buttons live on the OUTER focused Container (the initial render tree —
// swapped-in screens can't grab focus; see the flow.js focus note) and drive
// navigation through the one `nav` handle every screen shares.
//
// CONSTRAINTS OVERTURNED (2026-07, Rule 2 correction): the old "measured"
// limits here — one static label per screen, no reactive bindings, no
// nav.depth() reads — were NOT the piu port being fussy. They were the #29
// boot-arena pressure in disguise: with per-app export pruning the runtime
// shrank ~36% and swapped screens now hold live `string={() => ...}` bindings,
// nav.depth() reads AND multiple labels just fine — see examples/navreactive
// (emulator-verified: depth counter + a ticking signal survive push/pop).
// This demo stays minimal on purpose: it proves the O(1)-at-any-depth claim.
// Build: APP=navdrill ./build.sh
import { render } from "runtime/jsx-runtime";
import { Navigator } from "runtime/flow";

const bg = new Skin({ fill: "black" });
const big = new Style({ font: "bold 28px Gothic", color: "white" });

let NAV: any = null;			// the shared handle, captured from a screen

// The child screen every SELECT pushes. All levels share this one builder and
// the one `nav`, so pushing is unbounded while only the top screen is built.
const deeper = () => (<Column><Label style={big} string="deeper" /></Column>);

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressSelect={() => { if (NAV) NAV.push(deeper); }}
		onPressBack={() => { if (NAV && NAV.canPop()) { NAV.pop(); return true; } return false; }}>
		{/* Navigator MUST be wrapped (a Column here), never a direct child of a
		    focused Container — a direct dynamically-built child crashes the piu
		    port's focus resolution at mount (measured). */}
		<Column>
			<Navigator root={(nav: any) => { NAV = nav; return (<Column><Label style={big} string="root" /></Column>); }} />
		</Column>
	</Container>
), { skin: bg, style: big });
