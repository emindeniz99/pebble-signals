// connection — live bluetooth / phone-link state on the watch itself: the phone
// app connection plus the PebbleKit companion connection, straight from
// runtime/connection's useConnection() hook. The headline flips
// Connected/Disconnected reactively; each Label binds a thunk, so only the line
// whose value changed repaints. Drive it headlessly from the emulator (no phone
// needed):
//   pebble emu-bt-connection --connected no    # drop the link  -> "Disconnected"
//   pebble emu-bt-connection --connected yes   # restore it     -> "Connected"
//
// The hook is called INSIDE the render build on purpose: jsx-runtime runs the
// build under a root owner (createRoot), so useConnection's onCleanup binds there
// and its "connected" listener is removed when the app is torn down (no leak).
// NOTE (MEDIUM confidence): confirm the host "connected" event actually FIRES
// under QEMU's emu-bt-connection — the native connection_service subscription is
// real (global.js calls connected(true) on the first listener), but the
// emulator's injection path is unverified on SDK 4.17. If it does not fire, the
// seed still shows the state read at build time but will not repaint live.
import { render } from "runtime/jsx-runtime";
import { useConnection } from "runtime/connection";

const bg = new Skin({ fill: "black" });
const title = new Style({ font: "bold 24px Gothic", color: "white" });
const body = new Style({ font: "18px Gothic", color: "#AAAAAA" });

render(
	() => {
		const conn = useConnection(); // reactive { app, pebblekit }; cleaned up with the root
		return (
			<Container left={0} right={0} top={0} bottom={0}>
				<Column>
					<Label style={title} string={() => (conn().app ? "Connected" : "Disconnected")} />
					<Label style={body} string={() => `phone app: ${conn().app ? "yes" : "no"}`} />
					<Label style={body} string={() => `pebblekit: ${conn().pebblekit ? "yes" : "no"}`} />
				</Column>
			</Container>
		);
	},
	{ skin: bg, style: body },
);
