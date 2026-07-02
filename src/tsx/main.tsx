// M7 — combined demo: useState counter, Show keyed on the counter, keyed
// For todo list with add/remove. Buttons drive it (the QEMU touch
// peripheral crashes the firmware on real touches — see README; onTap is
// proven in M4/M5): select = count+1 (toggles Show), up = add todo,
// down = remove first todo. The For children function is the per-row
// component (components run once).
//
// Two measured piu-Pebble constraints shape this file (see README):
//  - the firmware-fixed 32KB JS arena: closures/signals/effects are the
//    scarce resource, so one skin, one style, short strings; and
//  - Show children/fallback must be Container-wrapped — swapping a bare
//    Label as the host's direct child crashes the port, while the
//    Container-wrapped shape survives arbitrary toggles.
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { Show, For } from "runtime/flow";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "24px Gothic", color: "white" });

const [count, setCount] = useState(0);
const [todos, setTodos] = useState([1, 2]);
let nextId = 3;
function addTodo() { if (todos().length < 3) setTodos([...todos(), nextId++]); }
function removeTodo() { setTodos(todos().slice(1)); }

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressSelect={() => setCount((c: number) => c + 1)}
		onPressUp={addTodo} onPressDown={removeTodo}>
		<Column>
			<Label string={() => "c" + count()} />
			<Show keepAlive={true} when={() => count() % 2 === 1} width={120} height={30}
				fallback={() => (
					<Container width={120} height={30}>
						<Label string="even" />
					</Container>
				)}>
				{() => (
					<Container width={120} height={30}>
						<Label string="odd!" />
					</Container>
				)}
			</Show>
			<For each={() => todos()} key={(id: number) => id} width={120}>
				{(id: number) => <Label string={"t" + id} />}
			</For>
		</Column>
	</Container>
), { skin: bg, style: base });
