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

let current = null;

// Subscribers are stored INLINE: `s` is null (none), the single subscribing
// Effect, or an array of Effects. The obvious `new Set()` per signal costs
// ~10 slots + a hash-table chunk, and nearly every signal here has 0-2
// subscribers — on the 32KB arena that Set was the single biggest per-signal
// expense (see README for the measured before/after row limit).
class Signal {
	constructor(value) {
		this.v = value;
		this.s = null;
	}
	get value() {
		if (current) {
			const s = this.s;
			if (s === null)
				this.s = current;
			else if (s !== current) {
				if (Array.isArray(s)) {
					if (s.indexOf(current) < 0)
						s.push(current);
				}
				else
					this.s = [s, current];
			}
			current.deps.push(this);
		}
		return this.v;
	}
	set value(value) {
		if (value === this.v)
			return;
		this.v = value;
		const s = this.s;
		if (s === null)
			return;
		// Snapshot arrays: subscribers may mutate `s` while we notify. run()
		// is a no-op for effects disposed mid-notification (fn === null) —
		// without that guard a disposed effect would resurrect itself by
		// re-subscribing during its final run. The single-subscriber path
		// (the common one) allocates nothing.
		if (Array.isArray(s)) {
			for (const e of [...s])
				notify(e);
		}
		else
			notify(s);
	}
}

// diagnostic hook: surface subscriber exceptions instead of letting them
// abort the machine (XS kills the app otherwise)
function notify(e) {
	try {
		e.run();
	} catch (err) {
		if (globalThis.__spError)
			globalThis.__spError(err);
		else
			throw err;
	}
}

class Effect {
	// Fields stay minimal — every slot is arena RAM and effects are the
	// most numerous runtime object. `fn === null` doubles as the disposed
	// flag; the optional useEffect cleanup is only materialized on the
	// instances that actually use it (current.cleanup = ...).
	constructor(fn) {
		this.fn = fn;
		this.deps = [];
		this.cleanup = null;	// optional user cleanup (useEffect)
	}
	run() {
		if (!this.fn)		// disposed mid-notification — do not resurrect
			return;
		unsubscribe(this);
		const prev = current;
		current = this;
		try {
			this.fn();
		} finally {
			current = prev;
		}
	}
}

// Runs the user cleanup (if any) and drops all subscriptions. Called both
// before every re-run and on disposal, giving useEffect the React contract:
// cleanup fires before the next run and once more at dispose.
function unsubscribe(e) {
	if (e.cleanup) {
		const c = e.cleanup;
		e.cleanup = null;
		c();
	}
	for (const sig of e.deps) {
		const s = sig.s;
		if (s === e)
			sig.s = null;
		else if (Array.isArray(s)) {
			const i = s.indexOf(e);
			if (i >= 0) {
				s.splice(i, 1);
				if (s.length === 1)	// collapse back to the inline form
					sig.s = s[0];
			}
		}
	}
	e.deps.length = 0;
}

export function signal(value) {
	return new Signal(value);
}

// Returns the Effect itself, NOT a disposer closure: a closure per effect
// costs 3-4 arena slots and effects are the most numerous runtime object.
// Dispose with dispose(e) (or register with track(), whose owner knows how
// to terminate both closures and Effect instances).
export function effect(fn) {
	const e = new Effect(fn);
	e.run();
	return e;
}

// Terminal disposal for anything an owner can hold: a plain closure (root
// disposers, onCleanup callbacks) or an Effect instance.
export function dispose(d) {
	if (typeof d === "function") {
		d();
		return;
	}
	d.fn = null;		// run() becomes a no-op — no resurrection
	unsubscribe(d);
}

// Eager computed. The internal effect is registered with the current owner
// so disposing the subtree that created the computed also stops it —
// otherwise it would keep firing (and leaking) after its UI is gone.
export function computed(fn) {
	const s = new Signal(undefined);
	track(effect(() => { s.value = fn(); }));
	return {
		get value() { return s.value; },
	};
}

// Read a value without creating a dependency.
export function untrack(fn) {
	const prev = current;
	current = null;
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
		if (typeof out === "function")
			current.cleanup = out;
	}));
}

export function useMemo(fn) {
	const c = computed(fn);
	return () => c.value;
}

export const useRef = current_ => ({ current: current_ });

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
		else { tag = T_NULL; len = 0; }
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
			case T_STR: {
				let s = "";
				for (let j = 0; j < len; j++)
					s += String.fromCharCode(b[off + j]);
				return s;
			}
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
	// lazy float scratch
	fl() {
		if (this.f === null) {
			this.f = new Float64Array(1);
			this.fb = new Uint8Array(this.f.buffer);
		}
	}
};

export const createStore = size => new Store(size);

