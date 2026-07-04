// A REAL signal-piu WATCHFACE — scaffolded by `create-signal-piu`, built from
// the installed npm package, `watchapp.watchface: true` in package.json (the
// only difference from a watchapp: it lives in the watchface rotation, has no
// launcher entry, and the system owns the buttons — BACK does not exit it).
//
// clock-class UIs (two styles, three labels, a 1s interval) are safe again
// since per-app export pruning (#29): this face's mod is ~10KB, well under the
// measured ~14.5-14.9KB boot ceiling.
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const big = new Style({ font: "bold 42px Bitham", color: "white" });
const small = new Style({ font: "18px Gothic", color: "#AAAAAA" });

const [time, setTime] = useState("");
const [date, setDate] = useState("");
const two = (n: number) => (n < 10 ? "0" : "") + n;

function tick() {
	const d = new Date();
	setTime(two(d.getHours()) + ":" + two(d.getMinutes()));
	setDate(two(d.getDate()) + "." + two(d.getMonth() + 1) + "." + d.getFullYear());
}
tick();
setInterval(tick, 1000);

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0}>
			<Column>
				<Label style={big} string={() => time()} />
				<Label style={small} string={() => date()} />
				<Label style={small} string="signal-piu" />
			</Column>
		</Container>
	),
	{ skin: bg, style: small },
);
