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

