// Reactive core — Solid-style signals, ownership, and the React-flavored
// hooks layer in ONE module. Logically these are three units (signals,
// owner, hooks); they share a file because every XS module costs RAM and
// the firmware-fixed 32KB arena is tight enough that two extra module
// records were the difference between the combined demo booting or dying
// with "fxAbort memory full" (measured on SDK 4.17 / gabbro).
// XS-safe: closures, arrays, accessors only. No Proxy/Reflect/WeakMap.
//
// WARNING (measured, README gotcha 13): the firmware's alias budget has
// almost zero headroom. Adding top-level `function`/`class` declarations
// to any preloaded module — even never-called ones — kills the app at
// startup. New module-level helpers must be `const` bindings, and every
// export costs runtime RAM: make it earn its keep.

// Optional host/app diagnostic hook: notify() routes reaction errors here so a
// throwing effect can't abort the XS machine. Declared on globalThis (erases).
declare global {
	// eslint-disable-next-line no-var
	var __spError: ((e: unknown) => void) | undefined;
}

// A reaction is a plain thunk; an effect id indexes into the graph below.
type EffectFn = () => void;

// The one lazily-created state record (see the block comment below). Typed as
// an interface so every `G.xxx` access is checked; the runtime keeps it as a
// plain object literal (no class — a class would add a top-level declaration to
// this preloaded module, gotcha 13).
interface Graph {
	eff: (EffectFn | null)[]; // effect id -> reaction (null = disposed)
	cln: (EffectFn | null)[] | null; // effect id -> useEffect cleanup
	val: unknown[]; // packed signal id -> value
	sub: Uint32Array; // subscription matrix, st words per signal row
	cap: number; // rows allocated
	st: number; // stride: words per row (= 1 + hi-word count)
	n: number; // rows used
	u: number; // word 0 of the live effect-id set
	q: number; // word 0 of the quarantined effect-id set
	uh: Uint32Array | null; // live-set hi-words (ids 32+)
	qh: Uint32Array | null; // quarantine hi-words
	dep: number; // notification cascade depth
	bat: number; // batch() nesting depth
	pend: number[] | null; // rows whose notify is deferred inside a batch
}

let current = -1; // id of the running effect, -1 = none

// ---- packed effect graph (task #15 Stage 1 — measured ~2x cheaper) ----
// An effect is an INTEGER ID, not an object. Tables live in ONE lazily
// created state record (a preload-time buffer would be frozen into ROM):
//   eff[id]  reaction fn (null = disposed — doubles as the zombie guard)
//   cln[id]  optional useEffect cleanup
//   sub      Uint32Array, `st` words per SIGNAL row (32 effect bits each);
//            subscribe is one OR — and the old per-effect dependency
//            array is GONE: reverse edges are implied by the forward
//            masks, so unsubscribe is one AND-NOT pass over the rows.
//   u/q      word 0 of the used / quarantined effect-id sets (effects
//            0-31, the fast path); uh/qh hold words 1..st-1 and stay null
//            until a 33rd live effect forces the stride to grow (#21).
//   st       stride: words per signal row AND (1 + uh.length). Starts at 1
//            (single-word core, zero overhead); grows lazily so apps with
//            <=32 effects pay nothing.
// Freed ids are QUARANTINED while a notification cascade is running
// (dep > 0): a set() snapshots masks by value, so without quarantine a
// stale bit could run a freshly reused id.
let G: Graph | null = null;

const gi = (): Graph => {
	let g = G;
	if (g === null)
		// lazy: a preload-time table would be frozen in ROM
		G = g = {
			eff: [],
			cln: null,
			val: [],
			sub: new Uint32Array(8),
			cap: 8,
			st: 1,
			n: 0,
			u: 0,
			q: 0,
			uh: null,
			qh: null,
			dep: 0,
			bat: 0,
			pend: null,
		};
	return g;
};

const grow = (g: Graph): number => {
	// allocate one subscription row (st words wide)
	const i = g.n++;
	if (i >= g.cap) {
		// rows packed contiguously — a flat copy preserves layout
		const nc = g.cap << 1;
		const s2 = new Uint32Array(nc * g.st);
		s2.set(g.sub);
		g.sub = s2;
		g.cap = nc;
	}
	return i;
};

