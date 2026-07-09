// config — the Clay-style settings ROUND-TRIP, end to end. The phone-side
// pkjs (src/pkjs/index.ts) forwards the settings page's result string to the
// watch under ONE AppMessage key ("config" = code 10000); this app parses it
// into SIGNALS, so settings drive the UI like any other state (text + an
// invert toggle flipping skin/style reactively — the toggle-proven path).
// `pebble/message` is preloaded in the ALLOY HOST: the compartment hook maps
// the importNow through, so this ships no message code of its own.
// Drive it headlessly (no browser): tools/config-drive.py gabbro
//   '{"text":"hi from config","invert":1}'
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const fg = new Skin({ fill: "white" });
const st = new Style({ font: "bold 24px Gothic", color: "white" });
const stInv = new Style({ font: "bold 24px Gothic", color: "black" });

const [text, setText] = useState("no config yet");
const [invert, setInvert] = useState(false);

interface MessageChannel {
	read(): Map<string, unknown>;
}
const Message = (importNow("pebble/message") as { default: new (o: object) => MessageChannel })
	.default;
new Message({
	keys: ["config"], // first key -> code 10000 (what pkjs sends)
	onReadable(this: MessageChannel) {
		const raw = String(this.read().get("config") ?? "{}");
		const s = JSON.parse(raw) as { text?: string; invert?: number };
		if (s.text !== undefined) setText(s.text);
		setInvert(!!s.invert);
	},
});

render(() => (
	<Container left={0} right={0} top={0} bottom={0} skin={() => (invert() ? fg : bg)}>
		<Column>
			<Label style={() => (invert() ? stInv : st)} string={() => text()} />
		</Column>
	</Container>
), { skin: bg, style: st });
