// The "good afternoon" watchface + a live MILLISECONDS line. Same fine-grained
// idea as watchface.tsx: one fast ~40ms tick writes hh/mm/ss/ms every frame,
// but equal-value writes are no-ops (Signal skips notification), so ONLY the
// ms Label actually re-renders each frame — hh:mm:ss and the greeting update
// on real second/hour boundaries. Proof that a 25fps binding is cheap on the
// 32KB arena when the graph is fine-grained. Build: APP=watchms node build.mts
import { render } from "runtime/jsx-runtime";
import { computed, useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const greetStyle = new Style({ font: "18px Gothic", color: "#FFAA55" });
const timeStyle = new Style({ font: "bold 42px Bitham", color: "white" });
const msStyle = new Style({ font: "bold 28px Gothic", color: "#66CCFF" });

const two = (n: number) => (n < 10 ? "0" : "") + n;
const three = (n: number) => (n < 10 ? "00" : n < 100 ? "0" : "") + n;

const [hh, setHh] = useState(0);
const [mm, setMm] = useState(0);
const [ss, setSs] = useState(0);
const [ms, setMs] = useState(0);

function tick() {
	const d = new Date();
	setHh(d.getHours());
	setMm(d.getMinutes());
	setSs(d.getSeconds());
	setMs(d.getMilliseconds());
}
tick();
setInterval(tick, 40); // ~25fps — near the memory-LCD panel's refresh limit

const greeting = computed(() => {
	const h = hh();
	return h < 12 ? "good morning" : h < 18 ? "good afternoon" : "good evening";
});

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0}>
			<Column>
				<Label style={greetStyle} string={() => greeting.value} />
				<Label style={timeStyle} string={() => two(hh()) + ":" + two(mm()) + ":" + two(ss())} />
				<Label style={msStyle} string={() => "." + three(ms())} />
			</Column>
		</Container>
	),
	{ skin: bg, style: greetStyle },
);
