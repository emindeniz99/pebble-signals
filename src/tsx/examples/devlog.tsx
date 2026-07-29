// devlog — VISIBLE logging from RELEASE firmware (the roadmap's dev-log
// bridge, built). JS trace/console.log from a mod never reaches `pebble
// logs` (measured; xsHost.c only ships C-side APP_LOG) — but AppMessage
// does: this app sends "spdev:"-prefixed strings through pebble/message,
// and src/pkjs/index.ts console.logs them phone-side, where they ARE
// visible as `pkjs>` lines. Opt-in and app-side: apps that don't wire it
// pay nothing. SELECT logs a counter line; UP throws inside a binding so
// the contained error (report/__spError) ships through the same bridge;
// DOWN throws inside a PLAIN effect, shipping report()'s
// "uncaught in reactive update (effect #N)" context string (the roadmap's
// queued on-device log receipt — landed 2026-07-29).
import { render } from "runtime/jsx-runtime";
import { effect, useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const st = new Style({ font: "bold 24px Gothic", color: "white" });

interface MessageChannel {
	write(map: Map<string, string>): void;
}
const Message = (importNow("pebble/message") as { default: new (o: object) => MessageChannel })
	.default;
const channel = new Message({ keys: ["log"] }); // first key -> code 10000

const log = (msg: string) => {
	try {
		channel.write(new Map([["log", `spdev: ${msg}`]]));
	} catch {} // a full outbox must never take the app down
};
// contained errors (report / the error boundary's sink) ship too
(globalThis as Record<string, unknown>).__spError = (err: unknown, msg: string) => {
	log(`${msg}: ${err}`);
};

const [n, setN] = useState(0);
const [boom, setBoom] = useState(false);
const [eboom, setEboom] = useState(false);
// a PLAIN (non-binding) effect throw: report()'s own ctx is the
// "uncaught in reactive update (effect #N)" line — DOWN device-proves it
// (a binding throw takes jsx-runtime's richer binding-guard ctx instead).
effect(() => {
	if (eboom()) throw new Error("deliberate effect boom");
});

// prove the bridge with zero interaction: one line right after boot (the
// 500ms delay lets the phone side finish its ready handshake)
setTimeout(() => log("boot hello from the watch"), 500);

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressSelect={() => {
			setN((v) => v + 1);
			log(`select #${n() + 1} from the watch`);
		}}
		onPressUp={() => setBoom(true)}
		onPressDown={() => setEboom(true)}>
		<Column>
			<Label style={st} string={() => `sent ${n()}`} />
			<Label style={st} string={() => {
				if (boom()) throw new Error("deliberate binding boom");
				return "UP/DOWN throw, SELECT logs";
			}} />
		</Column>
	</Container>
), { skin: bg, style: st });
