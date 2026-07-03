// Example: JSX auto-thunk — write the reactive read BARE, no arrow.
//
// `string={count()}` instead of `string={() => count()}`. The build's
// lower.mjs `autoThunk()` pass wraps the reactive read into a thunk at compile
// time (what Solid's compiler does), so this stays fine-grained-reactive while
// reading like React. Only a CALL (`count()`) or `sig.value` is the reactivity
// signal — bare `{count}` is deliberately NOT reactive (it can't be told apart
// from a static value). Build: APP=autothunk ./build.sh
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "28px Gothic", color: "white" });

const [count, setCount] = useState(0);

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressUp={() => setCount((c: number) => c + 1)}
		onPressDown={() => setCount((c: number) => c - 1)}>
		<Column>
			{/* no arrow — auto-thunked at build */}
			<Label string={"Count: " + count()} />
		</Column>
	</Container>
), { skin: bg, style: base });
