// Hook surface, on-device slice (#22). The 32KB arena can't hold the FULL
// surface (useState+useMemo+computed+2×signal+useEffect+Show+For) in one
// screen — it OOMs at boot, which is exactly why the packed core exists.
// useMemo/computed/useEffect are verified in the Node suite (signals.test);
// here we prove the DEVICE path for useState + direct signal() (the Stage-3
// lowering target) + Show. up/down = count · select = toggle flag.
// Build: APP=hooks ./build.sh
import { render } from "runtime/jsx-runtime";
import { useState, signal } from "runtime/signals";
import { Show } from "runtime/flow";

const bg = new Skin({ fill: "black" });
const big = new Style({ font: "bold 28px Gothic", color: "white" });
const dim = new Style({ font: "18px Gothic", color: "#FFAA55" });

const [count, setCount] = useState(0);
const flag = signal(false);   // DIRECT signal() — Stage-3 lowering target

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressUp={() => setCount((c: number) => c + 1)}
		onPressDown={() => setCount((c: number) => c - 1)}
		onPressSelect={() => { flag.value = !flag.value; }}>
		<Column>
			<Label style={big} string={() => "count " + count()} />
			<Show when={() => flag.value} width={150} height={26}
				fallback={() => <Label style={dim} string="flag off" />}>
				{() => <Label style={dim} string="flag ON" />}
			</Show>
		</Column>
	</Container>
), { skin: bg, style: big });
