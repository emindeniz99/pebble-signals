// The finished watchface from tutorials/build-a-watchface/. A reactive
// digital watchface: HH:MM big, a seconds + date line, and an hour-based
// greeting. tick() naively sets every signal each second, but signal-piu
// skips same-value writes, so each Label repaints only when ITS value
// changes: seconds every second, time every minute, greeting a few times a
// day. That independence is signal-piu's whole point — fine-grained updates,
// no VDOM diff, flat heap in steady state. Build: npm run dev -- --app
// watchface (flip package.json watchapp.watchface=true for a real face).
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const timeStyle = new Style({ font: "bold 42px Bitham", color: "white" });
const dateStyle = new Style({ font: "18px Gothic", color: "#AAAAAA" });
const greetStyle = new Style({ font: "18px Gothic", color: "#FFAA55" });

const two = (n: number) => (n < 10 ? "0" : "") + n;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// One signal per field, so each Label subscribes to only what it shows.
const [hhmm, setHhmm] = useState("");
const [ss, setSs] = useState("");
const [day, setDay] = useState("");
const [greeting, setGreeting] = useState("");

function tick() {
	const d = new Date();
	const h = d.getHours();
	setHhmm(two(h) + ":" + two(d.getMinutes()));
	setSs(two(d.getSeconds()));
	setDay(DAYS[d.getDay()] + " " + two(d.getDate()) + "." + two(d.getMonth() + 1));
	setGreeting(h < 12 ? "good morning" : h < 18 ? "good afternoon" : "good evening");
}
tick();
setInterval(tick, 1000);

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0}>
			<Column>
				<Label style={greetStyle} string={() => greeting()} />
				<Label style={timeStyle} string={() => hhmm()} />
				<Label style={dateStyle} string={() => ss() + "   " + day()} />
			</Column>
		</Container>
	),
	{ skin: bg, style: dateStyle },
);
