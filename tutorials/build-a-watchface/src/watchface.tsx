// The finished watchface from tutorials/build-a-watchface/. A reactive
// digital watchface: an hour-based greeting, HH:MM big, and a seconds + date
// line. `hh/mm/ss` are useState signals; `greeting` is a computed DERIVED from
// hh — so it re-evaluates only when the hour changes while seconds tick every
// second. Each Label subscribes to only what it reads: fine-grained updates,
// no VDOM diff, flat heap in steady state. Build: pnpm run dev -- --app
// watchface (flip package.json watchapp.watchface=true for a real face).
//
// NOTE the read syntax — pebble-signals has THREE, by source kind:
//   useState -> call:   hh()            (getter is a function)
//   signal   -> .value: mySig.value
//   computed -> .value: greeting.value  (a ReadonlySignal, NOT callable)
import { render } from "runtime/jsx-runtime";
import { computed, useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const timeStyle = new Style({ font: "bold 42px Bitham", color: "white" });
const dateStyle = new Style({ font: "18px Gothic", color: "#AAAAAA" });
const greetStyle = new Style({ font: "18px Gothic", color: "#FFAA55" });

const two = (n: number) => (n < 10 ? "0" : "") + n;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const [hh, setHh] = useState(0);
const [mm, setMm] = useState(0);
const [ss, setSs] = useState(0);
const [day, setDay] = useState("");

function tick() {
	const d = new Date();
	setHh(d.getHours());
	setMm(d.getMinutes());
	setSs(d.getSeconds());
	setDay(DAYS[d.getDay()] + " " + two(d.getDate()) + "." + two(d.getMonth() + 1));
}
tick();
setInterval(tick, 1000);

// computed reads hh() only -> re-derives on the hour, not the second.
const greeting = computed(() => {
	const h = hh();
	return h < 12 ? "good morning" : h < 18 ? "good afternoon" : "good evening";
});

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0}>
			<Column>
				<Label style={greetStyle} string={() => greeting.value} />
				<Label style={timeStyle} string={() => two(hh()) + ":" + two(mm())} />
				<Label style={dateStyle} string={() => two(ss()) + "   " + day()} />
			</Column>
		</Container>
	),
	{ skin: bg, style: dateStyle },
);
