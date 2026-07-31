// Watchface example: a sleepy SLOTH 🦥 that animates via text frames — no
// image resources (bitmaps are untested + arena-heavy; see the handbook). A
// `frame` signal cycles on a slow timer (sloths are slow!) driving the
// sleep bubbles + the blinking/swaying face; a 1s timer drives the clock.
// All motion is just label-string bindings re-running — the same reactive
// path as every other example. Build: APP=slothface ./build.sh
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const big = new Style({ font: "bold 42px Bitham", color: "white" });
const mid = new Style({ font: "28px Gothic", color: "white" });
const small = new Style({ font: "18px Gothic", color: "white" });

const two = (n: number) => (n < 10 ? "0" : "") + n;
const [time, setTime] = useState("");
const [frame, setFrame] = useState(0);

function tick() {
	const d = new Date();
	setTime(two(d.getHours()) + ":" + two(d.getMinutes()));
}
tick();
setInterval(tick, 1000);
setInterval(() => setFrame((f: number) => (f + 1) % 4), 650);

// 4-frame sleepy-sloth cycle: awake -> blink -> asleep -> blink, with a
// gentle left/right sway via leading spaces, and growing sleep bubbles.
const FACES = ["(o_o)", " (-_-) ", "(u_u)", "  (-_-)"];
const ZZZ = ["", "z", "z z", "z z z"];

render(() => (
	<Container left={0} right={0} top={0} bottom={0}>
		<Column>
			<Label style={small} string={() => ZZZ[frame()]} />
			<Label style={mid} string={() => FACES[frame()]} />
			<Label style={big} string={() => time()} />
		</Column>
	</Container>
), { skin: bg, style: mid });
