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

let current = -1;	// id of the running effect, -1 = none

// ---- packed effect graph (task #15 Stage 1 — measured ~2x cheaper) ----
// An effect is an INTEGER ID, not an object. Tables live in ONE lazily
// created state record (a preload-time buffer would be frozen into ROM):
//   eff[id]  reaction fn (null = disposed — doubles as the zombie guard)
//   cln[id]  optional useEffect cleanup
//   sub      Uint32Array, 2 words per SIGNAL row = 64 effect bits;
//            subscribe is one OR — and the old per-effect dependency
//            array is GONE: reverse edges are implied by the forward
//            masks, so unsubscribe is one AND-NOT pass over the rows.
// Freed ids are QUARANTINED while a notification cascade is running
// (dep > 0): a set() snapshots masks by value, so without quarantine a
// stale bit could run a freshly reused id.
let G = null;

// Signals keep the object API (`.value`) — Stage 1 packs only the graph.
// `i` is the signal's row in G.sub, allocated LAZILY on first subscribe:
// never-watched signals own no row at all.
class Signal {
	constructor(value) {
		this.v = value;
		this.i = -1;
	}
	get value() {
		// eff[current] check: an effect disposed WHILE RUNNING (its subtree
		// torn down by an outer effect it triggered) must not re-subscribe
		// as a permanent zombie.
		if (current >= 0 && G.eff[current]) {
			const g = G;
			let i = this.i;
			if (i < 0) {
				i = this.i = g.n++;
				if (i >= g.sub.length) {
					const s2 = new Uint32Array(g.sub.length << 1);
					s2.set(g.sub);
					g.sub = s2;
				}
			}
			g.sub[i] |= 1 << current;
		}
		return this.v;
	}
	set value(value) {
		if (value === this.v)
			return;
		this.v = value;
		const i = this.i;
		if (i < 0)		// never subscribed
			return;
		const g = G;
		// snapshot BY VALUE: subscriber mutation during notification cannot
		// touch it, and quarantine makes stale bits harmless (see above)
		let w = g.sub[i];
		if (!w)
			return;
		g.dep++;
		try {
			while (w) {
				const b = w & -w;
				w &= w - 1;
				notify(31 - Math.clz32(b));
			}
		} finally {
			if (--g.dep === 0) {	// cascade over: release quarantined ids
				g.u &= ~g.q;
				g.q = 0;
			}
		}
	}
}

// diagnostic hook: surface subscriber exceptions instead of letting them
// abort the machine (XS kills the app otherwise)
function notify(e) {
	try {
		run(e);
	} catch (err) {
		if (globalThis.__spError)
			globalThis.__spError(err);
		else
			throw err;
	}
}

