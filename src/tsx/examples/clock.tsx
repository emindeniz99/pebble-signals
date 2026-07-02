// Example: digital clock watchface (react-pebble's "watchface" equivalent,
// running as RUNTIME signals on the watch). Build: APP=clock ./build.sh
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const big = new Style({ font: "28px Gothic", color: "white" });
const small = new Style({ font: "18px Gothic", color: "white" });

const [time, setTime] = useState("");
const [date, setDate] = useState("");
const two = (n: number) => (n < 10 ? "0" : "") + n;

function tick() {
	const d = new Date();
	setTime(two(d.getHours()) + ":" + two(d.getMinutes()) + ":" + two(d.getSeconds()));
	setDate(two(d.getDate()) + "." + two(d.getMonth() + 1));
}
tick();
setInterval(tick, 1000);

render(() => (
	<Container left={0} right={0} top={0} bottom={0}>
		<Column>
			<Label style={big} string={() => time()} />
			<Label style={small} string={() => date()} />
		</Column>
	</Container>
), { skin: bg, style: small });
