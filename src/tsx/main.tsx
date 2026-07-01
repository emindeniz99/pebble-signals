// M6 — For: keyed add/remove/reorder. Watch buttons drive the list
// (up=add, select=reverse, down=remove first); rows also expose onTap.
// The QEMU touch peripheral crashes the firmware on real-coordinate
// touches (see README), so emulator verification uses buttons.
import { render } from "runtime/jsx-runtime";
import { For } from "runtime/flow";
import { signal } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const rowSkin = new Skin({ fill: "#246" });
const base = new Style({ font: "18px Gothic", color: "white" });
const hint = new Style({ font: "14px Gothic", color: "silver" });

let nextId = 1;
const items = signal([] as { id: number, label: string }[]);

function add() {
	const id = nextId++;
	items.value = [...items.value, { id, label: "item #" + id }];
}
function removeFirst() {
	items.value = items.value.slice(1);
}
function reverse() {
	items.value = [...items.value].reverse();
}

add(); add(); add();

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressUp={add} onPressSelect={reverse} onPressDown={removeFirst}>
		<Column top={26}>
			<Label string={() => "M6 rows: " + items.value.length} />
			<For each={() => items.value} key={(it: any) => it.id} width={190}>
				{(it: any) => (
					<Container width={190} height={22} skin={rowSkin}
						onTap={() => removeFirst()}>
						<Label string={it.label} />
					</Container>
				)}
			</For>
			<Label style={hint} string="up:add sel:rev down:del" />
		</Column>
	</Container>
), { skin: bg, style: base });