// Widen the stride by one word: every signal row gains a word and the
// used/quarantine hi-word arrays extend. O(rows) copy, run only when the
// live-effect count crosses a 32-bit boundary (32, 64, ...), so amortized
// to nothing. Preserves each row's existing words in place.
const growStride = (g: Graph): void => {
	const os = g.st,
		ns = os + 1;
	const nsub = new Uint32Array(g.cap * ns);
	for (let r = 0; r < g.n; r++) for (let w = 0; w < os; w++) nsub[r * ns + w] = g.sub[r * os + w];
	g.sub = nsub;
	if (g.uh === null) {
		g.uh = new Uint32Array(1);
		g.qh = new Uint32Array(1);
	} else {
		const u2 = new Uint32Array(ns - 1);
		u2.set(g.uh);
		g.uh = u2;
		const q2 = new Uint32Array(ns - 1);
		q2.set(g.qh!); // uh non-null (this branch) implies qh non-null (invariant)
		g.qh = q2;
	}
	g.st = ns;
};

const relQ = (g: Graph): void => {
	// cascade over: release quarantined ids
	if (g.dep > 0) return;
	g.u &= ~g.q;
	g.q = 0;
	const uh = g.uh;
	if (uh !== null)
		// uh non-null implies qh non-null (invariant); `!` erases, emit unchanged
		for (let k = 0; k < uh.length; k++) {
			uh[k] &= ~g.qh![k];
			g.qh![k] = 0;
		}
};

const flush = (g: Graph, i: number): void => {
	// notify every subscriber of signal row i
	if (g.bat > 0) {
		// inside batch(): defer, dedupe rows, notify once
		const p = g.pend || (g.pend = []);
		if (p.indexOf(i) < 0)
			// linear: batched rows are few (no Set — XS rule)
			p.push(i);
		return;
	}
	g.dep++;
	try {
		const st = g.st,
			base = i * st,
			sub = g.sub;
		for (let wi = 0; wi < st; wi++) {
			// one iteration when st === 1
			let w = sub[base + wi]; // snapshot this word by value
			const off = wi << 5;
			while (w) {
				const b = w & -w;
				w &= w - 1;
				notify(off + 31 - Math.clz32(b));
			}
		}
	} finally {
		g.dep--;
		relQ(g);
	}
};

// Signals keep the object API (`.value`) — Stage 1 packs only the graph.
// `i` is the signal's row in G.sub, allocated LAZILY on first subscribe:
// never-watched signals own no row at all.
class Signal {
	v: unknown;
	i: number;
	constructor(value: unknown) {
		this.v = value;
		this.i = -1;
	}
	get value(): unknown {
		// eff[current] check: an effect disposed WHILE RUNNING (its subtree
		// torn down by an outer effect it triggered) must not re-subscribe
		// as a permanent zombie.
		if (current >= 0 && G!.eff[current]) {
			const g = G!;
			let i = this.i;
			if (i < 0) i = this.i = grow(g);
			g.sub[i * g.st + (current >> 5)] |= 1 << (current & 31);
		}
		return this.v;
	}
	set value(value: unknown) {
		if (value === this.v) return;
		this.v = value;
		const i = this.i;
		if (i < 0)
			// never subscribed
			return;
		flush(G!, i); // flush snapshots each subscriber word by value (see above)
	}
}

// diagnostic hook: surface subscriber exceptions instead of letting them
// abort the machine (XS kills the app otherwise)
function notify(e: number): void {
	try {
		run(e);
	} catch (err) {
		if (globalThis.__spError) globalThis.__spError(err);
		else throw err;
	}
}

const run = (e: number): void => {
	const fn = G!.eff[e];
	if (!fn)
		// disposed mid-notification — do not resurrect
		return;
	unsubscribe(e);
	const prev = current;
	current = e;
	try {
		fn();
	} finally {
		current = prev;
	}
};

// Runs the user cleanup (if any) and drops every subscription of effect e
// in ONE masked pass over the signal rows (CPU for RAM: rows are few and
// the pass allocates nothing). Called both before every re-run and on
// disposal, giving useEffect the React contract: cleanup fires before the
// next run and once more at dispose.
function unsubscribe(e: number): void {
	const g = G!;
	const c = g.cln !== null && g.cln[e];
	if (c) {
		g.cln![e] = null;
		c();
	}
	// effect e lives in word (e>>5) of every row; clear just that word.
	const sub = g.sub,
		st = g.st,
		word = e >> 5,
		m = ~(1 << (e & 31)),
		rows = g.n;
	for (let s = 0; s < rows; s++) sub[s * st + word] &= m;
}

