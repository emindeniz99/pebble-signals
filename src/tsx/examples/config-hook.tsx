// config-hook — the runtime/config receipt: the whole Clay settings round-trip
// as ONE reactive hook. useConfig() returns the current settings object; it is
// seeded from flash on boot, MERGES inbound settings when the wearer saves, and
// persists the result. The UI binds a Label to config().text and flips the
// skin/style on config().invert — settings drive the render REACTIVELY, with no
// bind wiring (the toggle-proven path, mirroring the existing config.tsx probe
// but going through the hook instead of hand-rolled signals). The phone side
// (the settings-page URL) lives in src/pkjs/index.ts; this app only CONSUMES the
// result. Drive it headlessly, no browser:
//   tools/config-drive.py gabbro '{"text":"hi from config","invert":1}'
import { render } from "runtime/jsx-runtime";
import { useConfig } from "runtime/config";

const bg = new Skin({ fill: "black" });
const fg = new Skin({ fill: "white" });
const st = new Style({ font: "bold 24px Gothic", color: "white" });
const stInv = new Style({ font: "bold 24px Gothic", color: "black" });

interface Config {
	text: string;
	invert: number;
}

render(
	() => {
		// Called INSIDE the build so onCleanup(close) binds to the render root
		// (Rule 5). Seeds "no config yet" until flash / an inbound settings message
		// arrives; config-drive.py then merges { text, invert } in, live.
		const config = useConfig<Config>({ text: "no config yet", invert: 0 });
		return (
			<Container
				left={0}
				right={0}
				top={0}
				bottom={0}
				skin={() => (config().invert ? fg : bg)}
			>
				<Column>
					<Label style={() => (config().invert ? stInv : st)} string={() => config().text} />
				</Column>
			</Container>
		);
	},
	{ skin: bg, style: st },
);
