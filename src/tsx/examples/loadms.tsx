// loadms — measure a lazy module's LOAD LATENCY on the watch itself (the
// roadmap's "time an importNow" item). SELECT importNow()s app/heavy (its
// bytecode loads from flash + every module-level object builds in the 32KB
// arena) and shows the measured milliseconds. Numbers-or-it-didn't-happen,
// as a shipping example.
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const st = new Style({ font: "bold 24px Gothic", color: "white" });
const [msg, setMsg] = useState("press select");

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressSelect={() => {
			const t0 = Date.now();
			const mod = importNow("app/heavy") as { default: { acc: number } };
			setMsg(`load ${Date.now() - t0}ms acc=${mod.default.acc}`);
		}}>
		<Column>
			<Label style={st} string={() => msg()} />
		</Column>
	</Container>
), { skin: bg, style: st });
