// Folder-convention auto screen splitting: every file in
// ./autoscreens/screens/ ships as a lazy module `app/screens/<name>` — no
// per-screen importNow literal, and the name can be COMPUTED because the
// whole folder ships (treeshake/prune stay ON; each screen's bytecode
// loads from flash on first push). Build: --app autoscreens
import { Navigator } from "runtime/flow";
import { render } from "runtime/jsx-runtime";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "bold 24px Gothic", color: "white" });
const names = ["alpha", "beta"];
let idx = 0;
let NAV: any = null;

render(
	() => (
		<Container
			left={0}
			right={0}
			top={0}
			bottom={0}
			focus={true}
			onPressSelect={() => {
				NAV.push(importNow("app/screens/" + names[idx++ % names.length]).default);
			}}
			onPressBack={() => {
				if (NAV.canPop()) {
					NAV.pop();
					return true;
				}
				return false;
			}}
		>
			<Column>
				<Navigator
					root={(nav: any) => {
						NAV = nav;
						return (
							<Column>
								<Label string="autoscreens" />
								<Label string="select = next screen" />
							</Column>
						);
					}}
				/>
			</Column>
		</Container>
	),
	{ skin: bg, style: base },
);
