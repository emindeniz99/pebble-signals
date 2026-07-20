// Example: free-form Scrollable — a tall Column of 8 text rows inside a 140px
// clipping viewport, scrolled by the up/down buttons stepping a `y` signal, with
// the up/down ContentIndicator chevrons showing the travel remaining. Proves
// button-driven moveBy scroll of ARBITRARY content + the chevron flip at the
// ends (VirtualList recycles FIXED rows; Scrollable scrolls anything you nest).
// The 8×28=224px of content overflows the 140px window, so it actually scrolls.
//   up = scroll up · down = scroll down.
// Build: APP=scrollable ./build.sh
import { render, screen } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { Scrollable } from "runtime/scrollable";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "18px Gothic", color: "white", horizontal: "left" });

const ROWS = [
	"1. Inbox",
	"2. Drafts",
	"3. Sent",
	"4. Spam",
	"5. Trash",
	"6. Archive",
	"7. Starred",
	"8. All Mail",
];
const ROW_H = 28;
const VIEW_H = 140;
const MAX = ROWS.length * ROW_H - VIEW_H; // content height − viewport = max scroll (84)

const [y, setY] = useState(0);
const up = () => setY((v: number) => Math.max(0, v - ROW_H));
const down = () => setY((v: number) => Math.min(MAX, v + ROW_H));

render(
	() => (
		<Container
			left={0}
			right={0}
			top={0}
			bottom={0}
			focus={true}
			onPressUp={up}
			onPressDown={down}
		>
			<Scrollable height={VIEW_H} offset={() => y()} indicator>
				{ROWS.map((r) => (
					<Label style={base} width={screen.width} height={ROW_H} string={r} />
				))}
			</Scrollable>
		</Container>
	),
	{ skin: bg, style: base },
);
