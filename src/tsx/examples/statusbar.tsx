// runtime/statusbar receipt — a top status strip over a body Label. The strip's
// title is a static string; its time is a signal-backed thunk bumped on up-press,
// proving the time Label re-renders for free (idiom 5b: the thunk read inside the
// StatusBar's driving effect auto-tracks, so a signal write updates the label
// with no bind wiring). A plain-string title stays static.
// Buttons (QEMU touch crashes the firmware — README gotcha 2):
//   up = advance the clock by one minute.
import { render, screen } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { StatusBar } from "runtime/statusbar";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "18px Gothic", color: "white" });

const two = (n: number) => (n < 10 ? "0" : "") + n;
const [mins, setMins] = useState(9 * 60 + 41); // 09:41
const clock = () => two(Math.floor(mins() / 60) % 24) + ":" + two(mins() % 60);
const advance = () => setMins((m: number) => m + 1);

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0} focus={true} onPressUp={advance}>
			<StatusBar title="Inbox" time={clock} background="#202020" />
			{/* On round the status strip is a taller centered stack (~y0–56), so drop
			    the body below it; the Label auto-centers (no left/right anchor). */}
			<Label top={screen.round ? 72 : 40} style={base} string="3 unread messages" />
		</Container>
	),
	{ skin: bg, style: base },
);