export function signal(value: unknown): Signal {
	return new Signal(value);
}

// ---- packed signals — the Stage 2 lowering target -------------------------
// A packed signal is an INTEGER: the id doubles as its subscription row and
// indexes G.val (ONE slot per value instead of a ~4-slot Signal object).
// build.sh lowers `const [x, setX] = useState(v)` to this API at compile
// time (tools/lower.py): x() -> S.get(x), setX(e) -> S.set(x, e). Authoring
// DX is unchanged and the per-state getter/setter closures never exist at
// runtime. set() keeps useState's functional-update contract.
export const S = {
	sig(v: unknown): number {
		const g = gi();
		const i = grow(g);
		g.val[i] = v;
		return i;
	},
	get(i: number): unknown {
		if (current >= 0 && G!.eff[current]) G!.sub[i * G!.st + (current >> 5)] |= 1 << (current & 31);
		return G!.val[i];
	},
	set(i: number, v: unknown): void {
		const g = G!;
		if (typeof v === "function") v = (v as (prev: unknown) => unknown)(g.val[i]);
		if (v === g.val[i]) return;
		g.val[i] = v;
		flush(g, i);
	},
	// RAW write — no functional-update unwrap. The Stage-3 target for direct
	// `s.value = e`: the object API stores a function value verbatim, so the
	// lowered form must too (S.set would CALL it as an updater — measured
	// semantic drift, not a theoretical one).
	put(i: number, v: unknown): void {
		const g = G!;
		if (v === g.val[i]) return;
		g.val[i] = v;
		flush(g, i);
	},
	// Packed computed: one value slot + one effect that recomputes into it.
	// Reads (S.get) track the slot; when fn's deps change the effect re-runs
	// and S.set re-notifies the computed's own subscribers. Registered with
	// the current owner so disposing its subtree stops it. The Signal object
	// never exists — same read path as a packed signal, writes are caller
	// error (the lowering bails on any `.value =` to a computed).
	computed(fn: () => unknown): number {
		const g = gi();
		const i = grow(g);
		track(
			effect(() => {
				S.set(i, fn());
			}),
		);
		return i;
	},
};

// Returns the effect ID (an integer — costs ZERO slots), not an object or
// a disposer closure. Dispose with dispose(id) (or register with track(),
// whose owner terminates closures and ids alike).
export function effect(fn: EffectFn): number {
	const g = gi();
	let e!: number; // every branch below assigns it before use (definite-assign)
	const m0 = ~(g.u | g.q); // word 0 — the fast path (effects 0-31)
	if (m0) {
		const b = m0 & -m0;
		e = 31 - Math.clz32(b);
		g.u |= b;
	} else {
		// word 0 full: scan hi-words, else widen the stride by one word
		let wi = 1;
		for (; wi < g.st; wi++) {
			const mh = ~(g.uh![wi - 1] | g.qh![wi - 1]);
			if (mh) {
				const b = mh & -mh;
				e = (wi << 5) + 31 - Math.clz32(b);
				g.uh![wi - 1] |= b;
				break;
			}
		}
		if (wi === g.st) {
			// all words full — grow, take bit 0 of the new word
			growStride(g);
			g.uh![wi - 1] |= 1;
			e = wi << 5;
		}
	}
	g.eff[e] = fn;
	run(e);
	return e;
}

// Terminal disposal for anything an owner can hold: a plain closure (root
// disposers, onCleanup callbacks) or a packed effect id.
export function dispose(d: number | EffectFn): void {
	if (typeof d === "function") {
		d();
		return;
	}
	const g = G;
	if (!g || !g.eff[d]) return;
	g.eff[d] = null; // run() becomes a no-op — no resurrection
	unsubscribe(d);
	const word = d >> 5,
		b = 1 << (d & 31);
	if (g.dep > 0) {
		// freed mid-cascade: quarantine until it completes
		if (word === 0) g.q |= b;
		else g.qh![word - 1] |= b;
	} else {
		if (word === 0) g.u &= ~b;
		else g.uh![word - 1] &= ~b;
	}
}

