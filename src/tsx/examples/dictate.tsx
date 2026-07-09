// dictate — pebble/dictation PROBE (speech-to-text feasibility). The host
// preloads the module; the firmware's dictation UI takes over the screen
// when a session starts and hands back a transcription. On QEMU there is
// no microphone/phone-assistant, so this probe's job is to find out — and
// show — what the emulator path actually does: SELECT starts a session
// (onReadable delivers the transcription if one ever arrives; errors and
// lifecycle land on the label either way). Status bridged via devlog-style
// messages would also work; here the label is the receipt.
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const st = new Style({ font: "bold 18px Gothic", color: "white" });

const [msg, setMsg] = useState("SELECT starts dictation");

interface DictationSession {
	start(): unknown;
	read(): unknown;
}
const Dictation = (
	importNow("pebble/dictation") as { default: new (o: object) => DictationSession }
).default;

let session: DictationSession | null = null;
const begin = () => {
	try {
		if (!session)
			session = new Dictation({
				onReadable(this: DictationSession) {
					try {
						setMsg(`heard: ${this.read()}`);
					} catch (e) {
						setMsg(`read threw: ${e}`);
					}
				},
				onError(e: unknown) {
					setMsg(`error: ${e}`);
				},
			});
		const r = session.start();
		setMsg(`started (start -> ${r === undefined ? "undefined" : r})`);
	} catch (e) {
		setMsg(`threw: ${e}`);
	}
};

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true} onPressSelect={begin}>
		<Column>
			<Label style={st} string={() => msg()} />
		</Column>
	</Container>
), { skin: bg, style: st });
