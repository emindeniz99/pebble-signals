// runtime/textflow receipt — a wrapped paragraph that re-flows reactively, and
// on a ROUND screen FILLS the circle (a lens of text, not a square block).
// TextFlow is DISPLAY-ONLY: the app owns the string and TextFlow wraps it (manual
// word-wrap into a Column of Label lines — NOT Piu 'Text'). The block re-wraps
// for free — `text` is a thunk read inside TextFlow's internal effect (idiom 5b),
// so a button that flips the source signal rebuilds the lines with no bind wiring.
//
// ROUND HARMONY (embrace the circle): with `shape="circle"` each line is wrapped
// to the circle's chord at its height, so the top/bottom lines are short and the
// middle lines long — the paragraph silhouette becomes a circle that USES the
// whole round screen instead of a centered square that wastes the corners. The
// lens is centered on the screen (the full-bleed Container centers the Column).
// On rect there is no circle to fill, so it falls back to a left-aligned block.
// Buttons (QEMU touch crashes the firmware — README gotcha 2):
//   up / down / back = swap between the paragraphs (watch the block re-flow).
import { render, screen } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { TextFlow } from "runtime/textflow";

// Module-scope host objects are FINE in an APP (only preloaded runtime/ modules
// freeze them into broken ROM). Black background + a valid-font base Style.
const bg = new Skin({ fill: "black" });
const base = new Style({ font: "18px Gothic", color: "white" });

// Long paragraphs so the circle actually FILLS on a round screen (a short string
// can't reach the rim). Lorem is the canonical "how far does text spread" probe.
const PARAS = [
	"Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam.",
	"Signal Piu wraps this paragraph to the circle's chord at every line, so the text fills the round screen as a lens instead of a centered square that wastes the corners.",
];
const [which, setWhich] = useState(0);
const toggle = () => setWhich((w: number) => (w + 1) % PARAS.length);

render(
	() => {
		const round = screen.round;
		return (
			<Container
				left={0}
				right={0}
				top={0}
				bottom={0}
				focus={true}
				onPressUp={toggle}
				onPressDown={toggle}
				onPressBack={toggle}
			>
				{round ? (
					// Embrace the circle: a full-screen lens of text, centered, no header
					// stealing the top band. shape="circle" is inherently center-aligned.
					<TextFlow text={() => PARAS[which()]} shape="circle" lineHeight={22} maxLines={9} />
				) : (
					// Rect: the classic left-aligned block under a header.
					<Column>
						<Label string="TextFlow" />
						<TextFlow text={() => PARAS[which()]} width={140} lineHeight={20} align="left" />
					</Column>
				)}
			</Container>
		);
	},
	{ skin: bg, style: base },
);