// Eager computed. The internal effect is registered with the current owner
// so disposing the subtree that created the computed also stops it —
// otherwise it would keep firing (and leaking) after its UI is gone.
export function computed(fn: () => unknown): Signal {
	const s = new Signal(undefined);
	track(
		effect(() => {
			s.value = fn();
		}),
	);
	return s; // its .value getter tracks; writing .value is caller error
}

// Batch writes: N sets inside fn produce ONE notification pass per touched
// signal, after fn returns — subscribers see final values only. On the 32KB
// arena this is the cheap way to update several signals from one button press
// without re-running shared effects N times. Nests; exception-safe (the
// deferred flushes still run). Values are written eagerly (reads inside the
// batch see the new value); only NOTIFICATION is deferred — Solid's contract.
export function batch<T>(fn: () => T): T {
	const g = gi();
	g.bat++;
	try {
		return fn();
	} finally {
		if (--g.bat === 0 && g.pend !== null) {
			const rows = g.pend;
			g.pend = null; // re-entrant set()s during notify flush directly
			// Coalesce at the EFFECT level (Solid semantics): union the
			// subscriber masks of every touched row, so an effect watching
			// several batched signals runs ONCE, not once per signal.
			const st = g.st,
				sub = g.sub;
			g.dep++;
			try {
				for (let wi = 0; wi < st; wi++) {
					let acc = 0;
					for (let k = 0; k < rows.length; k++) acc |= sub[rows[k] * st + wi];
					const off = wi << 5;
					while (acc) {
						const b = acc & -acc;
						acc &= acc - 1;
						notify(off + 31 - Math.clz32(b));
					}
				}
			} finally {
				g.dep--;
				relQ(g);
			}
		}
	}
}

// Read a value without creating a dependency.
export function untrack<T>(fn: () => T): T {
	const prev = current;
	current = -1;
	try {
		return fn();
	} finally {
		current = prev;
	}
}

// ---- ownership & disposal ----------------------------------------------
// Every effect created while building a subtree is registered on the
// current owner; disposing the owner disposes the subtree. Leaked effects
// are the #1 correctness risk in this design.

// An owner holds the disposables (effect ids or closures) created in its subtree.
type Disposable = number | EffectFn;
interface Owner {
	d: Disposable[];
}
let owner: Owner | null = null;

export function createRoot<T>(fn: () => T): [T, () => void] {
	const o: Owner = { d: [] };
	const prev = owner;
	owner = o;
	try {
		return [
			fn(),
			() => {
				for (let i = o.d.length - 1; i >= 0; i--) dispose(o.d[i]);
				o.d.length = 0;
			},
		];
	} finally {
		owner = prev;
	}
}

export function onCleanup(fn: EffectFn): void {
	if (owner) owner.d.push(fn);
}

// Register a disposable (Effect instance or closure) with the current
// owner so tearing down the subtree tears it down too.
export function track(disposable: Disposable): Disposable {
	if (owner) owner.d.push(disposable);
	return disposable;
}

// ---- hooks — React-flavored comfort layer --------------------------------
// Differences from React (see README): components run once; read state by
// CALLING the getter (count()); pass reactive props as thunks.

export function useState<T>(init: T): [() => T, (v: T | ((prev: T) => T)) => void] {
	const s = new Signal(init);
	return [
		() => s.value as T,
		(v: T | ((prev: T) => T)) => {
			s.value = typeof v === "function" ? (v as (prev: T) => T)(s.value as T) : v;
		},
	];
}

// No dependency array — tracking is automatic. An optional returned
// function becomes the cleanup: it runs before every re-run of the effect
// and once more when the owning subtree is disposed (stored on the Effect
// itself — registering with the owner would only capture the FIRST run's
// cleanup, since re-runs happen outside any owner context).
export function useEffect(fn: () => void | EffectFn): void {
	track(
		effect(() => {
			const out = fn();
			if (typeof out === "function") {
				if (G!.cln === null) G!.cln = [];
				G!.cln![current] = out;
			}
		}),
	);
}

// PERF: like computed(), this allocates ONE internal effect to keep the
// derived value live. Cheap (effect ids are integers, and the cap is now
// unlimited — #21), but a screen with dozens of useMemo/computed pays one
// effect each; prefer a plain thunk `() => a() + b()` when you don't need the
// value cached across reads.
export function useMemo<T>(fn: () => T): () => T {
	const c = computed(fn);
	return () => c.value as T;
}

