// Keyboard-less text entry — Pebble has 4 buttons, no keys. A button-driven
// character picker feeds a reactive todo list, showing that real text input
// is just signals + button behaviors (no special widget needed):
//   Up / Down : cycle the candidate character (a…z, then ␣ space)
//   Select    : append the candidate to the current word buffer
//   Back      : commit the buffer as a todo item (clears it); on an empty
//               buffer Back falls through so the app can still exit.
// Everything on screen is a reactive <Label> binding. Build: --app textinput
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const big = new Style({ font: "bold 24px Gothic", color: "white" });
const dim = new Style({ font: "18px Gothic", color: "#FFAA55" });

const ALPHABET = "abcdefghijklmnopqrstuvwxyz "; // 27: a-z + trailing space
const show = (c: string) => (c === " " ? "␣" : c); // ␣ for a visible space

const [ci, setCi] = useState(0); // candidate index into ALPHABET
const [buf, setBuf] = useState(""); // the word being typed
const [count, setCount] = useState(0); // committed todo count
const [last, setLast] = useState("(none)"); // most recent committed todo

const cycle = (d: number) => setCi((i: number) => (i + d + ALPHABET.length) % ALPHABET.length);
const append = () => {
	const c = ALPHABET[ci()];
	setBuf((b: string) => b + c);
};
const commit = () => {
	const w = buf();
	if (!w) return false; // empty: let Back exit the app
	setLast(w);
	setCount((c: number) => c + 1);
	setBuf("");
	return true;
};

render(
	() => (
		<Container
			left={0}
			right={0}
			top={0}
			bottom={0}
			focus={true}
			onPressUp={() => cycle(-1)}
			onPressDown={() => cycle(1)}
			onPressSelect={append}
			onPressBack={commit}
		>
			<Column>
				<Label style={big} string={() => "› " + show(ALPHABET[ci()])} />
				<Label string={() => "[" + buf() + "]"} />
				<Label style={dim} string={() => "todo: " + count()} />
				<Label style={dim} string={() => "last: " + last()} />
			</Column>
		</Container>
	),
	{ skin: bg, style: big },
);
