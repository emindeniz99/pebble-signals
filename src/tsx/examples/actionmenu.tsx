// runtime/actionmenu receipt — a modal action sheet whose active row follows a
// signal. ActionMenu is DISPLAY-ONLY: the app owns the active index and drives
// it; the sheet just highlights the row. The highlight moves for free — `active`
// is a thunk read inside ActionMenu's internal effect (idiom 5b), so there is no
// bind wiring at the call site. A centered 132x140 dark panel over the black app,
// titled "Message" (bold white), with three actions; the active one wears the
// teal activeFill. It is a hand-built composition (Container + Column of Labels,
// explicit dims — gotcha 16), NOT a Canvas, so there is nothing to invalidate.
// Buttons (QEMU touch crashes the firmware — README gotcha 2):
//   up = previous action (wraps) · down = next action (wraps).
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { ActionMenu } from "runtime/actionmenu";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "18px Gothic", color: "white" });

const ACTIONS = ["Reply", "Archive", "Delete"];
const [act, setAct] = useState(0);
const next = () => setAct((a: number) => (a + 1) % ACTIONS.length);
const prev = () => setAct((a: number) => (a - 1 + ACTIONS.length) % ACTIONS.length);

render(
	() => (
		<Container
			left={0}
			right={0}
			top={0}
			bottom={0}
			focus={true}
			onPressUp={prev}
			onPressDown={next}
		>
			<ActionMenu
				actions={ACTIONS}
				active={act}
				title="Message"
				width={132}
				height={140}
				background="#202020"
				activeFill="#1a4d4d"
			/>
		</Container>
	),
	{ skin: bg, style: base },
);
