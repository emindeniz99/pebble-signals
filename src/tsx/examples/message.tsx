// runtime/message receipt — a reactive AppMessage channel (watch <-> pkjs <->
// phone). The middle Label shows the most recent INBOUND value under key
// "config"; drive it headlessly (no browser) with
//   tools/config-drive.py gabbro '{"hello":"from the phone"}'
// which the pkjs config flow forwards to the watch as AppMessage code 10000 —
// exactly the key our first declared name maps to. SELECT sends an outbound
// "spdev:"-marked ping ALSO on code 10000, the one code the pkjs dev-log bridge
// taps (src/pkjs/index.ts), so each press shows up as a `pkjs>` log line
// (examples/devlog.tsx's proven visible channel). useMessage is called INSIDE
// the render() build so its onCleanup(close) binds to the screen (Rule 5).
// Buttons only — QEMU touch crashes the firmware (gotcha 2):
//   SELECT = send a ping.
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { useMessage } from "runtime/message";

const bg = new Skin({ fill: "black" });
const titleStyle = new Style({ font: "bold 24px Gothic", color: "white" });
const bodyStyle = new Style({ font: "18px Gothic", color: "white" });

const [sent, setSent] = useState(0);

render(
	() => {
		const { last, send } = useMessage(["config"]);
		return (
			<Container
				left={0}
				right={0}
				top={0}
				bottom={0}
				focus={true}
				onPressSelect={() => {
					const next = sent() + 1;
					setSent(next);
					send({ config: `spdev: ping #${next} from the watch` });
				}}
			>
				<Column>
					<Label style={titleStyle} string="AppMessage" />
					<Label
						style={bodyStyle}
						string={() => "in: " + String(last()?.get("config") ?? "(none yet)")}
					/>
					<Label style={bodyStyle} string={() => `sent ${sent()}`} />
				</Column>
			</Container>
		);
	},
	{ skin: bg, style: bodyStyle },
);