// Mutable box that never notifies — React's useRef. (useCallback is
// deliberately absent: components run ONCE here, so a plain closure is
// already stable; there is nothing to memoize against.)
export function useRef<T>(v: T): { current: T } {
	return { current: v };
}

// React's useReducer, trivially over useState. `dispatch(action)` applies the
// reducer as a functional update, so it composes with batching and lowering.
export function useReducer<S, A>(
	reducer: (s: S, a: A) => S,
	init: S,
): [() => S, (action: A) => void] {
	const [get, set] = useState(init);
	return [get, (action: A) => set((s: S) => reducer(s, action))];
}

// onMount(fn): run fn ONCE, untracked. In this run-once model a component body
// already executes a single time as it builds, so this is just "do it once,
// without subscribing" — the place to start a timer or kick a fetch. (There is
// no separate post-layout phase like the DOM's; fn runs during the build.)
export function onMount(fn: () => void): void {
	untrack(fn);
}

// Context — pass a value down the (synchronous, run-once) build without
// threading props. createContext(default) -> ctx; provide(ctx, value, build)
// sets ctx for the duration of build() (children read it via useContext);
// useContext(ctx) reads the current value. No Symbol/Map (XS rule): a context
// is a one-field record and provide() is a save/restore around the subtree,
// which is exactly right because children build synchronously inside build().
export function createContext<T>(defaultValue: T): { v: T } {
	return { v: defaultValue };
}
export function useContext<T>(ctx: { v: T }): T {
	return ctx.v;
}
export function provide<T, R>(ctx: { v: T }, value: T, build: () => R): R {
	const prev = ctx.v;
	ctx.v = value;
	try {
		return build();
	} finally {
		ctx.v = prev;
	}
}

// ---- typed byte-record store ---------------------------------------------
// Collections kept as plain JS objects cost ~450B of slots per row and kill
// the arena at 4-5 rows (measured; README). A Store keeps records as BYTES
// in one Uint8Array — [tag][len][payload] — so a record costs its payload
// bytes, not slots. Primitives encode automatically (int32, float64, string
// of ≤255 Latin-1 bytes, boolean, null); custom types register a codec with
// def() and pass their tag to push(). Value semantics: data moves in and
// out BY COPY — this is a serialization store, not an object heap (no live
// references, functions, or Piu nodes).
// Platform rules honored: every binding below is a `const` (gotcha 13 —
// new function/class declarations in a preloaded module kill the machine),
// fields are constructor-initialized (gotcha 10), and the float scratch is
// allocated LAZILY at runtime — a buffer created at preload time would be
// frozen into ROM and unwritable.

const T_I32 = 0,
	T_F64 = 1,
	T_STR = 2,
	T_TRUE = 3,
	T_FALSE = 4,
	T_NULL = 5;

// Custom codec: encode writes the payload (returns its byte length, or -1 if it
// needs more than `max`); decode reads it back.
type Encode = (value: unknown, bytes: Uint8Array, offset: number, max: number) => number;
type Decode = (bytes: Uint8Array, offset: number, length: number) => unknown;

