// BENCH A — marginal XS-heap cost of the CURRENT reactive core.
// UP adds 2 signal+effect pairs; DOWN bumps every signal (proves the notify
// path runs — the label shows the sink total). Run under tools/memtest.py
// --ramp (it presses UP and logs slot/chunk after each press): the slope is
// the per-pair slot cost, the death point is the capacity.
//   APP=slotbench ./build.sh && pebble install --emulator gabbro
//   pkill -9 -f '[p]ypkjs'; python3 tools/memtest.py gabbro --ramp --max 16
import { render } from "runtime/jsx-runtime";
import { signal, effect, track, useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const st = new Style({ font: "bold 24px Gothic", color: "white" });

const sink = [0];
const sigs: any[] = [];
const [n, setN] = useState("0");
const addPair = () => {
	const s = signal(0);
	track(effect(() => { sink[0] += s.value; }));
	sigs.push(s);
};

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressUp={() => { addPair(); addPair(); setN(sigs.length + "p"); }}
		onPressDown={() => {
			for (let i = 0; i < sigs.length; i++) sigs[i].value++;
			setN(sigs.length + "p s" + sink[0]);
		}}>
		<Column>
			<Label style={st} string={() => "A " + n()} />
		</Column>
	</Container>
), { skin: bg, style: st });
