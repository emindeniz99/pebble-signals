// clock — the runtime/clock receipt: a big HH:MM:SS that ticks on the native
// firmware second timer (NOT setInterval), plus a day+date line on the minute
// tick. useTimeParts() gives per-field getters over ONE useClock() Date; a
// second useClock("minute") drives the date — BOTH listeners ride the ONE shared
// firmware timer (host global.js #schedule), so this costs one timer, not two.
// UP toggles 12h/24h: a pure display projection over the same tick, proving
// reactivity layers on top of the clock without re-subscribing.
// It self-ticks in the emulator; set/verify the base time with `pebble emu-set-time`.
// Buttons (QEMU touch crashes the firmware — README gotcha 2): UP = 12h/24h.
// Build: APP=clock ./build.sh
import { render } from "runtime/jsx-runtime";
import { useClock, useTimeParts } from "runtime/clock";
import { useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const big = new Style({ font: "bold 42px Bitham", color: "white" });
const small = new Style({ font: "18px Gothic", color: "#AAAAAA" });

const two = (n: number) => (n < 10 ? "0" : "") + n;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// The hooks are called INSIDE the component (Rule 5 — lazy at runtime, owned by
// render's root so onCleanup removes the listeners on teardown), not at module scope.
const App = () => {
	// per-field getters over ONE second-granularity Date (see runtime/clock)
	const { hours, minutes, seconds } = useTimeParts();
	// the date only changes on the minute — subscribe at the cheaper granularity
	const now = useClock("minute");
	const [h12, setH12] = useState(false);
	// 12h display is a pure projection of hours() — reactive, no re-subscribe
	const shown = () => (h12() ? hours() % 12 || 12 : hours());
	return (
		<Container
			left={0}
			right={0}
			top={0}
			bottom={0}
			focus={true}
			onPressUp={() => setH12((v: boolean) => !v)}
		>
			<Column>
				<Label
					style={big}
					string={() => two(shown()) + ":" + two(minutes()) + ":" + two(seconds())}
				/>
				<Label
					style={small}
					string={() =>
						DAYS[now().getDay()] + " " + two(now().getDate()) + "." + two(now().getMonth() + 1)
					}
				/>
				<Label style={small} string={() => (h12() ? "12h - UP for 24h" : "24h - UP for 12h")} />
			</Column>
		</Container>
	);
};

render(() => <App />, { skin: bg, style: small });
