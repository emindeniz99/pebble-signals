// Colorful animated sloth watchface 🦥 — a single 2-frame sprite-sheet
// bitmap (assets/sloth.png, 280×140: eyes open / closed) animated by swapping
// the reactive `variant` prop on a slow timer. ONE texture, decoded once,
// so the animation costs zero extra memory: `variant` only picks which
// 140px slice is blitted. Pixels live in FLASH (resources) + the native
// framebuffer, NOT the 32KB XS heap — see README "Bitmaps".
//
// Layout (design pass): the sloth is the hero; the type is its calm
// counterpoint. HH:MM is the one confident white readout; the seconds drop to
// a quiet supporting line as the SINGLE warm accent drawn from the fur, so the
// eye reads the time first and the live tick second. The date recedes (muted
// grey, uppercased). On round a slim spacer nudges the group down so the
// branch clears the bezel. Build: APP=sloth ./build.sh
import { render, screen } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
declare const Texture: any;

const bg = new Skin({ fill: "black" });
// the one confident element — white, high-contrast display face
const hm = new Style({ font: "bold 42px Bitham", color: "white" });
// supporting line: the date recedes (muted grey); the seconds carry the lone
// warm accent pulled from the sloth's own fur palette
const dim = new Style({ font: "18px Gothic", color: "#7a7a7a" });
const warm = new Style({ font: "18px Gothic", color: "#e6a96b" });

// one sheet, 140px frames, variant N = the Nth 140px slice (0 open, 1 closed)
const sheet = new Skin({ texture: new Texture("sloth.png"), x: 0, y: 0, width: 140, height: 140, variants: 140 });

// slow, mostly-open blink: hold open (0), brief blink closed (1)
const BLINK = [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1];
const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const two = (n: number) => (n < 10 ? "0" : "") + n;

const [hhmm, setHhmm] = useState("");
const [secs, setSecs] = useState("");
const [day, setDay] = useState("");
const [step, setStep] = useState(0);
function tick() {
	const d = new Date();
	setHhmm(two(d.getHours()) + ":" + two(d.getMinutes()));
	setSecs(two(d.getSeconds()));
	setDay(DOW[d.getDay()] + " " + d.getDate());
}
tick();
setInterval(tick, 1000);
setInterval(() => setStep((s: number) => (s + 1) % BLINK.length), 220);

render(() => (
	<Container left={0} right={0} top={0} bottom={0}>
		<Column>
			{/* on round, a slim spacer drops the whole group so the branch
			    clears the top bezel (the centered column re-balances) */}
			<Content width={2} height={screen.round ? 24 : 1} />
			<Content width={140} height={140} skin={sheet} variant={() => BLINK[step()]} />
			<Label style={hm} string={() => hhmm()} />
			<Row>
				<Label style={dim} string={() => day() + "   ·  "} />
				<Label style={warm} string={() => secs() + "s"} />
			</Row>
		</Column>
	</Container>
), { skin: bg, style: hm });
