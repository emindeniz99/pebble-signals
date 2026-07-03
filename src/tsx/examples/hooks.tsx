// Hook surface, on-device slice (#22). The 32KB arena can't hold the FULL
// surface (every hook + Show + a live For) in one screen — it OOMs at boot,
// which is exactly why the packed core exists. Measured: adding a Show on
// top of these three primitives crosses the boot ceiling, so this slice
// drops Show (verified separately in forbind/showcase) and instead proves
// the DEVICE path for all three Stage-3 lowering targets at once:
//   useState (count) · direct signal() (flag) · computed() (doubled = count·2)
// A plain-Label read of flag replaces Show. up/down = count · select = flag.
// The computed re-derives on every count change with no user code.
// Build: APP=hooks ./build.sh
import { render } from "runtime/jsx-runtime";
import { useState, signal, computed } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const big = new Style({ font: "bold 28px Gothic", color: "white" });
const dim = new Style({ font: "18px Gothic", color: "#FFAA55" });

const [count, setCount] = useState(0);
const flag = signal(false);              // DIRECT signal()  — Stage-3 target
const doubled = computed(() => count() * 2);  // computed()  — Stage-3 target

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressUp={() => setCount((c: number) => c + 1)}
		onPressDown={() => setCount((c: number) => c - 1)}
		onPressSelect={() => { flag.value = !flag.value; }}>
		<Column>
			<Label style={big} string={() => "count " + count()} />
			<Label style={dim} string={() => "x2 = " + doubled.value} />
			<Label style={dim} string={() => "flag " + (flag.value ? "ON" : "off")} />
		</Column>
	</Container>
), { skin: bg, style: big });
