// examples/migration/integrated — the SAME app as
// examples/migration/original/src/c/original.c, ported to pebble-signals per
// docs/migration.md. The original was two native Windows: a counter screen
// (UP/DOWN adjust a count, SELECT pushes a detail window) and a detail
// window (shows the count, BACK pops it — WindowStack's default).
//
// The port keeps that exact shape but trades window_stack_push/pop for
// pebble-signals's <Navigator> (runtime/flow): push/pop screens with the arena
// holding exactly ONE screen at a time (verified device pattern — see
// src/tsx/examples/navdrill.tsx and navreactive.tsx in the pebble-signals repo).
// A naive "prebuild all screens" port is the ONE thing that does NOT work
// here (see `multiscreen` in docs/handbook.md — it OOMs the 32KB arena at
// boot); Navigator is the correct migration target for "push a screen on a
// button, pop it on back".
//
// UP/DOWN live on the OUTER focused Container so they work regardless of
// which screen is showing (mirrors the original's click config being set
// once on the counter window — here it's set once for the whole app).
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { Navigator } from "runtime/flow";

const bg = new Skin({ fill: "black" });
const big = new Style({ font: "bold 28px Gothic", color: "white" });
const dim = new Style({ font: "18px Gothic", color: "#FFAA55" });

const [count, setCount] = useState(0);

let NAV: any = null; // captured from <Navigator root=...>, shared by both screens

// screen 1 (root): the counter — reactive binding, same as original.c's
// text_layer_set_text(s_count_layer, "Count: %d") on every UP/DOWN.
const counterScreen = () => (
	<Column>
		<Label style={big} string={() => "Count: " + count()} />
		<Label style={dim} string="SELECT for details" />
	</Column>
);

// screen 2 (pushed): the detail view — original.c's s_detail_window, built
// fresh from the CURRENT count each time SELECT pushes it (its C counterpart
// read s_count into a snprintf buffer at window_load time; here the label is
// a live reactive binding to the same `count` signal instead — bonus
// correctness the static C version didn't have: the detail screen never
// shows stale data even if it were somehow left open across an update).
const detailScreen = () => (
	<Column>
		<Label style={big} string="Details" />
		<Label style={dim} string={() => "Count: " + count()} />
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
			onPressUp={() => setCount((c: number) => c + 1)}
			onPressDown={() => setCount((c: number) => c - 1)}
			onPressSelect={() => {
				if (NAV) NAV.push(detailScreen);
			}}
			onPressBack={() => {
				if (NAV && NAV.canPop()) {
					NAV.pop();
					return true;
				}
				return false;
			}}
		>
			{/* Navigator MUST be wrapped (never a direct child of a focused
			    Container) — see navdrill.tsx's note; a direct dynamically-built
			    child crashes the piu port's focus resolution at mount. */}
			<Column>
				<Navigator
					root={(nav: any) => {
						NAV = nav;
						return counterScreen();
					}}
				/>
			</Column>
		</Container>
	),
	{ skin: bg, style: big },
);
