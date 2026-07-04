// #44 — hand-written Piu and signal-piu JSX in the SAME app, at the same
// time, both live. The point: adopting signal-piu is not all-or-nothing.
// render() returns the Piu Application it creates, and that is a plain Piu
// Container — classic imperative content (`new Label(...)`, mutated from a
// timer, no signals anywhere) can be add()ed right next to the JSX tree and
// both update independently:
//   * top half:    JSX <Label> bound to a ticking signal (fine-grained
//                  reactive update — signal-piu's path);
//   * bottom half: a hand-built Label whose .string is assigned
//                  imperatively (classic Moddable/Piu — untouched by us).
// The reverse embedding also works: a hand-built Piu node can be handed to
// JSX as a child (appendChild accepts real Content instances), but the
// headline pattern here is the common migration one — an existing hand-Piu
// app growing a JSX region. Build: --app coexist
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const big = new Style({ font: "bold 28px Gothic", color: "white" });
const dim = new Style({ font: "18px Gothic", color: "#FFAA55" });

// --- signal-piu half: a reactive JSX binding -------------------------------
const [ticks, setTicks] = useState(0);
setInterval(() => setTicks((t: number) => t + 1), 1000);

const app = render(() => (
	<Column>
		<Label style={big} string={() => "jsx " + ticks()} />
	</Column>
), { skin: bg, style: big });

// --- hand-Piu half: classic imperative Moddable, no signals, no JSX --------
const hand = new Label(null, {
	left: 0, right: 0, bottom: 30, height: 24,
	style: dim, string: "hand-piu 0",
});
let n = 0;
setInterval(() => { n += 1; hand.string = "hand-piu " + n; }, 1000);
app.add(hand);
