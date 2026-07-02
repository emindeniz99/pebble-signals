// Colorful animated sloth watchface 🦥 — a single 3-frame sprite-sheet
// bitmap (assets/sloth.png: eyes open / half / closed) animated by swapping
// the reactive `variant` prop on a slow timer. ONE texture, decoded once,
// so the animation costs zero extra memory: `variant` only picks which
// 104px slice is blitted. Pixels live in FLASH (resources) + the native
// framebuffer, NOT the 32KB XS heap — see README "Bitmaps".
//
// Watchface: sloth hero, then HH:MM:SS on one line with the seconds in a
// warm accent drawn from the sloth's own fur palette, and a quiet date
// line underneath. Build: APP=sloth ./build.sh
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
declare const Texture: any;

const bg = new Skin({ fill: "black" });
const hms = new Style({ font: "bold 28px Gothic", color: "white" });
// date carries the one restrained accent, drawn from the sloth's fur palette
const date = new Style({ font: "18px Gothic", color: "#FFAA55" });

// one sheet, 104px frames, variant N = the Nth 104px slice
const sheet = new Skin({ texture: new Texture("sloth.png"), x: 0, y: 0, width: 104, height: 104, variants: 104 });

// slow, mostly-open blink: hold open, then a quick down/up flutter
const BLINK = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 1];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const two = (n: number) => (n < 10 ? "0" : "") + n;
const [hm, setHm] = useState("");
const [day, setDay] = useState("");
const [step, setStep] = useState(0);
function tick() {
	const d = new Date();
	setHm(two(d.getHours()) + ":" + two(d.getMinutes()) + ":" + two(d.getSeconds()));
	setDay(DOW[d.getDay()] + " " + d.getDate());
}
tick();
setInterval(tick, 1000);
setInterval(() => setStep((s: number) => (s + 1) % BLINK.length), 220);

render(() => (
	<Container left={0} right={0} top={0} bottom={0}>
		<Column>
			<Content width={104} height={104} skin={sheet} variant={() => BLINK[step()]} />
			<Label style={hms} string={() => hm()} />
			<Label style={date} string={() => day()} />
		</Column>
	</Container>
), { skin: bg, style: hms });
