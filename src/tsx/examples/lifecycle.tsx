// runtime/lifecycle receipt — app lifecycle + wakeup on the watch itself. Shows
// WHY the app launched (useLaunchReason — a one-shot: the AppLaunchReason), and,
// reactively, whether it currently owns the screen (useAppFocus) and the last
// wakeup that fired (useWakeup().last — seeded from watch.wake). SELECT schedules
// a wakeup ~60s out; when it fires (usually after the app is relaunched at that
// wall-clock time) `last` reflects it. All three hooks are called INSIDE the
// render build, so their onCleanup listeners bind to the screen root and are
// removed on teardown (Rule 5).
//
// DEVICE-GATED (see the runtime/lifecycle module header): "didFocus" is
// EMULATOR-UNCERTAIN — QEMU may not deliver it, so "focus" can stay ON — and
// wakeup is DEVICE-FIRST — `last` only updates when a scheduled wakeup actually
// fires at its wall-clock time, usually on the NEXT launch. Verify both on real
// hardware. Buttons only — QEMU touch crashes the firmware (gotcha 2):
//   SELECT = schedule a wakeup ~60s out (cookie 1).
// Build: APP=lifecycle ./build.sh
import { render } from "runtime/jsx-runtime";
import { useAppFocus, useLaunchReason, useWakeup } from "runtime/lifecycle";

const bg = new Skin({ fill: "black" });
const title = new Style({ font: "bold 24px Gothic", color: "white" });
const body = new Style({ font: "18px Gothic", color: "white" });

render(
	() => {
		const launch = useLaunchReason(); // one-shot: why we launched (fixed for the run)
		const focused = useAppFocus(); // reactive focus state (device-gated: didFocus)
		const wakeup = useWakeup(); // scheduler + reactive last-fired (device-first)
		return (
			<Container
				left={0}
				right={0}
				top={0}
				bottom={0}
				focus={true}
				onPressSelect={() => {
					wakeup.schedule(Date.now() + 60000, 1);
				}}
			>
				<Column>
					<Label style={title} string="lifecycle" />
					<Label style={body} string={"launch reason: " + launch.reason} />
					<Label style={body} string={() => "focus: " + (focused() ? "ON" : "OFF")} />
					<Label style={body} string={() => "last wake: " + (wakeup.last()?.cookie ?? "none")} />
				</Column>
			</Container>
		);
	},
	{ skin: bg, style: body },
);
