// kvprobe — device.keyValue round-trip proof (the tutorial part-5 open
// item). The host wraps embedded:storage/key-value with a per-app path
// prefix; this probe writes a string + a number, reads both back, and
// COUNTS LAUNCHES persistently — so a screenshot after a reinstall shows
// n>1, proving the data survives relaunch, not just the write.
import { render } from "runtime/jsx-runtime";

const bg = new Skin({ fill: "black" });
const st = new Style({ font: "bold 24px Gothic", color: "white" });

interface KV {
	read(key: string): unknown;
	write(key: string, value: string | number): void;
	format: string;
}
const kv = (
	device as unknown as { keyValue: { open(o: { path: string }): KV } }
).keyValue.open({ path: "probe" });

kv.format = "string";
let boots = 0;
try {
	boots = Number(kv.read("boots")); // throws (or NaN) on first run
	if (boots !== boots) boots = 0;
} catch {}
boots += 1;
kv.write("boots", String(boots));
kv.write("greet", "kv works");
const back = String(kv.read("greet"));

render(() => (
	<Container left={0} right={0} top={0} bottom={0}>
		<Column>
			<Label style={st} string={`${back} boot=${boots}`} />
		</Column>
	</Container>
), { skin: bg, style: st });
