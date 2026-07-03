// Component-style usage (both forms). Every other example puts state at module
// scope because components run ONCE here (Solid model) — so root-level and
// in-component state behave identically. This shows you CAN factor UI into
// components, and that arrow vs `function` is purely stylistic in an app file.
//
//   * arrow  `const C = () => <.../>`  — concise, no hoisting (author's pick)
//   * named  `function C() { ... }`     — hoisted, shows up in stack traces
// Both are just functions the JSX factory calls as `type(props)`. (NOTE: in a
// PRELOADED runtime/* module, top-level `function` is banned — gotcha 13 — so
// there `const C = () =>` is required. App files like this one are unrestricted.)
// Build: APP=component ./build.sh
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const big = new Style({ font: "bold 28px Gothic", color: "white" });
const dim = new Style({ font: "18px Gothic", color: "#FFAA55" });

// state lives in the component that owns it, passed down as props (a getter
// thunk + a setter) — ordinary composition, no context needed.
const Readout = (props: { value: () => number }) =>			// arrow component
	<Label style={big} string={() => "count " + props.value()} />;

function Hint() {							// named component (equivalent)
	return <Label style={dim} string="UP / DOWN" />;
}

const App = () => {
	const [count, setCount] = useState(0);
	return (
		<Container left={0} right={0} top={0} bottom={0} focus={true}
			onPressUp={() => setCount((c: number) => c + 1)}
			onPressDown={() => setCount((c: number) => c - 1)}>
			<Column>
				<Readout value={count} />
				<Hint />
			</Column>
		</Container>
	);
};

render(() => <App />, { skin: bg, style: big });
