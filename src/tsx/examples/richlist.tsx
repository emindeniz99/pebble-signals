// Example: RICH recycled row — VirtualList renderRow with a SINGLE visible
// row (a Row of two Labels: index + value). Single row = lowest arena cost,
// so this one SCROLLS (up/down) where 2-3 rich rows crashed. Trades visible
// rows for row richness on the 32KB arena. Build: APP=richlist ./build.sh
import { render } from "runtime/jsx-runtime";
import { useState, createStore } from "runtime/signals";
import { VirtualList } from "runtime/flow";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "24px Gothic", color: "white" });
const dim = new Style({ font: "18px Gothic", color: "white" });

const st = createStore(128);
for (let i = 1; i <= 5; i++)
	st.push(i % 3 === 0 ? "item" + i : i);

const [offset, setOffset] = useState(0);
const maxOffset = () => Math.max(0, st.count() - 1);
function up() { setOffset((o: number) => Math.max(0, o - 1)); }
function down() { setOffset((o: number) => Math.min(maxOffset(), o + 1)); }

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressUp={up} onPressDown={down}>
		<VirtualList data={st} rows={1} width={180} at={() => offset()}
			renderRow={(idx: () => number, data: any) => (
				<Row height={40}>
					<Label width={44} style={dim} string={() => (idx() + 1) + "."} />
					<Label width={130} string={() => {
						const v = data.get(idx());
						return v === undefined ? "" : (typeof v === "number" ? "#" + v : String(v));
					}} />
				</Row>
			)} />
	</Container>
), { skin: bg, style: base });
