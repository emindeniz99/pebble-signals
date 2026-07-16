// pulse/boot — LAZY post-boot init (importNow("app/boot") from a 400ms
// timer). THE flagship's load-bearing lesson, learned by dying: pulse's
// first build put all of this at module scope in main and hit `fxAbort
// memory full` DURING module load, with identical death instruments across
// every symbol/font diet — main.js itself was the boot cost. main now
// carries FIRST PAINT ONLY; this module's load cost lands at steady state
// (~18KB free), where it is trivial. Receives the face's setters/store as a
// context object — a lazy module may not import the entry (P6 guard).
interface MessageChannel {
	read(): Map<string, unknown>;
}
interface Ctx {
	setName(v: string): void;
}
export default (ctx: Ctx) => {
	const Message = (importNow("pebble/message") as { default: new (o: object) => MessageChannel })
		.default;
	new Message({
		keys: ["config"],
		onReadable(this: MessageChannel) {
			try {
				const s = JSON.parse(String(this.read().get("config") ?? "{}")) as { name?: string };
				if (s.name !== undefined) {
					ctx.setName(s.name);
					localStorage.setItem("pulse-name", s.name);
				}
			} catch {}
		},
	});
};
