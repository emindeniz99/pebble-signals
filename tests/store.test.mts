// Typed byte-record store suite — value-semantics serialization store
// (docs/handbook.md: "Byte-record store"). Runs on Node against the real module.
import { createStore } from "../src/embeddedjs/runtime-build/signals.js";
import { makeChecker } from "./load-runtime.mts";

const { check, done } = makeChecker("store");

// primitives round-trip
const s = createStore(256);
check("push int", s.push(42) === 1);
check("get int", s.get(0) === 42);
check("negative int", (s.push(-7), s.get(1) === -7));
check("int32 min", (s.push(-0x80000000), s.get(2) === -0x80000000));
check("float", (s.push(3.25), s.get(3) === 3.25));
check("string", (s.push("hi tödo"), s.get(4) === "hi tödo"));
check("empty string", (s.push(""), s.get(5) === ""));
check("true", (s.push(true), s.get(6) === true));
check("false", (s.push(false), s.get(7) === false));
check("null", (s.push(null), s.get(8) === null));
check("count", s.count() === 9);

// mixed order preserved
check("order", s.get(0) === 42 && s.get(3) === 3.25 && s.get(6) === true);

// remove middle shifts the rest
s.remove(3); // the float
check("remove middle count", s.count() === 8);
check("remove middle shift", s.get(3) === "hi tödo" && s.get(7) === null);
check("remove bad index", s.remove(99) === -1);
check("get bad index", s.get(99) === undefined);
// a non-integer index must return undefined, NOT hang: `while (i--)` never
// reaches 0 from a fraction (a VirtualList at() returning 0.5 would freeze)
check("get fractional index is undefined (no hang)", s.get(0.5) === undefined);
check("get NaN index is undefined", s.get(NaN) === undefined);

// custom type: {id, done, title}
const TODO = 8;
const s2 = createStore(64);
s2.def(
	TODO,
	(v, b, off, max) => {
		const len = 5 + v.title.length;
		if (len > max) return -1;
		b[off] = v.done ? 1 : 0;
		b[off + 1] = v.id & 255;
		b[off + 2] = (v.id >> 8) & 255;
		b[off + 3] = (v.id >> 16) & 255;
		b[off + 4] = (v.id >> 24) & 255;
		for (let i = 0; i < v.title.length; i++) b[off + 5 + i] = v.title.charCodeAt(i) & 255;
		return len;
	},
	(b, off, len) => {
		let title = "";
		for (let i = 5; i < len; i++) title += String.fromCharCode(b[off + i]);
		return {
			done: !!b[off],
			id: b[off + 1] | (b[off + 2] << 8) | (b[off + 3] << 16) | (b[off + 4] << 24),
			title,
		};
	},
);
check("custom push", s2.push({ done: true, id: 300, title: "buy" }, TODO) === 1);
const t = s2.get(0);
check("custom roundtrip", t.done === true && t.id === 300 && t.title === "buy");
check("custom is a copy", s2.get(0) !== t);

// custom mixes with primitives
s2.push(9);
check("custom + primitive", s2.get(1) === 9 && s2.get(0).id === 300);

// capacity: full store rejects, count unchanged
const s3 = createStore(8); // fits one i32 record (2+4), then 2 spare bytes
check("fits first", s3.push(1) === 1);
check("rejects when full", s3.push(2) === -1);
check("count intact after reject", s3.count() === 1 && s3.get(0) === 1);
check("boolean fits in 2 spare bytes", s3.push(true) === 2);

// remove at head and at tail (the demo's exact calls + the no-copy edge)
const s5 = createStore(64);
s5.push(1);
s5.push(2);
s5.push(3);
check("remove head", s5.remove(0) === 2 && s5.get(0) === 2);
check("remove tail", s5.remove(1) === 1 && s5.get(0) === 2 && s5.get(1) === undefined);

// float specials round-trip through the f64 path
const s6 = createStore(64);
s6.push(Infinity);
s6.push(-Infinity);
s6.push(NaN);
s6.push(1e300);
check("Infinity", s6.get(0) === Infinity);
check("-Infinity", s6.get(1) === -Infinity);
check("NaN", Number.isNaN(s6.get(2)));
check("f64 magnitude", s6.get(3) === 1e300);

// objects without a registered codec are REJECTED, not silently nulled
check("object rejected", s6.push({ a: 1 }) === -1);
check("undefined stores as null", (s6.push(undefined), s6.get(4) === null));

