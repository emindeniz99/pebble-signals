// M7 — combined demo: useState counter, Show keyed on the counter, keyed
// For todo list with add/remove. Buttons drive it (the QEMU touch
// peripheral crashes the firmware on real touches — see README; onTap is
// proven in M4/M5): select = count+1 (toggles Show), up = add todo,
// down = remove first todo. The For children function is the per-row
// component (components run once).
//
// Memory (measured, see README): closures/signals/effects cost the
// firmware-fixed 32KB JS arena — the scarce resource — so one skin, one
// style, short strings. Show wraps its sides in Containers internally
// (bare-Label swaps crash the piu port; the runtime shields that now).
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { Show, For } from "runtime/flow";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "24px Gothic", color: "white" });

const [count, setCount] = useState(0);
const [todos, setTodos] = useState([1]);
let nextId = 2;
// Soft cap 99: high enough that tools/memtest.py --ramp can add rows until
// the arena actually dies (the measured limit is what the ramp reports).
function addTodo() { if (todos().length < 99) setTodos([...todos(), nextId++]); }
function removeTodo() { setTodos(todos().slice(1)); }

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressSelect={() => setCount((c: number) => c + 1)}
		onPressUp={addTodo} onPressDown={removeTodo}>
		<Column>
			<Label string={() => "c" + count()} />
			<Show keepAlive={true} when={() => count() % 2 === 1} width={120} height={30}
				fallback={() => <Label string="even" />}>
				{() => <Label string="odd!" />}
			</Show>
			<For each={() => todos()} key={(id: number) => id} width={120}>
				{(id: number) => <Label string={"t" + id} />}
			</For>
		</Column>
	</Container>
), { skin: bg, style: base });
