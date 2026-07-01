// Reactive core — Solid-style signals for XS on Pebble.
// XS-safe: closures, Set, getters/setters only. No Proxy/Reflect/WeakMap.

let current = null;

export function signal(value) {
	const subs = new Set();
	return {
		get value() {
			if (current) {
				subs.add(current);
				current.deps.push(subs);
			}
			return value;
		},
		set value(v) {
			if (v === value)
				return;
			value = v;
			for (const e of [...subs])
				e.run();
		},
	};
}

export function effect(fn) {
	const e = {
		deps: [],
		run() {
			cleanup(e);
			const prev = current;
			current = e;
			try {
				fn();
			} finally {
				current = prev;
			}
		},
	};
	e.run();
	return () => cleanup(e);	// disposer
}

function cleanup(e) {
	for (const s of e.deps)
		s.delete(e);
	e.deps.length = 0;
}

export function computed(fn) {
	const s = signal(undefined);
	effect(() => { s.value = fn(); });
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
