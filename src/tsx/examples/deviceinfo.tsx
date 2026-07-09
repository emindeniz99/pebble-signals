// deviceinfo — surface what the HOST injects, on the watch itself: the
// measured screen (size + panel shape/depth from `screen`), the JS clock,
// and a live uptime tick. Useful as a first-boot sanity app on new hardware
// and as living documentation of the host surface (roadmap "deviceinfo").
import { render, screen } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const st = new Style({ font: "18px Gothic", color: "white" });
const [up, setUp] = useState(0);
setInterval(() => setUp((u: number) => u + 1), 1000);

render(() => (
	<Column>
		<Label style={st} string={() => `screen ${screen.width}x${screen.height}`} />
		<Label style={st} string={() => (screen.round ? "round panel" : "rect panel")} />
		<Label style={st} string={() => (screen.color ? "color" : "b/w")} />
		<Label style={st} string={new Date().toTimeString().slice(0, 8)} />
		<Label style={st} string={() => `up ${up()}s`} />
	</Column>
), { skin: bg, style: st });
