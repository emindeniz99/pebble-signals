// M9 — windowed dynamic list over a BYTE POOL. The list data lives in one
// Uint8Array (chunk bytes: 1 byte costs 1 byte) instead of per-row JS
// objects (each row of the M7 list cost ~450B of 16B slots and the arena
// died adding row 5). Records are [type][len][payload...] — type 0 =
// int32 LE, type 1 = string bytes — so the list holds MIXED types and is
// fully dynamic. The screen shows a fixed 3-row window that follows the
// list tail; scrolling/growth re-runs three string bindings, allocating
// nothing but the label text. tools/memtest.py --ramp proves the point:
// each `up` press appends a record and memory stays FLAT to --max instead
// of dying at the old 4-row cliff.
//
// (FFI was the first choice for the store — the data would live in the
// 122KB native heap — but enabling fxBuildFFI on this firmware HALVES the
// JS arena to a fixed 832-slot heap, which cannot hold the runtime: see
// handbook gotcha 17. The byte pool delivers the same shape inside the
// arena at 1B/byte.)
//
// Buttons (QEMU touch crashes the firmware — see handbook gotcha 2):
// up = push record (odd ids: string "sN"; even ids: int32 N) ·
// down = remove the FIRST record.
import { render } from "runtime/jsx-runtime";
import { useState, useEffect } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "24px Gothic", color: "white" });

const W = 3;			// visible window rows
const POOL = 512;		// record bytes; ~85 int records (6B each)
const pool = new Uint8Array(POOL);
let head = 0, tail = 0;		// live records occupy pool[head..tail)

const [count, setCount] = useState(0);
let nextId = 1;

function push() {
	const id = nextId++;
	let t = 0, len = 4;
	let s = "";
	if (id % 2) {		// odd ids: string record
		s = "s" + id;
		t = 1; len = s.length;
	}
	if (tail + 2 + len > POOL) {	// compact live records to the front
		for (let i = head; i < tail; i++)
			pool[i - head] = pool[i];
		tail -= head; head = 0;
		if (tail + 2 + len > POOL)
			return;		// genuinely full
	}
	pool[tail] = t; pool[tail + 1] = len;
	if (t) {
		for (let i = 0; i < len; i++)
			pool[tail + 2 + i] = s.charCodeAt(i) & 255;
	}
	else {
		pool[tail + 2] = id & 255; pool[tail + 3] = (id >> 8) & 255;
		pool[tail + 4] = (id >> 16) & 255; pool[tail + 5] = (id >> 24) & 255;
	}
	tail += 2 + len;
	setCount(count() + 1);
}

function drop() {		// remove the FIRST record: advance head
	if (!count())
		return;
	head += 2 + pool[head + 1];
	if (head === tail)
		head = tail = 0;
	setCount(count() - 1);
}

// Decode the record for window slot 0..W-1 by walking the pool. Reading
// count() re-runs the row bindings on push/drop; the window tracks the tail.
function row(slot: number) {
	const n = count();
	const want = (n > W ? n - W : 0) + slot;
	if (want >= n)
		return "";
	let p = head;
	for (let i = 0; i < want; i++)
		p += 2 + pool[p + 1];
	const t = pool[p], len = pool[p + 1];
	if (!t)			// int32 LE
		return "#" + ((pool[p + 2] | (pool[p + 3] << 8) | (pool[p + 4] << 16) | (pool[p + 5] << 24)) | 0);
	let s = "";
	for (let i = 0; i < len; i++)
		s += String.fromCharCode(pool[p + 2 + i]);
	return s;
}

const port = new Port(null, {
	width: 180, height: 130,
	behavior: {
		onDraw(p: any) {
			p.drawString("n" + count(), base, "white", 30, 0);
			for (let s = 0; s < W; s++)
				p.drawString(row(s), base, "white", 30, 30 * (s + 1));
		},
	},
});
useEffect(() => { count(); port.invalidate(); });

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressUp={push} onPressDown={drop}>
		<Column>
			{port}
		</Column>
	</Container>
), { skin: bg, style: base });
