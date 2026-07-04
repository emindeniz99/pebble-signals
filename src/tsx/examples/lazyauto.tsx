// LAZYAUTO — the WATCHFACE pattern (owner's 10ms idea): no buttons needed;
// a 10ms timer fires AFTER the module body (= after boot pressure passes)
// and importNow-loads the 40KB screen automatically. If this renders, both
// "timer-deferred load" and "watchface-compatible trigger" are proven.
import { render } from "runtime/jsx-runtime";
import { Navigator } from "runtime/flow";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "bold 24px Gothic", color: "white" });
let NAV: any = null;

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}>
		<Column>
			<Navigator root={(nav: any) => { NAV = nav; return (
				<Column>
					<Label string="lazyauto: loading in 10ms" />
				</Column>
			); }} />
		</Column>
	</Container>
), { skin: bg, style: base });

setTimeout(() => { if (NAV) NAV.push(importNow("app/s1").default); }, 10);
