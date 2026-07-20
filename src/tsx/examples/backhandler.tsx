// runtime/backhandler receipt — wire the Back button to an IN-APP action instead of
// exiting (the React-Native BackHandler idiom). A Navigator drills screens with
// SELECT; useBackHandler intercepts BACK so it POPS one level (staying in the app)
// while there is depth, and only lets Back do its default at the ROOT. A big label
// shows the live depth, so the intercept is visible: SELECT -> "depth 2", BACK ->
// "depth 1" (a pop, NOT an exit), BACK again at the root -> leave the app.
//
// WHERE THE BAG GOES (substrate, not preference): button events reach the FOCUSED
// node, and the `focus` prop only takes effect in the INITIAL render() tree — a
// Navigator SWAPS its screens in after mount, so a swapped-in screen can NOT grab
// focus (flow.ts focus note; the navdrill/navreactive pattern). So the
// useBackHandler bag is spread on the OUTER focused Container — which owns focus for
// the app's life — and its handler consults the shared `nav` handle, exactly where
// Back presses actually arrive. Spreading it on a pushed screen would compile but
// never receive Back on device.
//
// HONEST CAVEAT: consuming onPressBack is proven to pop in-app (screenshot-
// verifiable here); whether it ALSO prevents the firmware app-exit at the root (vs
// the window manager exiting regardless) is UNVERIFIED under QEMU. A guaranteed exit
// override would need pebble/button's window_set_overrides_back_button (device-
// gated). Do not read this demo as proof of exit-prevention.
//
// Buttons (QEMU touch crashes the firmware — README gotcha 2):
//   select = drill deeper (push) · back = pop one level (or exit at the root).
// Build: APP=backhandler ./build.sh
import { render } from "runtime/jsx-runtime";
import { Navigator } from "runtime/flow";
import { useBackHandler } from "runtime/backhandler";

const bg = new Skin({ fill: "black" });
const big = new Style({ font: "bold 28px Gothic", color: "white", horizontal: "center" });
const hint = new Style({ font: "18px Gothic", color: "#808080", horizontal: "center" });

let NAV: any = null; // the shared handle, captured from the root builder (navdrill idiom)

// One builder for every level (root and every push share it): a reactive depth
// counter (reads nav.depth()) over a one-line control hint. The screen rebuilds on
// each push/pop, so only the top level is ever live on the 32KB heap.
const screen = () => (
	<Column>
		<Label style={big} string={() => "depth " + (NAV ? NAV.depth() : 0)} />
		<Label style={hint} string="SELECT deeper · BACK up" />
	</Column>
);

render(
	() => (
		<Container
			left={0}
			right={0}
			top={0}
			bottom={0}
			focus={true}
			onPressSelect={() => {
				if (NAV) NAV.push(screen);
			}}
			{...useBackHandler(() => {
				// pop while there is a parent (consume Back = stay in app); at the root
				// there is nothing to pop, so decline and let Back do its default (exit).
				if (NAV && NAV.canPop()) {
					NAV.pop();
					return true;
				}
				return false;
			})}
		>
			{/* Navigator MUST be wrapped (a Column here), never a direct child of a
			    focused Container — a dynamically-built direct child crashes the piu
			    port's focus resolution at mount (flow.ts gotcha). */}
			<Column>
				<Navigator
					root={(nav: any) => {
						NAV = nav;
						return screen();
					}}
				/>
			</Column>
		</Container>
	),
	{ skin: bg, style: big },
);