const Store = class {
	b: Uint8Array;
	t: number;
	n: number;
	c: Record<number, [Encode, Decode]> | null;
	f: Float64Array | null;
	fb: Uint8Array | null;
	constructor(size: number) {
		this.b = new Uint8Array(size);
		this.t = 0; // bytes used (records are always compact)
		this.n = 0; // record count
		this.c = null; // custom codecs: tag -> [encode, decode]
		this.f = null; // lazy float64 scratch
		this.fb = null; // byte view over this.f
	}
	count(): number {
		return this.n;
	}
	// Register a custom codec under tag 8..255. encode(value, bytes, offset,
	// max) writes the payload and returns its length, or -1 if it needs more
	// than max; decode(bytes, offset, length) returns the value.
	def(tag: number, encode: Encode, decode: Decode): void {
		if (this.c === null) this.c = {};
		this.c[tag] = [encode, decode];
	}
	// Append a value; pass `tag` only for custom types. Returns the new
	// count, or -1 when the value does not fit (store full or payload >255B).
	push(v: unknown, tag?: number): number {
		const b = this.b,
			off = this.t + 2;
		const max = b.length - off; // may be negative when nearly full
		let len!: number;
		if (tag !== undefined) {
			const codec = this.c && this.c[tag];
			if (!codec)
				// def(tag,...) never registered — fail with a clear signal
				throw new Error("store: no codec for tag " + tag);
			len = codec[0](v, b, off, max < 0 ? 0 : max);
		} else if (typeof v === "number") {
			if (Number.isInteger(v) && v >= -0x80000000 && v <= 0x7fffffff) {
				tag = T_I32;
				len = 4;
				if (len <= max) {
					b[off] = v & 255;
					b[off + 1] = (v >> 8) & 255;
					b[off + 2] = (v >> 16) & 255;
					b[off + 3] = (v >> 24) & 255;
				}
			} else {
				tag = T_F64;
				len = 8;
				if (len <= max) {
					this.fl();
					this.f![0] = v;
					for (let i = 0; i < 8; i++) b[off + i] = this.fb![i];
				}
			}
		} else if (typeof v === "string") {
			tag = T_STR;
			len = v.length;
			if (len <= max && len <= 255)
				for (let i = 0; i < len; i++) b[off + i] = v.charCodeAt(i) & 255;
		} else if (v === true) {
			tag = T_TRUE;
			len = 0;
		} else if (v === false) {
			tag = T_FALSE;
			len = 0;
		} else if (v === null || v === undefined) {
			tag = T_NULL;
			len = 0;
		} else return -1; // objects need a registered codec + explicit tag
		if (len < 0 || len > 255 || len > max) return -1;
		b[this.t] = tag;
		b[this.t + 1] = len;
		this.t += 2 + len;
		return ++this.n;
	}
	get(i: number): unknown {
		const p = this.o(i);
		if (p < 0) return undefined;
		const b = this.b,
			tag = b[p],
			len = b[p + 1],
			off = p + 2;
		switch (tag) {
			case T_I32:
				return b[off] | (b[off + 1] << 8) | (b[off + 2] << 16) | (b[off + 3] << 24) | 0;
			case T_F64:
				this.fl();
				for (let j = 0; j < 8; j++) this.fb![j] = b[off + j];
				return this.f![0];
			case T_STR:
				// apply over a subarray view: 1 allocation instead of one
				// intermediate string per character
				return len
					? String.fromCharCode.apply(String, b.subarray(off, off + len) as unknown as number[])
					: "";
			case T_TRUE:
				return true;
			case T_FALSE:
				return false;
			case T_NULL:
				return null;
			default:
				return this.c![tag][1](b, off, len);
		}
	}
	// Remove record i (shifts the tail down); returns the new count or -1.
	remove(i: number): number {
		const p = this.o(i);
		if (p < 0) return -1;
		const b = this.b,
			rec = 2 + b[p + 1],
			end = this.t - rec;
		for (let j = p; j < end; j++) b[j] = b[j + rec];
		this.t = end;
		return --this.n;
	}
	// byte offset of record i, or -1
	o(i: number): number {
		if (i < 0 || i >= this.n) return -1;
		let p = 0;
		while (i--) p += 2 + this.b[p + 1];
		return p;
	}
	// Persist the raw record bytes under a key in the host's localStorage
	// (device key-value store). One byte becomes one Latin-1 char; load()
	// walks the records to rebuild the count and rejects corrupt data.
	save(k: string): void {
		const b = this.b,
			t = this.t;
		// Keep the exact original `globalThis.localStorage` access (byte-identical
		// emit). globalThis's type lacks localStorage; the cast (via the vendored
		// bare-global's type) is erased — no behavior change.
		(globalThis as typeof globalThis & { localStorage: typeof localStorage }).localStorage.setItem(
			k,
			t ? String.fromCharCode.apply(String, b.subarray(0, t) as unknown as number[]) : "",
		);
	}
	load(k: string): boolean {
		const s = (
			globalThis as typeof globalThis & { localStorage: typeof localStorage }
		).localStorage.getItem(k);
		if (s === null || s.length > this.b.length) return false;
		const b = this.b;
		for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
		let n = 0,
			p = 0;
		while (p < s.length) {
			p += 2 + b[p + 1];
			n++;
		}
		if (p !== s.length)
			// truncated/corrupt record stream
			return false;
		this.t = s.length;
		this.n = n;
		return true;
	}
	// lazy float scratch
	fl(): void {
		if (this.f === null) {
			this.f = new Float64Array(1);
			this.fb = new Uint8Array(this.f.buffer);
		}
	}
};

export const createStore = (size: number) => new Store(size);
