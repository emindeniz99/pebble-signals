// rootapp — the ROOT-COMPONENT entry convention (typesafe, no hand-written
// render()). Export default a `Component`; the build detects it and
// generates the render() shim. The optional sibling `export const app` is
// the Application dictionary (skin/style); `export const opts`
// (RenderOptions) exists for the rare boundary opt-out. The types are
// compile-time only — this app ships not one byte more than the same app
// with a hand-written render().
import type { AppDict, Component } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const st = new Style({ font: "bold 24px Gothic", color: "white" });
const [n, setN] = useState(0);

export const app: AppDict = { skin: bg, style: st };

const App: Component = () => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressUp={() => setN((v) => v + 1)}
		onPressDown={() => setN((v) => v - 1)}>
		<Column>
			<Label style={st} string={() => `root ${n()}`} />
		</Column>
	</Container>
);
export default App;