const run = (e) => {
	const fn = G.eff[e];
	if (!fn)		// disposed mid-notification — do not resurrect
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
function unsubscribe(e) {
	const g = G;
	const c = g.cln !== null && g.cln[e];
	if (c) {
		g.cln[e] = null;
		c();
	}
	const sub = g.sub, m = ~(1 << e), rows = g.n;
	for (let s = 0; s < rows; s++)
		sub[s] &= m;
}

export function signal(value) {
	return new Signal(value);
}

// Returns the effect ID (an integer — costs ZERO slots), not an object or
// a disposer closure. Dispose with dispose(id) (or register with track(),
// whose owner terminates closures and ids alike).
export function effect(fn) {
	let g = G;
	if (g === null)		// lazy: a preload-time table would be frozen in ROM
		G = g = { eff: [], cln: null, sub: new Uint32Array(8), n: 0, u: 0, q: 0, dep: 0 };
	const m = ~(g.u | g.q);
	if (!m)
		throw new Error("fx:max");	// 32 live effects (one mask word)
	const b = m & -m;
	const e = 31 - Math.clz32(b);
	g.u |= b;
	g.eff[e] = fn;
	run(e);
	return e;
}

// Terminal disposal for anything an owner can hold: a plain closure (root
// disposers, onCleanup callbacks) or a packed effect id.
export function dispose(d) {
	if (typeof d === "function") {
		d();
		return;
	}
	const g = G;
	if (!g || !g.eff[d])
		return;
	g.eff[d] = null;	// run() becomes a no-op — no resurrection
	unsubscribe(d);
	const b = 1 << d;
	if (g.dep > 0)		// freed mid-cascade: quarantine until it completes
		g.q |= b;
	else
		g.u &= ~b;
}

// Eager computed. The internal effect is registered with the current owner
// so disposing the subtree that created the computed also stops it —
// otherwise it would keep firing (and leaking) after its UI is gone.
export function computed(fn) {
	const s = new Signal(undefined);
	track(effect(() => { s.value = fn(); }));
	return s;	// its .value getter tracks; writing .value is caller error
}

// Read a value without creating a dependency.
export function untrack(fn) {
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

let owner = null;

export function createRoot(fn) {
	const o = { d: [] };
	const prev = owner;
	owner = o;
	try {
		return [fn(), () => {
			for (let i = o.d.length - 1; i >= 0; i--)
				dispose(o.d[i]);
			o.d.length = 0;
		}];
	} finally {
		owner = prev;
	}
}


export function onCleanup(fn) {
	if (owner)
		owner.d.push(fn);
}

// Register a disposable (Effect instance or closure) with the current
// owner so tearing down the subtree tears it down too.
export function track(disposable) {
	if (owner)
		owner.d.push(disposable);
	return disposable;
}

// ---- hooks — React-flavored comfort layer --------------------------------
// Differences from React (see README): components run once; read state by
// CALLING the getter (count()); pass reactive props as thunks.

export function useState(init) {
	const s = new Signal(init);
	return [
		() => s.value,
		v => { s.value = (typeof v === "function") ? v(s.value) : v; },
	];
}

// No dependency array — tracking is automatic. An optional returned
// function becomes the cleanup: it runs before every re-run of the effect
// and once more when the owning subtree is disposed (stored on the Effect
// itself — registering with the owner would only capture the FIRST run's
// cleanup, since re-runs happen outside any owner context).
export function useEffect(fn) {
	track(effect(() => {
		const out = fn();
		if (typeof out === "function") {
			if (G.cln === null)
				G.cln = [];
			G.cln[current] = out;
		}
	}));
}

export function useMemo(fn) {
	const c = computed(fn);
	return () => c.value;
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

const T_I32 = 0, T_F64 = 1, T_STR = 2, T_TRUE = 3, T_FALSE = 4, T_NULL = 5;

const Store = class {
	constructor(size) {
		this.b = new Uint8Array(size);
		this.t = 0;		// bytes used (records are always compact)
		this.n = 0;		// record count
		this.c = null;		// custom codecs: tag -> [encode, decode]
		this.f = null;		// lazy float64 scratch
		this.fb = null;		// byte view over this.f
	}
	count() {
		return this.n;
	}
	// Register a custom codec under tag 8..255. encode(value, bytes, offset,
	// max) writes the payload and returns its length, or -1 if it needs more
	// than max; decode(bytes, offset, length) returns the value.
	def(tag, encode, decode) {
		if (this.c === null)
			this.c = {};
		this.c[tag] = [encode, decode];
	}
	// Append a value; pass `tag` only for custom types. Returns the new
	// count, or -1 when the value does not fit (store full or payload >255B).
	push(v, tag) {
		const b = this.b, off = this.t + 2;
		const max = b.length - off;	// may be negative when nearly full
		let len;
		if (tag !== undefined)
			len = this.c[tag][0](v, b, off, max < 0 ? 0 : max);
		else if (typeof v === "number") {
			if (Number.isInteger(v) && v >= -0x80000000 && v <= 0x7fffffff) {
				tag = T_I32; len = 4;
				if (len <= max) {
					b[off] = v & 255; b[off + 1] = (v >> 8) & 255;
					b[off + 2] = (v >> 16) & 255; b[off + 3] = (v >> 24) & 255;
				}
			}
			else {
				tag = T_F64; len = 8;
				if (len <= max) {
					this.fl();
					this.f[0] = v;
					for (let i = 0; i < 8; i++)
						b[off + i] = this.fb[i];
				}
			}
		}
		else if (typeof v === "string") {
			tag = T_STR; len = v.length;
			if (len <= max && len <= 255)
				for (let i = 0; i < len; i++)
					b[off + i] = v.charCodeAt(i) & 255;
		}
		else if (v === true) { tag = T_TRUE; len = 0; }
		else if (v === false) { tag = T_FALSE; len = 0; }
		else if (v === null || v === undefined) { tag = T_NULL; len = 0; }
		else
			return -1;	// objects need a registered codec + explicit tag
		if (len < 0 || len > 255 || len > max)
			return -1;
		b[this.t] = tag;
		b[this.t + 1] = len;
		this.t += 2 + len;
		return ++this.n;
	}
	get(i) {
		const p = this.o(i);
		if (p < 0)
			return undefined;
		const b = this.b, tag = b[p], len = b[p + 1], off = p + 2;
		switch (tag) {
			case T_I32:
				return (b[off] | (b[off + 1] << 8) | (b[off + 2] << 16) | (b[off + 3] << 24)) | 0;
			case T_F64:
				this.fl();
				for (let j = 0; j < 8; j++)
					this.fb[j] = b[off + j];
				return this.f[0];
			case T_STR:
				// apply over a subarray view: 1 allocation instead of one
				// intermediate string per character
				return len ? String.fromCharCode.apply(String, b.subarray(off, off + len)) : "";
			case T_TRUE: return true;
			case T_FALSE: return false;
			case T_NULL: return null;
			default:
				return this.c[tag][1](b, off, len);
		}
	}
	// Remove record i (shifts the tail down); returns the new count or -1.
	remove(i) {
		const p = this.o(i);
		if (p < 0)
			return -1;
		const b = this.b, rec = 2 + b[p + 1], end = this.t - rec;
		for (let j = p; j < end; j++)
			b[j] = b[j + rec];
		this.t = end;
		return --this.n;
	}
	// byte offset of record i, or -1
	o(i) {
		if (i < 0 || i >= this.n)
			return -1;
		let p = 0;
		while (i--)
			p += 2 + this.b[p + 1];
		return p;
	}
	// Persist the raw record bytes under a key in the host's localStorage
	// (device key-value store). One byte becomes one Latin-1 char; load()
	// walks the records to rebuild the count and rejects corrupt data.
	save(k) {
		const b = this.b, t = this.t;
		globalThis.localStorage.setItem(k,
			t ? String.fromCharCode.apply(String, b.subarray(0, t)) : "");
	}
	load(k) {
		const s = globalThis.localStorage.getItem(k);
		if (s === null || s.length > this.b.length)
			return false;
		const b = this.b;
		for (let i = 0; i < s.length; i++)
			b[i] = s.charCodeAt(i) & 255;
		let n = 0, p = 0;
		while (p < s.length) {
			p += 2 + b[p + 1];
			n++;
		}
		if (p !== s.length)	// truncated/corrupt record stream
			return false;
		this.t = s.length;
		this.n = n;
		return true;
	}
	// lazy float scratch
	fl() {
		if (this.f === null) {
			this.f = new Float64Array(1);
			this.fb = new Uint8Array(this.f.buffer);
		}
	}
};

export const createStore = size => new Store(size);