// persistence: save/load roundtrip through a localStorage stub
const mem = new Map();
globalThis.localStorage = {
	setItem: (k, v) => mem.set(k, v),
	getItem: (k) => (mem.has(k) ? mem.get(k) : null),
};
const s7 = createStore(64);
s7.push(42); // T_I32, len 4
s7.push("höla"); // T_STR, variable
s7.push(true); // T_TRUE, len 0
s7.push(3.5); // T_F64, len 8 — exercises the valid fixed-width-8 path on load
s7.save("k");
const s8 = createStore(64);
check("load returns true", s8.load("k") === true);
check("load count", s8.count() === 4);
check(
	"load roundtrip",
	s8.get(0) === 42 && s8.get(1) === "höla" && s8.get(2) === true && s8.get(3) === 3.5,
);
check("load missing key", createStore(8).load("nope") === false);
// a fixed-width tag carrying the WRONG length must be rejected at load (not
// decoded as stale bytes by a later get()): build raw [tag,len,...] blobs.
const raw = (...bytes: number[]) => String.fromCharCode(...bytes);
mem.set("f64bad", raw(1, 4, 0, 0, 0, 0)); // T_F64 claims len 4, needs 8
check("load rejects wrong-width f64", createStore(64).load("f64bad") === false);
mem.set("boolbad", raw(3, 1, 0)); // T_TRUE claims len 1, must be 0
check("load rejects nonzero-len bool", createStore(64).load("boolbad") === false);
mem.set("reserved", raw(6, 0)); // tag 6 is reserved (no codec range)
check("load rejects reserved tag", createStore(64).load("reserved") === false);
mem.set("stray", raw(3, 0, 7)); // a valid bool record + one stray header byte
check("load rejects a lone trailing header byte", createStore(64).load("stray") === false);
mem.set("over", raw(2, 5, 65, 66, 67)); // T_STR len 5 (valid-width) but only 3 payload bytes
check("load rejects a record overrunning the blob", createStore(64).load("over") === false);
// a REJECTED load is a no-op: seeded defaults survive corrupt input (the walk
// validates `s` before any byte is committed to the buffer)
const seeded = createStore(64);
seeded.push(99);
seeded.push("keep");
check("load rejection preserves seeded contents", seeded.load("over") === false);
check(
	"seeded records intact after rejected load",
	seeded.get(0) === 99 && seeded.get(1) === "keep",
);
mem.set("bad", "\u0000\u00ff"); // header says len 255, stream is 2 bytes
check("load rejects corrupt", createStore(64).load("bad") === false);
mem.set("big", "x".repeat(100));
check("load rejects oversize", createStore(8).load("big") === false);

// oversize string rejected
const s4 = createStore(512);
check("string >255 rejected", s4.push("x".repeat(256)) === -1);
check("255-char string ok", s4.push("y".repeat(255)) === 1 && s4.get(0).length === 255);

// unregistered custom tag fails loud (not a cryptic TypeError)
let threw = false;
try {
	createStore(64).push({}, 200);
} catch (e) {
	threw = /no codec for tag 200/.test(e.message);
}
check("push with unregistered tag throws clear error", threw);

// def() enforces the 8..255 custom-tag contract — a codec on a built-in tag
// (0-7) would be silently read back as an int/bool/etc; a tag past 255
// truncates into the byte header. Fail loud at registration.
const defThrows = (tag) => {
	try {
		createStore(16).def(
			tag,
			() => 0,
			() => 0,
		);
		return false;
	} catch (e) {
		return /custom tag must be an integer 8\.\.255/.test(e.message);
	}
};
check("def rejects a built-in tag (5)", defThrows(5));
check("def rejects tag 7 (reserved)", defThrows(7));
check("def rejects a tag past 255", defThrows(256));
check("def rejects a fractional tag (writes a different header int)", defThrows(8.5));
check("def rejects a NaN tag", defThrows(NaN));
{
	// positive: tag 8 and 255 register without throwing
	const sd = createStore(16);
	let ok = true;
	try {
		sd.def(
			8,
			() => 0,
			() => 0,
		);
		sd.def(
			255,
			() => 0,
			() => 0,
		);
	} catch {
		ok = false;
	}
	check("def accepts the 8..255 range ends", ok);
}

// coverage: custom codec push when the store is already FULL (max < 0 path)
const sfull = createStore(6); // 2-byte header + 4-byte payload = one i32
const TAG = 9;
sfull.def(
	TAG,
	(v, b, off, max) => {
		if (4 > max) return -1;
		return 4;
	},
	() => 0,
);
check("codec fits first", sfull.push(0, TAG) === 1); // now t=6, store full
check("codec push when full rejects (max<0)", sfull.push(0, TAG) === -1);

// coverage: save() an EMPTY store writes "" (t === 0 branch)
const sempty = createStore(16);
sempty.save("emptykey");
check('empty store saves ""', globalThis.localStorage.getItem("emptykey") === "");

// A4: get() on an unregistered custom tag (e.g. corrupt localStorage bytes)
// throws a CLEAR error, not a raw TypeError from indexing a null codec table.
mem.set("badtag", String.fromCharCode(8, 0)); // one record: tag 8 (custom range), len 0
const badTag = createStore(64);
badTag.load("badtag");
let tagErr = "";
try {
	badTag.get(0);
} catch (e) {
	tagErr = e.message;
}
check(
	"get() on unregistered custom tag throws clear error",
	tagErr === "store: no codec for tag 8",
);

// same, but with a codec table that EXISTS yet lacks this tag (c truthy branch)
const badTag2 = createStore(64);
badTag2.def(
	9,
	() => 0,
	() => 0,
); // registers tag 9, not 8
badTag2.load("badtag"); // record tag is 8
let tagErr2 = "";
try {
	badTag2.get(0);
} catch (e) {
	tagErr2 = e.message;
}
check(
	"get() with codec table but missing tag throws clear error",
	tagErr2 === "store: no codec for tag 8",
);

done();
