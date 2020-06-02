(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (global = global || self, factory(global.elt = {}));
}(this, (function (exports) { 'use strict';

    /**
     * Does a naive foreach on an IndexableArray
     * @param _arr the array
     * @param fn the function to apply
     * @internal
     */
    function EACH(_arr, fn) {
        for (var i = 0, arr = _arr.arr; i < arr.length; i++) {
            var item = arr[i];
            if (item == null)
                continue;
            fn(item);
        }
        _arr.actualize();
    }
    /**
     * An array wrapper that infects its elements with their indexes for faster deletion.
     * @internal
     */
    class IndexableArray {
        constructor() {
            this.arr = [];
            this.real_size = 0;
        }
        add(a) {
            const arr = this.arr;
            if (a.idx != null) {
                // will be put to the end
                arr[a.idx] = null;
            }
            else {
                this.real_size++;
            }
            a.idx = arr.length;
            arr.push(a);
        }
        actualize() {
            const arr = this.arr;
            if (this.real_size !== arr.length) {
                var newarr = new Array(this.real_size);
                for (var i = 0, j = 0, l = arr.length; i < l; i++) {
                    var item = arr[i];
                    if (item == null)
                        continue;
                    newarr[j] = item;
                    item.idx = j;
                    j++;
                }
                this.arr = newarr;
            }
        }
        delete(a) {
            if (a.idx != null) {
                this.arr[a.idx] = null;
                a.idx = null;
                this.real_size--;
            }
        }
        clear() {
            const a = this.arr;
            for (var i = 0; i < a.length; i++) {
                var item = a[i];
                if (item == null)
                    continue;
                item.idx = null;
            }
            this.arr = [];
            this.real_size = 0;
        }
    }

    /**
     * Make sure we have a usable observable.
     * @returns The original observable if `arg` already was one, or a new
     *   Observable holding the value of `arg` if it wasn't.
     * @category observable, toc
     */
    function o(arg) {
        return arg instanceof o.Observable ? arg : new o.Observable(arg);
    }
    (function (o_1) {
        /**
         * A constant symbol representing the fact that there is no value.
         *
         * Used in Observers and combined observables to know when a value has been set for the first time.
         */
        o_1.NoValue = Symbol('NoValue');
        function isReadonlyObservable(_) {
            return _ instanceof Observable;
        }
        o_1.isReadonlyObservable = isReadonlyObservable;
        /**
         * An `Observer` observes an [[o.Observable]]. `Observable`s maintain a list of **active**
         * observers that are observing it. Whenever their value change, all the registered
         * `Observer`s have their `refresh` method called.
         *
         * An `Observer` is built with a function that will be called when it is refreshed and
         * the value **changed** from the previous value it knew.
         *
         * This behaviour has implications for memory usage ; all `Observers` keep a reference
         * to the last value they were called with, since this is the value they will pass as
         * the `old_value` to their wrapped function.
         *
         * They behave this way because an Observer can be stopped and then started again.
         * In between, the observable they watch could have been changed several times. The `fn`
         * function they wrap may make assumptions on what value it has seen itself. Thus,
         * by keeping a reference to the last value they were called with, they can provide it
         * safely to `fn`.
         *
         * @category observable, toc
         */
        class Observer {
            /**
             * Build an observer that will call `fn` whenever the value contained by
             * `observable` changes.
             */
            constructor(fn, observable) {
                this.observable = observable;
                /**
                 * The last value they've been called with.
                 */
                this.old_value = o_1.NoValue;
                /**
                 * Used to speed up access
                 * @internal
                 */
                this.idx = null;
                this.fn = fn;
            }
            /**
             * Called by the `observable` currently being watched.
             */
            refresh() {
                const old = this.old_value;
                const new_value = this.observable._value;
                if (old !== new_value) {
                    // only store the old_value if the observer will need it. Useful to not keep
                    // useless references in memory.
                    this.old_value = new_value;
                    this.fn(new_value, old);
                }
            }
            /**
             * Register on the `observable` to be `refresh`ed whenever it changes.
             */
            startObserving() {
                this.observable.addObserver(this);
            }
            /**
             * Stop being notified by the observable.
             */
            stopObserving() {
                this.observable.removeObserver(this);
            }
            /**
             * Debounce `this.refresh` by `ms` milliseconds, optionnally calling it
             * immediately the first time around if `leading` is true.
             *
             * See [[o.debounce]].
             */
            debounce(ms, leading) {
                this.refresh = o.debounce(this.refresh.bind(this), ms, leading);
                return this;
            }
            /**
             * Throttle `this.refresh` by `ms` milliseconds, optionnally calling it
             * immediately the first time around if `leading` is true.
             *
             * See [[o.throttle]].
             */
            throttle(ms, leading) {
                this.refresh = o.throttle(this.refresh.bind(this), ms, leading);
                return this;
            }
        }
        o_1.Observer = Observer;
        /** @internal */
        function each_recursive(obs, fn) {
            var objs = [];
            var stack = [];
            var [children, i] = [obs._children.arr, 0];
            objs.push(obs);
            while (true) {
                var _child = children[i];
                if (_child) {
                    var child = _child.child;
                    var subchildren = child._children.arr;
                    objs.push(child);
                    if (subchildren.length) {
                        stack.push([children, i + 1]);
                        children = subchildren;
                        i = 0;
                        continue;
                    }
                }
                i++;
                if (i > children.length) {
                    if (stack.length === 0)
                        break;
                    [children, i] = stack.pop();
                    continue;
                }
            }
            for (var i = 0, l = objs.length; i < l; i++) {
                fn(objs[i]);
            }
        }
        o_1.each_recursive = each_recursive;
        /** @internal */
        class Queue extends IndexableArray {
            constructor() {
                super(...arguments);
                this.transaction_count = 0;
            }
            schedule(obs) {
                const was_empty = this.real_size === 0;
                each_recursive(obs, ob => {
                    this.add(ob);
                });
                if (this.transaction_count === 0 && was_empty) {
                    this.flush();
                }
            }
            unschedule(obs) {
                each_recursive(obs, ob => this.delete(ob));
            }
            transaction(fn) {
                this.transaction_count++;
                fn();
                this.transaction_count--;
                if (this.transaction_count === 0) {
                    this.flush();
                }
            }
            flush() {
                for (var i = 0, arr = this.arr; i < arr.length; i++) {
                    var obs = arr[i];
                    if (obs == null)
                        continue;
                    if (obs instanceof CombinedObservable) {
                        obs._value = obs.getter(obs._parents_values);
                    }
                    EACH(obs._children, ch => {
                        ch.child._parents_values[ch.child_idx] = ch.parent._value;
                    });
                    EACH(obs._observers, o => o.refresh());
                    obs.idx = null;
                    arr[i] = null; // just in case...
                }
                this.real_size = 0;
                // this.arr = []
                this.arr.length = 0;
                this.transaction_count = 0;
            }
        }
        o_1.Queue = Queue;
        /** @internal */
        const queue = new Queue();
        /**
         * Start an observable transaction, where the observers of all the observables being
         * set or assigned to during the callback are only called at the end.
         *
         * Use it when you know you will modify two or more observables that trigger the same transforms
         * to avoid calling the observers each time one of the observable is modified.
         *
         * ```tsx
         * @include ../examples/o.transaction.tsx
         * ```
         *
         * @category observable, toc
         */
        function transaction(fn) {
            queue.transaction(fn);
        }
        o_1.transaction = transaction;
        /** @internal */
        class ChildObservableLink {
            constructor(parent, child, child_idx) {
                this.parent = parent;
                this.child = child;
                this.child_idx = child_idx;
                this.idx = null;
            }
            refresh() {
                this.child._parents_values[this.child_idx] = this.parent._value;
            }
        }
        o_1.ChildObservableLink = ChildObservableLink;
        /**
         * The "writable" version of an Observable, counter-part to the `#o.ReadonlyObservable`.
         *
         * Comes with the `.set()` and `.assign()` methods.
         *
         * @category observable, toc
         */
        class Observable {
            /**
             * Build an observable from a value. For readability purposes, use the [[o]] function instead.
             */
            constructor(_value) {
                this._value = _value;
                /** @internal */
                this._observers = new IndexableArray();
                /** @internal */
                this._children = new IndexableArray();
                /** @internal */
                this._watched = false;
                /** The index of this Observable in the notify queue. If null, means that it's not scheduled.
                 * @internal
                */
                this.idx = null;
                // (this as any).debug = new Error
            }
            /**
             * Stop this Observable from observing other observables and stop
             * all observers currently watching this Observable.
             */
            stopObservers() {
                each_recursive(this, ob => {
                    if (ob.idx)
                        queue.delete(ob);
                    ob._observers.clear();
                    if (ob._watched) {
                        ob._watched = false;
                        ob.unwatched();
                    }
                    ob._children.clear();
                });
            }
            /**
             * Return the underlying value of this Observable
             *
             * NOTE: treat this value as being entirely readonly !
             */
            get() {
                return this._value;
            }
            /**
             * Set the value of the observable and notify the observers listening
             * to this object of this new value.
             */
            set(value) {
                const old = this._value;
                this._value = value;
                if (old !== value)
                    queue.schedule(this);
            }
            /**
             * Convenience function to set the value of this observable depending on its
             * current value.
             *
             * The result of `fn` **must** be absolutely different from the current value. Arrays
             * should be `slice`d first and objects copied, otherwise the observable will not
             * trigger its observers since to it the object didn't change. For convenience, you can
             * use [[o.clone]] or the great [immer.js](https://github.com/immerjs/immer).
             *
             * If the return value of `fn` is [[o.NoValue]] then the observable is untouched.
             */
            mutate(fn) {
                const n = fn(this._value);
                if (n !== o_1.NoValue) {
                    this.set(n);
                }
            }
            assign(partial) {
                this.set(o.assign(this.get(), partial));
            }
            /**
             * Create an observer bound to this observable, but do not start it.
             * For it to start observing, one needs to call its `startObserving()` method.
             *
             * > **Note**: This method should rarely be used. Prefer using [[$observe]], [[node_observe]], [`Mixin#observe`](#o.ObserverHolder#observe) or [`App.Service#observe`](#o.ObserverHolder#observe) for observing values.
             */
            createObserver(fn) {
                return new Observer(fn, this);
            }
            addObserver(_ob) {
                if (typeof _ob === 'function') {
                    _ob = this.createObserver(_ob);
                }
                const ob = _ob;
                this._observers.add(_ob);
                this.checkWatch();
                if (this.idx == null)
                    ob.refresh();
                return ob;
            }
            /**
             * Add a child observable to this observable that will depend on it to build its own value.
             * @internal
             */
            addChild(ch) {
                if (ch.idx != null)
                    return;
                this._children.add(ch);
                if (this.idx != null)
                    queue.add(ch.child);
                this.checkWatch();
            }
            /**
             * @internal
             */
            removeChild(ch) {
                if (ch.idx == null)
                    return;
                this._children.delete(ch);
                this.checkWatch();
            }
            /**
             * Remove an observer from this observable. This means the Observer will not
             * be called anymore when this Observable changes.
             *
             * If there are no more observers watching this Observable, then it will stop
             * watching other Observables in turn if it did.
             *
             */
            removeObserver(ob) {
                this._observers.delete(ob);
                this.checkWatch();
            }
            /**
             * Check if this `Observable` is being watched or not. If it stopped being observed but is in the notification
             * queue, remove it from there as no one is expecting its value.
             *
             * @internal
             */
            checkWatch() {
                if (this._watched && this._observers.real_size === 0 && this._children.real_size === 0) {
                    this._watched = false;
                    if (this.idx != null)
                        queue.delete(this);
                    this.unwatched();
                }
                else if (!this._watched && this._observers.real_size + this._children.real_size > 0) {
                    this._watched = true;
                    this.watched();
                }
            }
            /**
             * @internal
             */
            unwatched() { }
            /**
             * @internal
             */
            watched() { }
            tf(transform) {
                var old = o_1.NoValue;
                var old_transform = o_1.NoValue;
                var curval = o_1.NoValue;
                return combine([this, transform], ([v, fnget]) => {
                    if (old !== o_1.NoValue && old_transform !== o_1.NoValue && curval !== o_1.NoValue && old === v && old_transform === fnget)
                        return curval;
                    curval = (typeof fnget === 'function' ? fnget(v, old, curval) : fnget.transform(v, old, curval));
                    old = v;
                    old_transform = fnget;
                    return curval;
                }, (newv, old, [curr, conv]) => {
                    if (typeof conv === 'function')
                        return tuple(o_1.NoValue, o_1.NoValue);
                    var new_orig = conv.revert(newv, old, curr);
                    return tuple(new_orig, o.NoValue);
                });
            }
            /**
             * Create an observable that will hold the value of the property specified with `key`.
             * The resulting observable is completely bi-directional.
             *
             * The `key` can itself be an observable, in which case the resulting observable will
             * change whenever either `key` or the original observable change.
             *
             * ```tsx
             * @include ../examples/o.observable.p.tsx
             * ```
             */
            p(key) {
                return prop(this, key);
            }
            key(key, def, delete_on_undefined = true) {
                return combine([this, key, def, delete_on_undefined], ([map, key, def]) => {
                    var res = map.get(key);
                    if (res === undefined && def) {
                        res = def(key, map);
                    }
                    return res;
                }, (ret, _, [omap, okey, _2, delete_on_undefined]) => {
                    var result = new Map(omap); //.set(okey, ret)
                    // Is this correct ? should I **delete** when I encounter undefined ?
                    if (ret !== undefined || !delete_on_undefined)
                        result.set(okey, ret);
                    else
                        result.delete(okey);
                    return tuple(result, o_1.NoValue, o_1.NoValue, o_1.NoValue);
                });
            }
        }
        o_1.Observable = Observable;
        /**
         * An observable that does not its own value, but that depends
         * from outside getters and setters. The `#o.virtual` helper makes creating them easier.
         *
         * @internal
         */
        class CombinedObservable extends Observable {
            constructor(deps) {
                super(o_1.NoValue);
                /** @internal */
                this._links = [];
                /** @internal */
                this._parents_values = [];
                this.dependsOn(deps);
            }
            getter(values) {
                return values.slice();
            }
            setter(nval, oval, last) {
                return nval; // by default, just forward the type
            }
            watched() {
                const p = this._parents_values;
                for (var i = 0, l = this._links; i < l.length; i++) {
                    var link = l[i];
                    link.parent.addChild(link);
                    p[link.child_idx] = link.parent._value;
                }
                this._value = this.getter(p);
            }
            unwatched() {
                for (var i = 0, l = this._links; i < l.length; i++) {
                    var link = l[i];
                    link.parent.removeChild(link);
                }
            }
            refreshParentValues() {
                var changed = false;
                for (var i = 0, l = this._links, p = this._parents_values; i < l.length; i++) {
                    var link = l[i];
                    var idx = link.child_idx;
                    var old = p[idx];
                    var n = link.parent.get();
                    if (old !== n) {
                        changed = true;
                        p[idx] = n;
                    }
                }
                return changed;
            }
            get() {
                if (!this._watched) {
                    if (this.refreshParentValues() || this._value === o_1.NoValue) {
                        this._value = this.getter(this._parents_values);
                    }
                }
                return this._value;
            }
            set(value) {
                // Do not trigger the set chain if the value did not change.
                if (!this._watched)
                    this._value = this.getter(this._parents_values);
                if (value === this._value)
                    return;
                const old_value = this._value;
                if (!this._watched)
                    this.refreshParentValues();
                const res = this.setter(value, old_value, this._parents_values);
                if (res == undefined)
                    return;
                for (var i = 0, l = this._links, len = l.length; i < len; i++) {
                    var link = l[i];
                    var newval = res[link.child_idx];
                    if (newval !== o_1.NoValue && newval !== link.parent._value) {
                        link.parent.set(newval);
                    }
                }
            }
            dependsOn(obs) {
                var p = new Array(obs.length);
                var ch = [];
                for (var l = obs.length, i = 0; i < l; i++) {
                    var ob = obs[i];
                    if (ob instanceof Observable) {
                        p[i] = ob._value;
                        ch.push(new ChildObservableLink(ob, this, ch.length));
                    }
                    else {
                        p[i] = ob;
                    }
                }
                this._links = ch;
                this._parents_values = p;
                return this;
            }
        }
        o_1.CombinedObservable = CombinedObservable;
        function combine(deps, get, set) {
            var virt = new CombinedObservable(deps);
            virt.getter = get;
            virt.setter = set; // force undefined to trigger errors for readonly observables.
            return virt;
        }
        o_1.combine = combine;
        function merge(obj) {
            const keys = Object.keys(obj);
            const parents = keys.map(k => obj[k]);
            return combine(parents, args => {
                var res = {};
                for (var i = 0; i < keys.length; i++) {
                    res[keys[i]] = args[i];
                }
                return res;
            }, back => keys.map(k => back[k]));
        }
        o_1.merge = merge;
        /**
         * Create an observable that watches a `prop` from `obj`, giving returning the result
         * of `def` if the value was `undefined`.
         * @category observable, toc
         */
        function prop(obj, prop, def) {
            return combine(tuple(obj, prop, def), ([obj, prop, def]) => {
                var res = obj[prop];
                if (res === undefined && def)
                    res = def(prop, obj);
                return res;
            }, (nval, _, [orig, prop]) => {
                const newo = o.clone(orig);
                newo[prop] = nval;
                return tuple(newo, o_1.NoValue, o_1.NoValue);
            });
        }
        o_1.prop = prop;
        /**
         * Get a MaybeObservable's value
         * @returns `arg.get()` if it was an Observable or `arg` itself if it was not.
         * @category observable, toc
         */
        function get(arg) {
            return arg instanceof Observable ? arg.get() : arg;
        }
        o_1.get = get;
        /**
         * Do a transform of the provided argument and return a tranformed observable
         * only if it was itself observable.
         * This function is meant to be used when building components to avoid creating
         * Observable objects for values that were not.
         * @category observable, toc
         */
        function tf(arg, fn) {
            if (arg instanceof Observable) {
                if (typeof fn === 'function') {
                    return arg.tf(fn);
                }
                else
                    return arg.tf(fn);
            }
            else {
                if (typeof fn === 'function')
                    return fn(arg, o_1.NoValue, o_1.NoValue);
                else
                    return fn.transform(arg, o_1.NoValue, o_1.NoValue);
            }
        }
        o_1.tf = tf;
        function p(mobs, key) {
            if (mobs instanceof Observable) {
                return mobs.p(key);
            }
            else {
                return mobs[key];
            }
        }
        o_1.p = p;
        /**
         * Combine several MaybeObservables into an Observable<boolean>
         * @returns A boolean Observable that is true when all of them are true, false
         *   otherwise.
         * @category observable, toc
         */
        function and(...args) {
            return combine(args, (args) => {
                for (var i = 0, l = args.length; i < l; i++) {
                    if (!args[i])
                        return false;
                }
                return true;
            });
        }
        o_1.and = and;
        /**
         * Combine several MaybeObservables into an Observable<boolean>
         * @returns A boolean Observable that is true when any of them is true, false
         *   otherwise.
         * @category observable, toc
         */
        function or(...args) {
            return combine(args, (args) => {
                for (var i = 0, l = args.length; i < l; i++) {
                    if (args[i])
                        return true;
                }
                return false;
            });
        }
        o_1.or = or;
        function join(...deps) {
            return new CombinedObservable(deps);
        }
        o_1.join = join;
        function assign(value, mutator) {
            if (mutator == null || typeof mutator !== 'object' || Object.getPrototypeOf(mutator) !== Object.prototype)
                return mutator;
            if (typeof mutator === 'object') {
                var clone = o.clone(value) || {}; // shallow clone
                var changed = false;
                for (var name in mutator) {
                    var old_value = clone[name];
                    var new_value = assign(clone[name], mutator[name]);
                    changed = changed || old_value !== new_value;
                    clone[name] = new_value;
                }
                if (!changed)
                    return value;
                return clone;
            }
            else {
                return value;
            }
        }
        o_1.assign = assign;
        function debounce(fn, ms, leading = false) {
            var timer;
            var prev_res;
            var lead = false;
            // Called as a method decorator.
            if (arguments.length === 1) {
                leading = ms;
                ms = fn;
                return function (target, key, desc) {
                    var original = desc.value;
                    desc.value = debounce(original, ms);
                };
            }
            return function (...args) {
                if (leading && !lead && !timer) {
                    prev_res = fn.apply(this, args);
                    lead = true;
                }
                if (timer) {
                    lead = false;
                    clearTimeout(timer);
                }
                timer = window.setTimeout(() => {
                    if (!lead) {
                        prev_res = fn.apply(this, args);
                    }
                    lead = false;
                }, ms);
                return prev_res;
            };
        }
        o_1.debounce = debounce;
        function throttle(fn, ms, leading = false) {
            // Called as a method decorator.
            if (typeof fn === 'number') {
                leading = ms;
                ms = fn;
                return function (target, key, desc) {
                    var original = desc.value;
                    desc.value = throttle(original, ms, leading);
                };
            }
            var timer;
            var prev_res;
            var last_call = 0;
            var _args;
            var self;
            return function (...args) {
                var now = Date.now();
                // If the delay expired or if this is the first time this function is called,
                // then trigger the call. Otherwise, we will have to set up the call.
                if ((leading && last_call === 0) || last_call + ms <= now) {
                    prev_res = fn.apply(this, args);
                    last_call = now;
                    return prev_res;
                }
                self = this;
                _args = args;
                if (!timer) {
                    timer = window.setTimeout(function () {
                        prev_res = fn.apply(self, _args);
                        last_call = Date.now();
                        _args = null;
                        timer = null;
                    }, ms - (now - (last_call || now)));
                }
                return prev_res;
            };
        }
        o_1.throttle = throttle;
        /**
         * Setup a function that takes no argument and returns a new value
         * when cloning should be performed differently than just using `Object.create` and
         * copying properties.
         *
         * ```jsx
         * class MyType {
         *   [o.sym_clone]() {
         *     return new MyType() // or just anything that returns a clone
         *   }
         * }
         * ```
         *
         * @category observable
         */
        o_1.sym_clone = Symbol('o.clone_symbol');
        /**
         * Returns its arguments as an array but typed as a tuple from Typescript's point of view.
         *
         * This only exists because there is no way to declare a tuple in Typescript other than with a plain
         * array, and arrays with several types end up as an union.
         *
         * ```tsx
         * @include ../examples/o.tuple.tsx
         * ```
         *
         * @category observable, toc
         */
        function tuple(...t) {
            return t;
        }
        o_1.tuple = tuple;
        function clone(obj) {
            if (obj == null || typeof obj === 'number' || typeof obj === 'string' || typeof obj === 'boolean')
                return obj;
            var clone;
            var key;
            if (obj[o_1.sym_clone]) {
                return obj[o_1.sym_clone]();
            }
            if (Array.isArray(obj)) {
                return obj.slice();
            }
            if (obj instanceof Date) {
                return new Date(obj.getTime()); // timezone ?
            }
            if (obj instanceof RegExp) {
                return new RegExp(obj.source, ''
                    + obj.global ? 'g' : ''
                    + obj.multiline ? 'm' : ''
                    + obj.unicode ? 'u' : ''
                    + obj.ignoreCase ? 'i' : ''
                    + obj.sticky ? 'y' : '');
            }
            if (obj instanceof Map) {
                return new Map(obj);
            }
            if (obj instanceof Set) {
                return new Set(obj);
            }
            // If we got here, then we're cloning an object
            var prototype = Object.getPrototypeOf(obj);
            clone = Object.create(prototype);
            for (key of Object.getOwnPropertyNames(obj)) {
                // should we check for writability ? enumerability ?
                if (obj.propertyIsEnumerable(key))
                    clone[key] = obj[key];
            }
            for (var sym of Object.getOwnPropertySymbols(obj)) {
                if (obj.propertyIsEnumerable(sym))
                    clone[sym] = obj[sym];
            }
            return clone;
        }
        o_1.clone = clone;
        function tfpromise(obs, def) {
            var last_promise;
            var last_result = def === null || def === void 0 ? void 0 : def();
            var res = new CombinedObservable([o(obs)]);
            res.getter = ([pro]) => {
                if (last_promise === pro)
                    return last_result;
                last_promise = pro;
                pro.then(val => {
                    if (last_promise !== pro)
                        return;
                    last_result = val;
                    queue.schedule(res);
                });
                return last_result;
            };
            res.setter = undefined;
            return res;
        }
        o_1.tfpromise = tfpromise;
        /**
         * Returns a function that accepts a callback. While this callback is running, all subsequent
         * calls to the created lock become no-op.
         *
         * This helper is to be used when have observables which set each other's value in observers,
         * which could end up in an infinite loop, or when dealing with DOM Events.
         *
         * @returns a function that accepts a callback
         * @category observable, toc
         */
        function exclusive_lock() {
            var locked = false;
            return function exclusive_lock(fn) {
                if (locked)
                    return;
                locked = true;
                fn();
                locked = false;
            };
        }
        o_1.exclusive_lock = exclusive_lock;
        /**
         * A helper class that manages a group of observers with a few handy methods
         * to all start or stop them from observing.
         *
         * Meant to be extended by [[Mixin]] and [[App.Service]], or any class that has
         * some form of life-cycle (on/off) that it wants to tie observing to.
         *
         * @category observable, toc
         */
        class ObserverHolder {
            constructor() {
                /** @internal */
                this._observers = [];
                /** @internal */
                this._callback_queue = undefined;
                /**
                 * Boolean indicating if this object is actively observing its observers.
                 */
                this.is_observing = false;
            }
            /**
             * Start all the observers on this holder
             * @internal
             */
            startObservers() {
                var cbk = this._callback_queue;
                if (cbk) {
                    for (var i = 0, l = cbk.length; i < l; i++) {
                        cbk[i]();
                    }
                    this._callback_queue = undefined;
                }
                for (var obss = this._observers, i = 0, l = obss.length; i < l; i++) {
                    obss[i].startObserving();
                }
                this.is_observing = true;
            }
            /**
             * Stop all the observers on this holder from observing.
             */
            stopObservers() {
                for (var obss = this._observers, i = 0, l = obss.length; i < l; i++) {
                    obss[i].stopObserving();
                }
                this.is_observing = false;
            }
            /**
             * Does pretty much what [[$observe]] does.
             */
            observe(obs, fn, observer_callback) {
                var _a;
                if (!(obs instanceof Observable)) {
                    if (this.is_observing)
                        fn(obs, o_1.NoValue);
                    else
                        (this._callback_queue = (_a = this._callback_queue) !== null && _a !== void 0 ? _a : []).push(() => fn(obs, o_1.NoValue));
                    return null;
                }
                const observer = o(obs).createObserver(fn);
                observer_callback === null || observer_callback === void 0 ? void 0 : observer_callback(observer);
                return this.addObserver(observer);
            }
            /**
             * Add an observer to the observers array.
             */
            addObserver(observer) {
                this._observers.push(observer);
                if (this.is_observing)
                    observer.startObserving();
                return observer;
            }
            /**
             * Remove the observer from this holder and stop it from observing
             */
            unobserve(observer) {
                const idx = this._observers.indexOf(observer);
                if (idx > -1) {
                    if (this.is_observing)
                        observer.stopObserving();
                    this._observers.splice(idx, 1);
                }
            }
        }
        o_1.ObserverHolder = ObserverHolder;
    })(o || (o = {}));

    (function (tf) {
        /**
         * Transforms to a boolean observable that switches to `true` when
         * the original `observable` has the same value than `other`.
         *
         * `other` may be itself an observable.
         *
         * ```tsx
         * import { o, tf } from 'elt'
         *
         * const o_str = o('hello')
         * const o_is_world = o_str.tf(tf.equals('world'))
         * // false now
         * o_str.set('world')
         * // o_is_world is now true
         * ```
         * @category observable, toc
         */
        function equals(other) {
            return o.tf(other, oth => (current) => current === oth);
        }
        tf.equals = equals;
        /**
         * Does the opposite of [[tf.equals]]
         * @category observable, toc
         */
        function differs(other) {
            return o.tf(other, oth => (current) => current !== oth);
        }
        tf.differs = differs;
        /**
         * Transform an observable of array into another array based on either
         * an array of numbers (which are indices) or a function that takes the
         * array and returns indices.
         *
         * The indices/index function can be itself an observable.
         *
         * The resulting observable can have set() called on it.
         *
         * This is the basis of [[tf.filter]] and [[tf.array_sort]]
         * @category observable, toc
         */
        function array_transform(fn) {
            return o.tf(fn, fn => {
                return {
                    indices: [],
                    transform(list) {
                        if (Array.isArray(fn))
                            this.indices = fn;
                        else
                            this.indices = fn(list);
                        return this.indices.map(i => list[i]);
                    },
                    revert(newval, _, current) {
                        var res = current.slice();
                        for (var i = 0, idx = this.indices; i < idx.length; i++) {
                            res[idx[i]] = newval[i];
                        }
                        return res;
                    }
                };
            });
        }
        tf.array_transform = array_transform;
        /**
         * Filter an array.
         *
         * @param condition The condition the item has to pass to be kept
         * @param stable If false, the array is refiltered for any change in the condition or array.
         *    If true, only refilter if the condition changes, but keep the indices even if the array changes.
         * @category observable, toc
         */
        function array_filter(condition, stable = false) {
            return o.combine(o.tuple(condition, stable), ([cond, stable]) => {
                return {
                    indices: [],
                    transform(lst, old_val) {
                        var indices = stable && old_val !== o.NoValue ? this.indices : [];
                        // If the filter is stable, then start adding values at the end if the array changed length
                        var start = stable && old_val !== o.NoValue ? old_val.length : 0;
                        // this will only run if the old length is smaller than the new length.
                        for (var i = start, l = lst.length; i < l; i++) {
                            if (cond(lst[i], i, lst))
                                indices.push(i);
                        }
                        // if the array lost elements, then we have to remove those indices that are no longer relevant.
                        // fortunately, this.indices is sorted and we just have to go back from the beginning.
                        if (start > lst.length) {
                            for (i = indices.length - 1; indices[i] >= lst.length && i >= 0; i--) { }
                            indices = i < 0 ? [] : indices.slice(0, i + 1);
                        }
                        this.indices = indices;
                        return indices.map(i => lst[i]);
                    },
                    revert(newval, _, current) {
                        var res = current.slice();
                        for (var i = 0, idx = this.indices; i < idx.length; i++) {
                            res[idx[i]] = newval[i];
                        }
                        return res;
                    }
                };
            });
        }
        tf.array_filter = array_filter;
        /**
         * Transforms an array by sorting it. The sort function must return 0 in case of equality.
         * @param sortfn
         * @category observable, toc
         */
        function array_sort(sortfn) {
            return array_transform(o.tf(sortfn, sortfn => (lst) => {
                var res = new Array(lst.length);
                for (var i = 0, l = lst.length; i < l; i++)
                    res[i] = i;
                res.sort((a, b) => sortfn(lst[a], lst[b]));
                return res;
            }));
        }
        tf.array_sort = array_sort;
        /**
         * Sort an array by extractors, given in order of importance.
         * To sort in descending order, make a tuple with 'desc' as the second argument.
         *
         * ```tsx
         * import { o } from 'elt'
         *
         * const o_something = o([{a: 1, b: 'hello'}, {a: 3, b: 'world'}])
         * const o_sorted = o_something.tf(tf.array_sort_by([t => t.b, [t => t.a, 'desc']]))
         * ```
         * @param sorters
         * @category observable, toc
         */
        function array_sort_by(sorters) {
            return array_sort(o.tf(sorters, _sorters => {
                var sorters = [];
                var mult = [];
                for (var i = 0, l = _sorters.length; i < l; i++) {
                    var srt = _sorters[i];
                    if (Array.isArray(srt)) {
                        mult.push(srt[1] === 'desc' ? -1 : 1);
                        sorters.push(srt[0]);
                    }
                    else {
                        mult.push(1);
                        sorters.push(srt);
                    }
                }
                return (a, b) => {
                    for (var i = 0, l = sorters.length; i < l; i++) {
                        var _a = sorters[i](a);
                        var _b = sorters[i](b);
                        if (_a < _b)
                            return -1 * mult[i];
                        if (_a > _b)
                            return 1 * mult[i];
                    }
                    return 0;
                };
            }));
        }
        tf.array_sort_by = array_sort_by;
        /**
         * Group by an extractor function.
         * @category observable, toc
         */
        function array_group_by(extractor) {
            return o.tf(extractor, extractor => {
                return {
                    length: 0,
                    indices: [],
                    transform(lst) {
                        var _c;
                        this.length = lst.length;
                        var m = new Map();
                        for (var i = 0, l = lst.length; i < l; i++) {
                            var item = lst[i];
                            var ex = extractor(item);
                            var ls = (_c = m.get(ex)) !== null && _c !== void 0 ? _c : m.set(ex, []).get(ex);
                            ls.push(i);
                        }
                        var res = [];
                        for (var entry of m.entries()) {
                            var ind = entry[1];
                            var newl = new Array(ind.length);
                            for (var i = 0, l = ind.length; i < l; i++) {
                                newl[i] = lst[ind[i]];
                            }
                            res.push([entry[0], newl]);
                        }
                        return res;
                    },
                    revert(nval) {
                        var res = new Array(this.length);
                        var ind = this.indices;
                        for (var i = 0, li = ind.length; i < li; i++) {
                            var line = ind[i];
                            for (var j = 0, lj = line.length; j < lj; j++) {
                                var nval_line = nval[i][1];
                                res[line[j]] = nval_line[j];
                            }
                        }
                        return res;
                    }
                };
            });
        }
        tf.array_group_by = array_group_by;
        /**
         * Object entries, as returned by Object.keys() and returned as an array of [key, value][]
         * @category observable, toc
         */
        function entries() {
            return {
                transform(item) {
                    var res = [];
                    var keys = Object.keys(item);
                    for (var i = 0, l = keys.length; i < l; i++) {
                        var k = keys[i];
                        res.push([k, item[k]]);
                    }
                    return res;
                },
                revert(nval) {
                    var nres = {};
                    for (var i = 0, l = nval.length; i < l; i++) {
                        var entry = nval[i];
                        nres[entry[0]] = entry[1];
                    }
                    return nres;
                }
            };
        }
        tf.entries = entries;
        /**
         * Object entries, as returned by Object.keys() and returned as an array of [key, value][]
         * @category observable, toc
         */
        function map_entries() {
            return {
                transform(item) {
                    return [...item.entries()];
                },
                revert(nval) {
                    var nres = new Map();
                    for (var i = 0, l = nval.length; i < l; i++) {
                        var entry = nval[i];
                        nres.set(entry[0], entry[1]);
                    }
                    return nres;
                }
            };
        }
        tf.map_entries = map_entries;
        /**
         * Make a boolean observable from the presence of given values in a `Set`.
         * If the observable can be written to, then setting the transformed to `true` will
         * put all the values to the `Set`, and setting it to `false` will remove all of them.
         *
         * The values that should be in the set.
         * @category observable, toc
         */
        function set_has(...values) {
            return o.combine(values, (values) => {
                return {
                    transform(set) {
                        for (var i = 0; i < values.length; i++) {
                            var item = values[i];
                            if (!set.has(item))
                                return false;
                        }
                        return true;
                    },
                    revert(newv, _, set) {
                        const res = new Set(set);
                        for (var i = 0; i < values.length; i++) {
                            var item = values[i];
                            if (newv)
                                res.add(item);
                            else
                                res.delete(item);
                        }
                        return res;
                    }
                };
            });
        }
        tf.set_has = set_has;
    })(exports.tf || (exports.tf = {}));

    /**
     * Symbol property on `Node` to an array of observers that are started when the node is `init()` or `inserted()` and
     * stopped on `removed()`.
     * @category low level dom, toc
     */
    const sym_observers = Symbol('elt-observers');
    /**
     * Symbol property added on `Node` to track the status of the node ; if it's been init(), inserted() or more.
     * Its value type is `string`.
     * @category low level dom, toc
     */
    const sym_mount_status = Symbol('elt-mount-status');
    /**
     * This symbol is added as a property of the DOM nodes to store mixins associated with it.
     *
     * The more "correct" way of achieving this would have been to create
     * a WeakSet, but since the performance is not terrific (especially
     * when the number of elements gets high), the symbol solution was retained.
     * @category low level dom, toc
     */
    const sym_mixins = Symbol('elt-mixins');
    /**
     * A symbol property on `Node` to an array of functions to run when the node is **init**, which is to
     * say usually right when it was created but already added to a parent (which can be a `DocumentFragment`).
     * @category low level dom, toc
     */
    const sym_init = Symbol('elt-init');
    /**
     * A symbol property on `Node` to an array of functions to run when the node is **inserted** into a document.
     * @category low level dom, toc
     */
    const sym_inserted = Symbol('elt-inserted');
    /**
     * A symbol property on `Node` to an array of functions to run when the node is **removed** from a document.
     * @category low level dom, toc
     */
    const sym_removed = Symbol('elt-removed');
    const NODE_IS_INITED = 0x001;
    const NODE_IS_INSERTED = 0x010;
    const NODE_IS_OBSERVING = 0x100;
    function _node_call_cbks(node, sym, parent) {
        var cbks = node[sym];
        parent = parent !== null && parent !== void 0 ? parent : node.parentNode;
        if (cbks) {
            for (var i = 0, l = cbks.length; i < l; i++) {
                cbks[i](node, parent);
            }
        }
        var mx = node[sym_mixins];
        if (mx) {
            if (sym === sym_init) {
                for (i = 0, l = mx.length; i < l; i++) {
                    mx[i].init(node, parent);
                }
            }
            else if (sym === sym_inserted) {
                for (i = 0, l = mx.length; i < l; i++) {
                    mx[i].inserted(node, parent);
                }
            }
            else if (sym === sym_removed) {
                for (i = 0, l = mx.length; i < l; i++) {
                    mx[i].removed(node, parent);
                }
            }
        }
    }
    function _node_start_observers(node) {
        var obs = node[sym_observers];
        if (obs) {
            for (var i = 0, l = obs.length; i < l; i++) {
                obs[i].startObserving();
            }
        }
        var mx = node[sym_mixins];
        if (mx) {
            for (i = 0, l = mx.length; i < l; i++) {
                mx[i].startObservers();
            }
        }
    }
    function _node_stop_observers(node) {
        var obs = node[sym_observers];
        if (obs) {
            for (var i = 0, l = obs.length; i < l; i++) {
                obs[i].stopObserving();
            }
        }
        var mx = node[sym_mixins];
        if (mx) {
            for (i = 0, l = mx.length; i < l; i++) {
                mx[i].stopObservers();
            }
        }
    }
    /**
     * Return `true` if this node is currently observing its associated observables.
     * @category low level dom, toc
     */
    function node_is_observing(node) {
        return !!(node[sym_mount_status] & NODE_IS_OBSERVING);
    }
    /**
     * Return `true` is the init() phase was already executed on this node.
     * @category low level dom, toc
     */
    function node_is_inited(node) {
        return !!(node[sym_mount_status] & NODE_IS_INITED);
    }
    /**
     * Return `true` if the node is *considered* inserted in the document.
     *
     * There can be a slight variation between the result of this function and `node.isConnected`, since
     * its status is potentially updated after the node was inserted or removed from the dom, or could
     * have been forced to another value by a third party.
     *
     * @category low level dom, toc
     */
    function node_is_inserted(node) {
        return !!(node[sym_mount_status] & NODE_IS_INSERTED);
    }
    /**
     * Call init() functions on a node, and start its observers.
     * @internal
     */
    function node_do_init(node) {
        if (!(node[sym_mount_status] & NODE_IS_INITED)) {
            _node_call_cbks(node, sym_init);
            // We free the inits
            node[sym_init] = undefined;
        }
        // _node_start_observers(node)
        // We now refresh all the observers so that they trigger their behaviour.
        // They are however not started, since nodes could be discarded.
        var observers = node[sym_observers];
        if (observers) {
            for (var i = 0, l = observers.length; i < l; i++) {
                observers[i].refresh();
            }
        }
        var mx = node[sym_mixins];
        if (mx) {
            for (var i = 0, l = mx.length; i < l; i++) {
                var mx_observers = mx[i]._observers;
                for (var j = 0, lj = mx_observers.length; j < lj; j++) {
                    mx_observers[j].refresh();
                }
            }
        }
        node[sym_mount_status] = NODE_IS_INITED;
        // node[sym_mount_status] = NODE_IS_INITED | NODE_IS_OBSERVING
    }
    function _apply_inserted(node) {
        var st = node[sym_mount_status] || 0;
        node[sym_mount_status] = NODE_IS_INITED | NODE_IS_INSERTED | NODE_IS_OBSERVING; // now inserted
        // init if it was not done
        if (!(st & NODE_IS_INITED))
            _node_call_cbks(node, sym_init);
        // restart observers
        if (!(st & NODE_IS_OBSERVING))
            _node_start_observers(node);
        // then, call inserted.
        if (!(st & NODE_IS_INSERTED))
            _node_call_cbks(node, sym_inserted);
    }
    /**
     * @internal
     */
    function node_do_inserted(node) {
        if (node[sym_mount_status] & NODE_IS_INSERTED)
            return;
        var iter = node.firstChild;
        var stack = [];
        _apply_inserted(node);
        while (iter) {
            var already_inserted = iter[sym_mount_status] & NODE_IS_INSERTED;
            if (!already_inserted) {
                _apply_inserted(iter);
            }
            var first;
            // we ignore an entire subtree if the node is already marked as inserted
            // in all other cases, the node will be inserted
            if (!already_inserted && (first = iter.firstChild)) {
                var next = iter.nextSibling; // where we'll pick up when we unstack.
                if (next)
                    stack.push(next);
                iter = first; // we will keep going to the children
                continue;
            }
            else if (iter.nextSibling) {
                iter = iter.nextSibling;
                continue;
            }
            iter = stack.pop();
        }
    }
    /**
     * Apply unmount to a node.
     * @internal
     */
    function _apply_removed(node, prev_parent) {
        var st = node[sym_mount_status];
        node[sym_mount_status] = st ^ NODE_IS_OBSERVING ^ NODE_IS_INSERTED;
        if (st & NODE_IS_OBSERVING) {
            _node_stop_observers(node);
        }
        if (st & NODE_IS_INSERTED) {
            _node_call_cbks(node, sym_removed);
        }
    }
    /**
     * Traverse the node tree of `node` and call the `removed()` handlers, begininning by the leafs and ending
     * on the root.
     *
     * If `prev_parent` is not supplied, then the `removed` is not run, but observers are stopped.
     *
     * @internal
     */
    function node_do_remove(node, prev_parent) {
        const node_stack = [];
        var iter = node.firstChild;
        while (iter) {
            var first;
            while ((first = iter.firstChild) && (first[sym_mount_status] & NODE_IS_INSERTED)) {
                node_stack.push(iter);
                iter = first;
            }
            _apply_removed(iter, iter.parentNode);
            // When we're here, we're on a terminal node, so
            // we're going to have to process it.
            while (iter && !iter.nextSibling) {
                iter = node_stack.pop();
                if (iter)
                    _apply_removed(iter, iter.parentNode);
            }
            // So now we're going to traverse the next node.
            iter = iter && iter.nextSibling;
        }
        _apply_removed(node);
    }
    /**
     * Remove a `node` from the tree and call `removed` on its mixins and all the `removed` callbacks..
     *
     * This function is mostly used by verbs that don't want to wait for the mutation observer
     * callback registered in [[setup_mutation_observer]]
     *
     * @category low level dom, toc
     */
    function remove_node(node) {
        const parent = node.parentNode;
        if (parent) {
            parent.removeChild(node);
        }
        node_do_remove(node); // just stop observers otherwise...
    }
    /**
     * This is where we keep track of the registered documents.
     * @internal
     */
    const _registered_documents = new WeakSet();
    /**
     * Setup the mutation observer that will be in charge of listening to document changes
     * so that the `init`, `inserted` and `removed` life-cycle callbacks are called.
     *
     * This should be the first thing done at the top level of a project using ELT.
     *
     * If the code opens another window, it **must** use `setup_mutation_observer` on the newly created
     * window's document or other `Node` that will hold the ELT application.
     *
     * This function also registers a listener on the `unload` event of the `document` or `ownerDocument`
     * to stop all the observers when the window closes.
     *
     * ```tsx
     * import { o, setup_mutation_observer, $inserted, $observe } from 'elt'
     * // typically in the top-level app.tsx or index.tsx of your project :
     * // setup_mutation_observer(document)
     *
     * const o_test = o(1)
     *
     * // This example may require a popup permission from your browser.
     * // Upon closing the window, the console.log will stop.
     * const new_window = window.open(undefined, '_blank', 'menubar=0,status=0,toolbar=0')
     * if (new_window) {
     *   setup_mutation_observer(new_window.document)
     *   new_window.document.body.appendChild(<div>
     *     {$inserted(() => console.log('inserted.'))}
     *     {$observe(o_test, t => console.log('window sees t:', t))}
     *     HELLO.
     *   </div>)
     * }
     *
     * setInterval(() => {
     *   o_test.mutate(t => t + 1)
     * }, 1000)
     *
     * @category dom, toc
     */
    function setup_mutation_observer(node) {
        var _a, _b;
        if (!node.isConnected && !!node.ownerDocument)
            throw new Error(`cannot setup mutation observer on a Node that is not connected in a document`);
        var obs = new MutationObserver(records => {
            for (var i = 0, l = records.length; i < l; i++) {
                var record = records[i];
                for (var added = Array.from(record.addedNodes), j = 0, lj = added.length; j < lj; j++) {
                    var added_node = added[j];
                    node_do_inserted(added_node);
                }
                for (var removed = Array.from(record.removedNodes), j = 0, lj = removed.length; j < lj; j++) {
                    var removed_node = removed[j];
                    node_do_remove(removed_node, record.target);
                }
            }
        });
        // Make sure that when closing the window, everything gets cleaned up
        const target_document = ((_a = node.ownerDocument) !== null && _a !== void 0 ? _a : node);
        if (!_registered_documents.has(target_document)) {
            (_b = target_document.defaultView) === null || _b === void 0 ? void 0 : _b.addEventListener('unload', ev => {
                // Calls a `removed` on all the nodes in the closing window.
                node_do_remove(target_document.firstChild);
                obs.disconnect();
            });
        }
        // observe modifications to *all the tree*
        obs.observe(node, {
            childList: true,
            subtree: true
        });
        return obs;
    }
    /**
     * Insert a `node` to a `parent`'s child list before `refchild`, mimicking `Node.insertBefore()`.
     * This function is used by verbs and `e()` to run the `init()` and `inserted()` callbacks before
     * the mutation observer for performance reasons.
     *
     *  - Call the `init()` methods on `#Mixin`s present on the nodes that were not already mounted
     *  - Call the `inserted()` methods on `#Mixin`'s present on **all** the nodes and their descendents
     *     if `parent` is already inside the DOM.
     *
     * @category low level dom, toc
     */
    function insert_before_and_init(parent, node, refchild = null) {
        var df;
        if (!(node instanceof DocumentFragment)) {
            df = document.createDocumentFragment();
            df.appendChild(node);
        }
        else {
            df = node;
        }
        var iter = df.firstChild;
        while (iter) {
            node_do_init(iter);
            iter = iter.nextSibling;
        }
        var first = df.firstChild;
        var last = df.lastChild;
        parent.insertBefore(df, refchild);
        // If the parent was in the document, then we have to call inserted() on all the
        // nodes we're adding.
        if (parent.isConnected && first && last) {
            iter = last;
            // we do it in reverse because Display and the likes do it from previous to next.
            while (iter) {
                var next = iter.previousSibling;
                node_do_inserted(iter);
                if (iter === first)
                    break;
                iter = next;
            }
        }
    }
    /**
     * Alias for `#insert_before_and_mount` that mimicks `Node.appendChild()`
     * @category low level dom, toc
     */
    function append_child_and_init(parent, child) {
        insert_before_and_init(parent, child);
    }
    /**
     * Tie the observal of an `#Observable` to the presence of this node in the DOM.
     *
     * Used mostly by [[$observe]] and [[Mixin.observe]]
     *
     * @category low level dom, toc
     */
    function node_observe(node, obs, obsfn, observer_callback) {
        if (!(o.isReadonlyObservable(obs))) {
            // If the node is already inited, run the callback
            if (node[sym_mount_status] & NODE_IS_INITED)
                obsfn(obs, o.NoValue);
            else
                // otherwise, call it when inited
                node_on(node, sym_init, () => obsfn(obs, o.NoValue));
            return null;
        }
        // Create the observer and append it to the observer array of the node
        var obser = obs.createObserver(obsfn);
        if (observer_callback)
            observer_callback(obser);
        node_add_observer(node, obser);
        return obser;
    }
    /**
     * Associate an `observer` to a `node`. If the `node` is in the document, then
     * the `observer` is called as its [[o.Observable]] changes.
     *
     * If `node` is removed from the dom, then `observer` is disconnected from
     * its [[o.Observable]]. This helps in preventing memory leaks for those variables
     * that `observer` may close on.
     *
     * @category low level dom, toc
     */
    function node_add_observer(node, observer) {
        if (node[sym_observers] == undefined)
            node[sym_observers] = [];
        node[sym_observers].push(observer);
        if (node[sym_mount_status] & NODE_IS_OBSERVING)
            observer.startObserving();
    }
    function node_add_event_listener(node, ev, listener) {
        if (Array.isArray(ev))
            // we have to force typescript's hands on the listener typing, as we **know** for certain that current_target
            // is the right type here.
            for (var e of ev)
                node.addEventListener(e, listener);
        else {
            node.addEventListener(ev, listener);
        }
    }
    /**
     * Stop a node from observing an observable, even if it is still in the DOM
     * @category low level dom, toc
     */
    function node_unobserve(node, obsfn) {
        var _a;
        const is_observing = node[sym_mount_status] & NODE_IS_OBSERVING;
        node[sym_observers] = (_a = node[sym_observers]) === null || _a === void 0 ? void 0 : _a.filter(ob => {
            const res = ob === obsfn || ob.fn === obsfn;
            if (res && is_observing) {
                // stop the observer before removing it from the list if the node was observing
                ob.stopObserving();
            }
            return !res;
        });
    }
    /**
     * Observe an attribute and update the node as needed.
     * @category low level dom, toc
     */
    function node_observe_attribute(node, name, value) {
        node_observe(node, value, val => {
            if (val === true)
                node.setAttribute(name, '');
            else if (val != null && val !== false)
                node.setAttribute(name, val);
            else
                // We can remove safely even if it doesn't exist as it won't raise an exception
                node.removeAttribute(name);
        });
    }
    /**
     * Observe a style (as JS defines it) and update the node as needed.
     * @category low level dom, toc
     */
    function node_observe_style(node, style) {
        if (style instanceof o.Observable) {
            node_observe(node, style, st => {
                const ns = node.style;
                var props = Object.keys(st);
                for (var i = 0, l = props.length; i < l; i++) {
                    let x = props[i];
                    ns.setProperty(x.replace(/[A-Z]/g, m => '-' + m.toLowerCase()), st[x]);
                }
            });
        }
        else {
            // c is a MaybeObservableObject
            var st = style;
            var props = Object.keys(st);
            for (var i = 0, l = props.length; i < l; i++) {
                let x = props[i];
                node_observe(node, st[x], value => {
                    node.style.setProperty(x.replace(/[A-Z]/g, m => '-' + m.toLowerCase()), value);
                });
            }
        }
    }
    /**
     * Observe a complex class definition and update the node as needed.
     * @category low level dom, toc
     */
    function node_observe_class(node, c) {
        if (!c)
            return;
        if (typeof c === 'string' || c.constructor !== Object) {
            // c is an Observable<string>
            node_observe(node, c, (str, chg) => {
                if (chg !== o.NoValue)
                    _remove_class(node, chg);
                _apply_class(node, str);
            });
        }
        else {
            var ob = c;
            // c is a MaybeObservableObject
            var props = Object.keys(ob);
            for (var i = 0, l = props.length; i < l; i++) {
                let x = props[i];
                node_observe(node, ob[x], applied => applied ? _apply_class(node, x) : _remove_class(node, x));
            }
        }
    }
    function _apply_class(node, c) {
        if (Array.isArray(c)) {
            for (var i = 0, l = c.length; i < l; i++) {
                _apply_class(node, c[i]);
            }
            return;
        }
        c = c == null ? null : c.toString();
        if (!c)
            return;
        var is_svg = node instanceof SVGElement;
        if (is_svg) {
            for (var _ of c.split(/\s+/g))
                if (_)
                    node.classList.add(_);
        }
        else
            node.className += ' ' + c;
    }
    function _remove_class(node, c) {
        if (Array.isArray(c)) {
            for (var i = 0, l = c.length; i < l; i++) {
                _remove_class(node, c[i]);
            }
            return;
        }
        c = c == null ? null : c.toString();
        if (!c)
            return;
        var is_svg = node instanceof SVGElement;
        var name = node.className;
        for (var _ of c.split(/\s+/g))
            if (_) {
                if (is_svg)
                    node.classList.remove(_);
                else
                    name = name.replace(' ' + _, '');
            }
        if (!is_svg)
            node.setAttribute('class', name);
    }
    /**
     * Register a `callback` to be called for the life-cycle event `sym` on `node`.
     * [[$init]], [[$inserted]] and [[$removed]] are more commonly used, or alternatively [[Mixin#init]], [[Mixin#inserted]] or [[Mixin#removed]]
     *
     * This is mostly used internally.
     *
     * ```tsx
     * import { sym_inserted, node_on } from 'elt'
     *
     * var node = <div></div>
     * node_on(node, sym_inserted, (node, parent) => console.log('inserted'))
     *
     * // the former is achieved more easily by doing that:
     * import { $inserted } from 'elt'
     * <div>
     *   {$inserted((node, parent) => console.log('inserted'))}
     * </div>
     * ```
     *
     * @category low level dom, toc
     */
    function node_on(node, sym, callback) {
        var _a;
        (node[sym] = (_a = node[sym]) !== null && _a !== void 0 ? _a : []).push(callback);
    }
    /**
     * Remove a previously associated `callback` from the life-cycle event `sym` for the `node`.
     * @category low level dom, toc
     */
    function node_off(node, sym, callback) {
        var _a;
        (node[sym] = (_a = node[sym]) !== null && _a !== void 0 ? _a : []).filter(f => f !== callback);
    }
    /**
     * Remove all the nodes after `start` until `until` (included), calling `removed` and stopping observables as needed.
     * @category low level dom, toc
     */
    function node_remove_after(start, until) {
        if (!start)
            return;
        var next;
        var parent = start.parentNode;
        while ((next = start.nextSibling)) {
            parent.removeChild(next);
            node_do_remove(next);
            if (next === until)
                break;
        }
    }

    (function ($bind) {
        // FIXME this lacks some debounce and throttle, or a way of achieving it.
        function setup_bind(obs, node_get, node_set, event = 'input') {
            return function (node) {
                const lock = o.exclusive_lock();
                /// When the observable changes, update the node
                node_observe(node, obs, value => {
                    lock(() => { node_set(node, value); });
                });
                node_add_event_listener(node, event, () => {
                    lock(() => { obs.set(node_get(node)); });
                });
            };
        }
        /**
         * Bind an observable to an input's value.
         *
         * ```tsx
         * import { o, $bind, Fragment as $ } from 'elt'
         *
         * const o_string = o('stuff')
         *
         * document.body.appendChild(<$>
         *   <input type="text">
         *     {$bind.string(o_string)}
         *   </input> / {o_string}
         * </$>)
         * ```
         *
         * @category dom, toc
         */
        function string(obs) {
            return setup_bind(obs, node => node.value, (node, value) => node.value = value);
        }
        $bind.string = string;
        /**
         * Bind a string observable to an html element which is contenteditable.
         *
         * ```tsx
         * import { o, $bind, Fragment as $ } from 'elt'
         *
         * const o_contents = o('Hello <b>World</b> !')
         *
         * document.body.appendChild(<$>
         *   <div contenteditable='true'>
         *      {$bind.contenteditable(o_contents, true)}
         *   </div>
         *   <pre><code style={{whiteSpace: 'pre-wrap'}}>{o_contents}</code></pre>
         * </$>)
         * ```
         *
         * @category dom, toc
         */
        function contenteditable(obs, as_html) {
            return setup_bind(obs, node => as_html ? node.innerHTML : node.innerText, (node, value) => {
                if (as_html) {
                    node.innerHTML = value;
                }
                else {
                    node.innerText = value;
                }
            });
        }
        $bind.contenteditable = contenteditable;
        /**
         * Bind a number observable to an <input type="number"/>. Most likely won't work on anything else
         * and will set the value to `NaN`.
         *
         * ```tsx
         * import { o, $bind, Fragment as $ } from 'elt'
         *
         * const o_number = o(1)
         *
         * document.body.appendChild(<$>
         *   <input type="number">
         *     {$bind.number(o_number)}
         *   </input> / {o_number}
         * </$>)
         * ```
         *
         * @category dom, toc
         */
        function number(obs) {
            return setup_bind(obs, node => node.valueAsNumber, (node, value) => node.valueAsNumber = value);
        }
        $bind.number = number;
        /**
         * Bind bidirectionnally a `Date | null` observable to an `input`. Will only work on inputs
         * type `"date"` `"datetime"` `"datetime-local"`.
         *
         * ```tsx
         * import { o, $bind, Fragment as $ } from 'elt'
         *
         * const o_date = o(null as Date | null)
         * const dtf = Intl.DateTimeFormat('fr')
         *
         * document.body.appendChild(<$>
         *   <input type="date">
         *      {$bind.date(o_date)}
         *   </input> - {o_date.tf(d => d ? dtf.format(d) : 'null')}
         * </$>)
         * ```
         *
         * @category dom, toc
         */
        function date(obs) {
            return setup_bind(obs, node => node.valueAsDate, (node, value) => node.valueAsDate = value);
        }
        $bind.date = date;
        /**
         * Bind bidirectionnally a boolean observable to an input. Will only work if the input's type
         * is "radio" or "checkbox".
         *
         * ```tsx
         * import { o, $bind, Fragment as $ } from 'elt'
         *
         * const o_bool = o(false)
         *
         * document.body.appendChild(<$>
         *   <input type="checkbox">
         *      {$bind.boolean(o_bool)}
         *   </input> - {o_bool.tf(b => b ? 'true' : 'false')}
         * </$>)
         * ```
         *
         * @category dom, toc
         */
        function boolean(obs) {
            return setup_bind(obs, node => node.checked, (node, value) => node.checked = value, 'change');
        }
        $bind.boolean = boolean;
        /**
         * Bind a number observable to the selected index of a select element
         *
         * ```tsx
         * import { o, $bind, Fragment as $ } from 'elt'
         *
         * const o_selected = o(-1)
         *
         * document.body.appendChild(<$>
         *   <select>
         *      {$bind.selected_index(o_selected)}
         *      <option>one</option>
         *      <option>two</option>
         *      <option>three</option>
         *   </select> / {o_selected}
         * </$>)
         * ```
         *
         * @category dom, toc
         */
        function selected_index(obs) {
            return setup_bind(obs, node => node.selectedIndex, (node, value) => node.selectedIndex = value);
        }
        $bind.selected_index = selected_index;
    })(exports.$bind || (exports.$bind = {}));
    /**
     * Modify object properties of the current Node.
     *
     * Unfortunately, TSX does not pick up on the correct node type here. It however works without having
     * to type with regular js calls.
     *
     * ```tsx
     * <div>
     *   {$props<HTMLDivElement>({dir: 'left'})}
     * </div>
     * E.DIV(
     *   $props({dir: 'left'})
     * )
     * ```
     *
     * @category dom, toc
     */
    function $props(props) {
        var keys = Object.keys(props);
        return (node) => {
            for (var i = 0, l = keys.length; i < l; i++) {
                var k = keys[i];
                var val = props[k];
                if (o.isReadonlyObservable(val)) {
                    node_observe(node, val, value => node[k] = value);
                }
                else {
                    node[k] = val;
                }
            }
        };
    }
    /**
     * Observe one or several class definition, where a class definition is either
     *  - A `o.RO<string>`
     *  - An object which keys are class names and values are `o.RO<any>` and whose truthiness
     *    determine the inclusion of the class on the target element.
     *
     * The `class={}` attribute on all nodes works exactly the same as `$class`.
     *
     * ```tsx
     * import { $class, o, Fragment as $, $bind } from 'elt'
     *
     * const o_cls = o('class2')
     * const o_bool = o(false)
     *
     * document.body.appendChild(<$>
     *   <style>
     *     {`.class1 {
     *        text-decoration: underline;
     *     }
     *     .class2 {
     *        background: #f99;
     *     }
     *     .class3 {
     *        font-weight: bold;
     *     }
     *     .class4 {
     *        background: #99f;
     *     }
     *   `}
     *   </style>
     *
     *   <input id='class3' type="checkbox">
     *     {$bind.boolean(o_bool)}
     *   </input> <label for='class3'>Class 3</label>
     *   {' / '}
     *   <input type='text'>
     *     {$bind.string(o_cls)}
     *   </input>
     *
     *   <div>
     *     {$class('class1', o_cls, {class3: o_bool})}
     *     content 1
     *   </div>
     *   <div>$class and class= are equivalent</div>
     *   <div class={['class1', o_cls, {class3: o_bool}]}>
     *     content 2
     *   </div>
     *   {E.DIV(
     *     $class('class1', o_cls, {class3: o_bool}),
     *     'content 3'
     *   )}
     * </$>)
     * ```
     * @category dom, toc
     */
    function $class(...clss) {
        return (node) => {
            for (var i = 0, l = clss.length; i < l; i++) {
                node_observe_class(node, clss[i]);
            }
        };
    }
    /**
     * Update a node's id with a potentially observable value.
     *
     * ```tsx
     * <MyComponent>{$id('some-id')}</MyComponent>
     * ```
     *
     * > **Note**: You can use the `id` attribute on any element, be them Components or regular nodes, as it is forwarded.
     *
     * @category dom, toc
     */
    function $id(id) {
        return (node) => {
            node_observe(node, id, id => node.id = id);
        };
    }
    /**
     * Update a node's title with a potentially observable value.
     * Used mostly when dealing with components since their base node attributes are no longer available.
     *
     * ```tsx
     * <MyComponent>{$title('Some title ! It generally appears on hover.')}</MyComponent>
     * E.DIV(
     *   $title('hello there !')
     * )
     * ```
     * @category dom, toc
     */
    function $title(title) {
        return (node) => {
            node_observe(node, title, title => node.title = title);
        };
    }
    /**
     * Update a node's style with potentially observable varlues
     *
     * ```tsx
     * const o_width = o('321px')
     * E.DIV(
     *   $style({width: o_width, flex: '1'})
     * )
     * ```
     *
     * @category dom, toc
     */
    function $style(...styles) {
        return (node) => {
            for (var i = 0, l = styles.length; i < l; i++) {
                node_observe_style(node, styles[i]);
            }
        };
    }
    /**
     * Observe an observable and tie the observation to the node this is added to
     * @category dom, toc
     */
    // export function $observe<T>(a: o.Observer<T>): Decorator<Node>
    function $observe(a, cbk, obs_cbk) {
        return (node) => {
            node_observe(node, a, (nval, chg) => cbk(nval, chg, node), obs_cbk);
        };
    }
    function $on(event, _listener, useCapture = false) {
        return function $on(node) {
            if (typeof event === 'string')
                node.addEventListener(event, ev => _listener(ev), useCapture);
            else {
                for (var n of event) {
                    node.addEventListener(n, ev => _listener(ev), useCapture);
                }
            }
        };
    }
    /**
     * Add a callback on the click event, or touchend if we are on a mobile
     * device.
     * @category dom, toc
     */
    function $click(cbk, capture) {
        return function $click(node) {
            // events don't trigger on safari if not pointer.
            node.style.cursor = 'pointer';
            node_add_event_listener(node, 'click', cbk);
        };
    }
    /**
     * Run code soon after the `node` was created, when it has a `parent`. Beware, the `parent` in
     * init **is probably not the parent it will have in the document**.
     *
     * To avoid layout trashing (aka reflow) and needless repaints,
     * ELT tries to do most of the work in `DocumentFragment` or while the nodes are still in memory.
     *
     * When calling [[e]] (or `E()`), whenever a node appends a child to itself, `e` calls its
     * `$init` callbacks **and start the node's observers**. It does so because some verbs, like `If`
     * will only update their content when observing their condition, not before. Since `If` uses enclosing
     * comments to find out what it has to replace, it needs to have access to its parent to manipulate its
     * siblings, hence this particular way of proceeding.
     *
     * Afterwards, [[$inserted]] and [[$removed]] both start and stop observers, respectively. The first
     * time around, since [[$init]] already started them, [[$inserted]] will only run its callbacks and
     * leave the observers to do their jobs.
     *
     * ```jsx
     * import { o, $init, $inserted, $removed, Fragment as $, If, $click } from 'elt'
     *
     * var the_div = <div>
     *   {$init(() => console.log('init'))}
     *   {$inserted(() => console.log('inserted'))}
     *   {$removed(() => console.log('removed'))}
     *   I AM HERE.
     * </div>
     *
     * var o_is_inside = o(false)
     *
     * // here, we reuse the_div and are not recreating it all the time.
     * // notice in the console how init was only called once.
     * document.body.appendChild(<$>
     *   <button>
     *     {$click(() => o_is_inside.mutate(b => !b))}
     *     Toggle the div
     *   </button>
     *   {If(o_is_inside, () => the_div)}
     * </$>)
     *
     * ```
     * @category dom, toc
     */
    function $init(fn) {
        return node => {
            node_on(node, sym_init, fn);
        };
    }
    /**
     * Call the `fn` callback when the decorated `node` is inserted into the DOM with
     * itself as first argument and its parent as the second.
     *
     * See [[$init]] for examples.
     *
     * @category dom, toc
     */
    function $inserted(fn) {
        return (node) => {
            node_on(node, sym_inserted, fn);
        };
    }
    /**
     * Run a callback when the node is removed from its holding document, with `node`
     * as the node being removed and `parent` with its previous parent.
     *
     * See [[$init]] for examples.
     *
     * @category dom, toc
     */
    function $removed(fn) {
        return (node) => {
            node_on(node, sym_removed, fn);
        };
    }
    /**
     * Setup scroll so that touchstart and touchmove events don't
     * trigger the ugly scroll band on mobile devices.
     *
     * Calling this functions makes anything not marked scrollable as non-scrollable.
     * @category dom, toc
     */
    function $scrollable(node) {
        $scrollable.setUpNoscroll(node.ownerDocument);
        var style = node.style;
        style.overflowY = 'auto';
        style.overflowX = 'auto';
        style.webkitOverflowScrolling = 'touch';
        node_add_event_listener(node, 'touchstart', ev => {
            if (ev.currentTarget.scrollTop == 0) {
                node.scrollTop = 1;
            }
            else if (node.scrollTop + node.offsetHeight >= node.scrollHeight - 1)
                node.scrollTop -= 1;
        });
        node_add_event_listener(node, 'touchmove', ev => {
            if (ev.currentTarget.offsetHeight < ev.currentTarget.scrollHeight)
                ev[$scrollable.sym_letscroll] = true;
        });
    }
    (function ($scrollable) {
        /** @internal */
        const documents_wm = new WeakMap();
        /** @internal */
        $scrollable.sym_letscroll = Symbol('elt-scrollstop');
        /**
         * Used by the `scrollable()` decorator
         * @internal
         */
        function setUpNoscroll(dc) {
            if (documents_wm.has(dc))
                return;
            dc.body.addEventListener('touchmove', function event(ev) {
                // If no handler has "marked" the event as being allowed to scroll, then
                // just stop the scroll.
                if (!ev[$scrollable.sym_letscroll])
                    ev.preventDefault();
            }, false);
        }
        $scrollable.setUpNoscroll = setUpNoscroll;
    })($scrollable || ($scrollable = {}));

    /**
     * A `Mixin` is an object that is tied to a DOM Node and its lifecycle. This class
     * is the base class all Mixins should derive from.
     *
     * Aside from allowing code to be nicely boxed in classes, Mixins can "communicate" by
     * looking for other mixins on the same node, children or parents.
     *
     * When defining a Mixin that could be set on a root type (eg: `HTMLElement`), ensure that
     * it is always defined as an extension of this type
     *
     * ```tsx
     * import { Mixin } from 'elt'
     *
     * class MyMixinWorks<N extends HTMLElement> extends Mixin<N> {
     *
     * }
     *
     * class MyMixinFails extends Mixin<HTMLElement> {
     *
     * }
     *
     * var div = <div>
     *   {new MyMixinWorks()}
     *   {new MyMixinFails()}
     * </div>
     * ```
     *
     * @category dom, toc
     */
    class Mixin extends o.ObserverHolder {
        constructor() {
            super(...arguments);
            /**
             * The node this mixin is associated to.
             *
             * Since assigning a mixin to a `Node` is done by **first** creating the mixin and
             * putting it in its children when using [[e]], the fact that node is not typed as `N | null`
             * is cheating ; `this.node` **is** null in the `constructor` of the Mixin.
             *
             * The only reason it is not `N | null` is because it is not `null` for very long.
             *
             * `this.node` is only defined for certain during [[Mixin#init]] ; do not try to use it before
             * then.
             */
            this.node = null;
        }
        /**
         * Get a Mixin by its class on the given node or its parents.
         *
         * You do not need to overload this static method.
         *
         * ```typescript
         * class MyMixin extends Mixin {  }
         *
         * // At some point, we add this mixin to a node.
         *
         * var mx = MyMixin.get(node) // This gets the instance that was added to the node, if it exists.
         * ```
         *
         * @param node The node at which we'll start looking for the mixin
         * @param recursive Set to false if you do not want the mixin to be searched on the
         *   node parent's if it was not found.
         */
        static get(node, recursive = true) {
            let iter = node; // yeah yeah, I know, it's an EventTarget as well but hey.
            while (iter) {
                var mixins = iter[sym_mixins];
                if (mixins) {
                    for (var i = 0, l = mixins.length; i < l; i++) {
                        var m = mixins[i];
                        if (m instanceof this)
                            return m;
                    }
                }
                if (!recursive)
                    break;
                iter = iter.parentNode;
            }
            return null;
        }
        /**
         * To be used with decorators
         */
        static onThisNode(cbk) {
            return (node) => {
            };
        }
        /**
         * Stub method meant to be overloaded in a child class. Called during [[$init]]
         */
        init(node, parent) { }
        /**
         * Stub method meant to be overloaded in a child class. Called during [[$inserted]]
         */
        inserted(node, parent) { }
        /**
         * Stub method meant to be overloaded in a child class. Called during [[$removed]]
         */
        removed(node, parent) { }
        /**
         * Remove the mixin from this node. Observers created with `this.observe()` will
         * stop observing. The `this.removed` method **will not** be called.
         */
        removeFromNode() {
            node_remove_mixin(this.node, this);
            this.node = null; // we force the node to null to help with garbage collection.
        }
        on(name, listener, useCapture) {
            if (typeof name === 'string')
                this.node.addEventListener(name, (ev) => listener(ev), useCapture);
            else
                for (var n of name) {
                    this.node.addEventListener(n, (ev) => listener(ev), useCapture);
                }
        }
    }
    /**
     * The Component is the core class of your TSX components.
     *
     * It is just a Mixin that has a `render()` method and that defines the `attrs`
     * property which will restrict what attributes the component can be created with.
     *
     * All attributes **must** extend the base `Attrs` class.
     * @category dom, toc
     */
    class Component extends Mixin {
        /** @internal */
        constructor(attrs) {
            super();
            this.attrs = attrs;
        }
    }
    /**
     * Associate a `mixin` to a `node`.
     *
     * All it does is add it to the chained list of mixins accessible on `node[sym_mixins]` and
     * set `mixin.node` to the corresponding node.
     *
     * In general, to add a mixin to a node, prefer adding it to its children.
     *
     * ```tsx
     * var my_mixin = new Mixin()
     *
     * // these are equivalent
     * <div>{my_mixin}</div>
     * var d = <div/>; node_add_mixin(d, mixin);
     * ```
     */
    function node_add_mixin(node, mixin) {
        var _a;
        (node[sym_mixins] = (_a = node[sym_mixins]) !== null && _a !== void 0 ? _a : []).push(mixin);
        mixin.node = node;
    }
    /**
     * Remove a Mixin from the array of mixins associated with this Node.
     *
     * Stops the observers if they were running.
     *
     * Does **NOT** call its `removed()` handlers.
     */
    function node_remove_mixin(node, mixin) {
        var mx = node[sym_mixins];
        if (!mx)
            return;
        var idx = mx.indexOf(mixin);
        if (idx)
            mx.splice(idx, 1);
        if (idx > -1) {
            mixin.stopObservers();
        }
    }

    ////////////////////////////////////////////////////////
    const SVG = "http://www.w3.org/2000/svg";
    const NS = {
        // SVG nodes, shamelessly stolen from React.
        svg: SVG,
        circle: SVG,
        clipPath: SVG,
        defs: SVG,
        desc: SVG,
        ellipse: SVG,
        feBlend: SVG,
        feColorMatrix: SVG,
        feComponentTransfer: SVG,
        feComposite: SVG,
        feConvolveMatrix: SVG,
        feDiffuseLighting: SVG,
        feDisplacementMap: SVG,
        feDistantLight: SVG,
        feFlood: SVG,
        feFuncA: SVG,
        feFuncB: SVG,
        feFuncG: SVG,
        feFuncR: SVG,
        feGaussianBlur: SVG,
        feImage: SVG,
        feMerge: SVG,
        feMergeNode: SVG,
        feMorphology: SVG,
        feOffset: SVG,
        fePointLight: SVG,
        feSpecularLighting: SVG,
        feSpotLight: SVG,
        feTile: SVG,
        feTurbulence: SVG,
        filter: SVG,
        foreignObject: SVG,
        g: SVG,
        image: SVG,
        line: SVG,
        linearGradient: SVG,
        marker: SVG,
        mask: SVG,
        metadata: SVG,
        path: SVG,
        pattern: SVG,
        polygon: SVG,
        polyline: SVG,
        radialGradient: SVG,
        rect: SVG,
        stop: SVG,
        switch: SVG,
        symbol: SVG,
        text: SVG,
        textPath: SVG,
        tspan: SVG,
        use: SVG,
        view: SVG,
    };
    var cmt_count = 0;
    /**
     * A [[Mixin]] made to store nodes between two comments.
     *
     * Can be used as a base to build verbs more easily.
     * @category dom, toc
     */
    class CommentContainer extends Mixin {
        constructor() {
            super(...arguments);
            /** The Comment marking the end of the node handled by this Mixin */
            this.end = document.createComment(`-- ${this.constructor.name} ${cmt_count++} --`);
        }
        /** @internal */
        init(node) {
            node.parentNode.insertBefore(this.end, node.nextSibling);
        }
        /**
         * Remove all nodes between this.start and this.node
         */
        clear() {
            if (this.end.previousSibling !== this.node)
                node_remove_after(this.node, this.end.previousSibling);
        }
        /**
         * Update the contents between `this.node` and `this.end` with `cts`. `cts` may be
         * a `DocumentFragment`.
         */
        setContents(cts) {
            this.clear();
            // Insert the new comment before the end
            if (cts)
                insert_before_and_init(this.node.parentNode, cts, this.end);
        }
    }
    /**
     * Displays and actualises the content of an Observable containing
     * Node, string or number into the DOM.
     *
     * This is the class that is used whenever an observable is used as
     * a child.
     */
    class Displayer extends CommentContainer {
        /**
         * The `Displayer` expects `Renderable` values.
         */
        constructor(_obs) {
            super();
            this._obs = _obs;
        }
        /** @internal */
        init(node) {
            super.init(node);
            this.observe(this._obs, value => this.setContents(e.renderable_to_node(value)));
        }
    }
    /**
     * Write and update the string value of an observable value into
     * a Text node.
     *
     * This verb is used whenever an observable is passed as a child to a node.
     *
     * ```tsx
     * import { o, $Display, Fragment as $ } from 'elt'
     *
     * const o_text = o('text')
     * document.body.appendChild(<$>
     *   {o_text} is the same as {$Display(o_text)}
     * </$>)
     * ```
     *
     * @category low level dom, toc
     */
    function Display(obs) {
        if (!(obs instanceof o.Observable)) {
            return e.renderable_to_node(obs, true);
        }
        return e(document.createComment('$Display'), new Displayer(obs));
    }
    function isComponent(kls) {
        return kls.prototype instanceof Component;
    }
    var _decorator_map = new WeakMap();
    function e(elt, ...children) {
        if (!elt)
            throw new Error(`e() needs at least a string, a function or a Component`);
        let node = null; // just to prevent the warnings later
        var is_basic_node = typeof elt === 'string' || elt instanceof Node;
        // const fragment = get_dom_insertable(children) as DocumentFragment
        var i = 0;
        var l = 0;
        var attrs = {};
        var decorators = [];
        var mixins = [];
        var renderables = [];
        e.separate_children_from_rest(children, attrs, decorators, mixins, renderables);
        if (is_basic_node) {
            // create a simple DOM node
            if (typeof elt === 'string') {
                var ns = NS[elt]; // || attrs.xmlns
                node = (ns ? document.createElementNS(ns, elt) : document.createElement(elt));
            }
            else {
                node = elt;
            }
            for (i = 0, l = renderables.length; i < l; i++) {
                var c = e.renderable_to_node(renderables[i]);
                if (c) {
                    append_child_and_init(node, c);
                }
            }
        }
        else if (isComponent(elt)) {
            // elt is an instantiator / Component
            var comp = new elt(attrs);
            node = comp.render(renderables);
            node_add_mixin(node, comp);
        }
        else if (typeof elt === 'function') {
            // elt is just a creator function
            node = elt(attrs, renderables);
        }
        // we have to cheat a bit here.
        e.handle_attrs(node, attrs, is_basic_node);
        // Handle decorators on the node
        for (i = 0, l = decorators.length; i < l; i++) {
            e.handle_decorator(node, decorators[i]);
        }
        // Add the mixins
        for (i = 0, l = mixins.length; i < l; i++) {
            node_add_mixin(node, mixins[i]);
        }
        return node;
    }
    /**
     * Creates a document fragment.
     *
     * The JSX namespace points `JSX.Fragment` to this function.
     *
     * > **Note**: Its signature says it expects `Insertable`, but since a document fragment itself never
     * > ends up being added to `Node`, no observable will ever run on it, no life cycle callback will
     * > ever be called on it.
     *
     * ```tsx
     * // If using jsxFactory, you have to import Fragment and use it
     * import { Fragment as $ } from 'elt'
     *
     * document.body.appendChild(<$>
     *   <p>Content</p>
     *   <p>More Content</p>
     * </$>)
     *
     * // If using jsxNamespace as "e" or "E", the following works out of the box
     * document.body.appendChild(<>
     *   <p>Content</p>
     *   <p>More Content</p>
     * </>)
     *
     * ```
     *
     * @category dom, toc
     */
    function Fragment(...children) {
        const fr = document.createDocumentFragment();
        // This is a trick, children may contain lots of stuff
        return e(fr, children);
    }
    const $ = Fragment;
    (function (e) {
        /**
         * Implement this property on any object to be able to insert it as a node
         * child. The signature it implements is `() => Renderable`.
         *
         * ```tsx
         * @include ../examples/e.sym_render.tsx
         * ```
         */
        e.sym_render = Symbol('renderable');
        /** @internal */
        function is_renderable_object(c) {
            return c && c[e.sym_render];
        }
        e.is_renderable_object = is_renderable_object;
        /**
         * Separates decorators and mixins from nodes or soon-to-be-nodes from children.
         * Returns a tuple containing the decorators/mixins/attrs in one part and the children in the other.
         * The resulting arrays are 1-dimensional and do not contain null or undefined.
         * @internal
         */
        function separate_children_from_rest(children, attrs, decorators, mixins, chld) {
            for (var i = 0, l = children.length; i < l; i++) {
                var c = children[i];
                if (c == null)
                    continue;
                if (Array.isArray(c)) {
                    separate_children_from_rest(c, attrs, decorators, mixins, chld);
                }
                else if (c instanceof Node || typeof c === 'string' || typeof c === 'number' || o.isReadonlyObservable(c) || is_renderable_object(c)) {
                    chld.push(c);
                }
                else if (typeof c === 'function') {
                    var cmt = document.createComment('decorator ' + c.name);
                    _decorator_map.set(c, cmt);
                    chld.push(cmt);
                    decorators.push(c);
                }
                else if (c instanceof Mixin) {
                    mixins.push(c);
                }
                else {
                    // We just copy the attrs properties onto the attrs object
                    Object.assign(attrs, c);
                }
            }
        }
        e.separate_children_from_rest = separate_children_from_rest;
        function renderable_to_node(r, null_as_comment = false) {
            if (r == null)
                return null_as_comment ? document.createComment(' null ') : null;
            else if (typeof r === 'string' || typeof r === 'number')
                return document.createTextNode(r.toString());
            else if (o.isReadonlyObservable(r))
                return Display(r);
            else if (Array.isArray(r)) {
                var df = document.createDocumentFragment();
                for (var i = 0, l = r.length; i < l; i++) {
                    var r2 = renderable_to_node(r[i], null_as_comment);
                    if (r2)
                        df.appendChild(r2);
                }
                return df;
            }
            else if (is_renderable_object(r)) {
                return r[e.sym_render]();
            }
            else {
                return r;
            }
        }
        e.renderable_to_node = renderable_to_node;
        /**
         * @internal
         */
        function handle_decorator(node, decorator) {
            var res;
            var dec_iter = decorator;
            // while the decorator returns a decorator, keep calling it.
            while (typeof (res = dec_iter(node)) === 'function') {
                dec_iter = res;
            }
            // If it returns nothing or the node itself, don't do anything
            if (res == null || res === node)
                return;
            if (res instanceof Mixin) {
                node_add_mixin(node, res);
                return;
            }
            var nd = renderable_to_node(res);
            if (nd == null)
                return;
            var cmt = _decorator_map.get(decorator);
            // If there was no comment associated with this decorator, do nothing
            if (!cmt)
                return;
            // insert the resulting node right next to the comment
            insert_before_and_init(node, nd, cmt);
        }
        e.handle_decorator = handle_decorator;
        /**
         * Handle attributes for simple nodes
         * @internal
         */
        function handle_attrs(node, attrs, is_basic_node) {
            var keys = Object.keys(attrs);
            for (var i = 0, l = keys.length; i < l; i++) {
                var key = keys[i];
                if (key === 'class') {
                    var clss = attrs.class;
                    if (Array.isArray(clss))
                        for (var j = 0, lj = clss.length; j < lj; j++)
                            node_observe_class(node, clss[j]);
                    else
                        node_observe_class(node, attrs.class);
                }
                else if (key === 'style') {
                    node_observe_style(node, attrs.style);
                }
                else if (key === 'id' || is_basic_node) {
                    node_observe_attribute(node, key, attrs[key]);
                }
            }
        }
        e.handle_attrs = handle_attrs;
        function mkwrapper(elt) {
            return (...args) => {
                return e(elt, ...args);
            };
        }
        e.mkwrapper = mkwrapper;
        /** @internal */
        e.A = mkwrapper('a');
        /** @internal */
        e.ABBR = mkwrapper('abbr');
        /** @internal */
        e.ADDRESS = mkwrapper('address');
        /** @internal */
        e.AREA = mkwrapper('area');
        /** @internal */
        e.ARTICLE = mkwrapper('article');
        /** @internal */
        e.ASIDE = mkwrapper('aside');
        /** @internal */
        e.AUDIO = mkwrapper('audio');
        /** @internal */
        e.B = mkwrapper('b');
        /** @internal */
        e.BASE = mkwrapper('base');
        /** @internal */
        e.BDI = mkwrapper('bdi');
        /** @internal */
        e.BDO = mkwrapper('bdo');
        /** @internal */
        e.BIG = mkwrapper('big');
        /** @internal */
        e.BLOCKQUOTE = mkwrapper('blockquote');
        /** @internal */
        e.BODY = mkwrapper('body');
        /** @internal */
        e.BR = mkwrapper('br');
        /** @internal */
        e.BUTTON = mkwrapper('button');
        /** @internal */
        e.CANVAS = mkwrapper('canvas');
        /** @internal */
        e.CAPTION = mkwrapper('caption');
        /** @internal */
        e.CITE = mkwrapper('cite');
        /** @internal */
        e.CODE = mkwrapper('code');
        /** @internal */
        e.COL = mkwrapper('col');
        /** @internal */
        e.COLGROUP = mkwrapper('colgroup');
        /** @internal */
        e.DATA = mkwrapper('data');
        /** @internal */
        e.DATALIST = mkwrapper('datalist');
        /** @internal */
        e.DD = mkwrapper('dd');
        /** @internal */
        e.DEL = mkwrapper('del');
        /** @internal */
        e.DETAILS = mkwrapper('details');
        /** @internal */
        e.DFN = mkwrapper('dfn');
        /** @internal */
        e.DIALOG = mkwrapper('dialog');
        /** @internal */
        e.DIV = mkwrapper('div');
        /** @internal */
        e.DL = mkwrapper('dl');
        /** @internal */
        e.DT = mkwrapper('dt');
        /** @internal */
        e.EM = mkwrapper('em');
        /** @internal */
        e.EMBED = mkwrapper('embed');
        /** @internal */
        e.FIELDSET = mkwrapper('fieldset');
        /** @internal */
        e.FIGCAPTION = mkwrapper('figcaption');
        /** @internal */
        e.FIGURE = mkwrapper('figure');
        /** @internal */
        e.FOOTER = mkwrapper('footer');
        /** @internal */
        e.FORM = mkwrapper('form');
        /** @internal */
        e.H1 = mkwrapper('h1');
        /** @internal */
        e.H2 = mkwrapper('h2');
        /** @internal */
        e.H3 = mkwrapper('h3');
        /** @internal */
        e.H4 = mkwrapper('h4');
        /** @internal */
        e.H5 = mkwrapper('h5');
        /** @internal */
        e.H6 = mkwrapper('h6');
        /** @internal */
        e.HEAD = mkwrapper('head');
        /** @internal */
        e.HEADER = mkwrapper('header');
        /** @internal */
        e.HR = mkwrapper('hr');
        /** @internal */
        e.HTML = mkwrapper('html');
        /** @internal */
        e.I = mkwrapper('i');
        /** @internal */
        e.IFRAME = mkwrapper('iframe');
        /** @internal */
        e.IMG = mkwrapper('img');
        /** @internal */
        e.INPUT = mkwrapper('input');
        /** @internal */
        e.INS = mkwrapper('ins');
        /** @internal */
        e.KBD = mkwrapper('kbd');
        /** @internal */
        e.KEYGEN = mkwrapper('keygen');
        /** @internal */
        e.LABEL = mkwrapper('label');
        /** @internal */
        e.LEGEND = mkwrapper('legend');
        /** @internal */
        e.LI = mkwrapper('li');
        /** @internal */
        e.LINK = mkwrapper('link');
        /** @internal */
        e.MAIN = mkwrapper('main');
        /** @internal */
        e.MAP = mkwrapper('map');
        /** @internal */
        e.MARK = mkwrapper('mark');
        /** @internal */
        e.MENU = mkwrapper('menu');
        /** @internal */
        e.MENUITEM = mkwrapper('menuitem');
        /** @internal */
        e.META = mkwrapper('meta');
        /** @internal */
        e.METER = mkwrapper('meter');
        /** @internal */
        e.NAV = mkwrapper('nav');
        /** @internal */
        e.NOSCRIPT = mkwrapper('noscript');
        /** @internal */
        e.OBJECT = mkwrapper('object');
        /** @internal */
        e.OL = mkwrapper('ol');
        /** @internal */
        e.OPTGROUP = mkwrapper('optgroup');
        /** @internal */
        e.OPTION = mkwrapper('option');
        /** @internal */
        e.OUTPUT = mkwrapper('output');
        /** @internal */
        e.P = mkwrapper('p');
        /** @internal */
        e.PARAM = mkwrapper('param');
        /** @internal */
        e.PICTURE = mkwrapper('picture');
        /** @internal */
        e.PRE = mkwrapper('pre');
        /** @internal */
        e.PROGRESS = mkwrapper('progress');
        /** @internal */
        e.Q = mkwrapper('q');
        /** @internal */
        e.RP = mkwrapper('rp');
        /** @internal */
        e.RT = mkwrapper('rt');
        /** @internal */
        e.RUBY = mkwrapper('ruby');
        /** @internal */
        e.S = mkwrapper('s');
        /** @internal */
        e.SAMP = mkwrapper('samp');
        /** @internal */
        e.SCRIPT = mkwrapper('script');
        /** @internal */
        e.SECTION = mkwrapper('section');
        /** @internal */
        e.SELECT = mkwrapper('select');
        /** @internal */
        e.SMALL = mkwrapper('small');
        /** @internal */
        e.SOURCE = mkwrapper('source');
        /** @internal */
        e.SPAN = mkwrapper('span');
        /** @internal */
        e.STRONG = mkwrapper('strong');
        /** @internal */
        e.STYLE = mkwrapper('style');
        /** @internal */
        e.SUB = mkwrapper('sub');
        /** @internal */
        e.SUMMARY = mkwrapper('summary');
        /** @internal */
        e.SUP = mkwrapper('sup');
        /** @internal */
        e.TABLE = mkwrapper('table');
        /** @internal */
        e.TBODY = mkwrapper('tbody');
        /** @internal */
        e.TD = mkwrapper('td');
        /** @internal */
        e.TEXTAREA = mkwrapper('textarea');
        /** @internal */
        e.TFOOT = mkwrapper('tfoot');
        /** @internal */
        e.TH = mkwrapper('th');
        /** @internal */
        e.THEAD = mkwrapper('thead');
        /** @internal */
        e.TIME = mkwrapper('time');
        /** @internal */
        e.TITLE = mkwrapper('title');
        /** @internal */
        e.TR = mkwrapper('tr');
        /** @internal */
        e.TRACK = mkwrapper('track');
        /** @internal */
        e.U = mkwrapper('u');
        /** @internal */
        e.UL = mkwrapper('ul');
        /** @internal */
        e.VAR = mkwrapper('var');
        /** @internal */
        e.VIDEO = mkwrapper('video');
        /** @internal */
        e.WBR = mkwrapper('wbr');
        /**
         * An alias to conform to typescript's JSX
         * @internal
         */
        e.createElement = e;
        /** @internal */
        e.Fragment = $; //(at: Attrs, ch: DocumentFragment): e.JSX.Element
    })(e || (e = {}));
    if ('undefined' !== typeof window && typeof window.E === 'undefined' || typeof global !== 'undefined' && typeof (global.E) === 'undefined') {
        window.E = e;
    }

    /**
     * Control structures to help with readability.
     */
    /**
     * @category dom, toc
     *
     * Display content depending on the value of a `condition`, which can be an observable.
     *
     * If `condition` is not an observable, then the call to `If` is resolved immediately without using
     * an intermediary observable.
     *
     * If `condition` is readonly, then the observables given to `display` and `display_otherwise` are
     * Readonly as well.
     *
     * For convenience, the truth value is given typed as a `o.Observable<NonNullable<...>>` in `display`,
     * since there is no way `null` or `undefined` could make their way here.
     *
     * ```tsx
     * // o_obj is nullable.
     * const o_obj = o({a: 'hello'} as {a: string} | null)
     *
     * If(o_obj,
     *   // o_truthy here is o.Observable<{a: string}>
     *   // which is why we can safely use .p('a') without typescript complaining
     *   o_truthy => <>{o_truthy.p('a')}
     * )
     * ```
     *
     * ```tsx
     *  import { o, If, $click } from 'elt'
     *
     *  const o_some_obj = o({prop: 'value!'} as {prop: string} | null)
     *
     *  document.body.appendChild(<div>
     *    <h1>An If example</h1>
     *    <div><button>
     *     {$click(() => {
     *       o_some_obj.mutate(v => !!v ? null : {prop: 'clicked'})
     *     })}
     *     Inverse
     *   </button></div>
     *   {If(o_some_obj,
     *     // Here, o_truthy is of type Observable<{prop: string}>, without the null
     *     // We can thus safely take its property, which is a Renderable (string), through the .p() method.
     *     o_truthy => <div>We have a {o_truthy.p('prop')}</div>,
     *     () => <div>Value is null</div>
     *   )}
     *  </div>)
     * ```
     */
    function If(condition, display, display_otherwise) {
        // ts bug on condition.
        if (typeof display === 'function' && !(condition instanceof o.Observable)) {
            return condition ?
                e.renderable_to_node(display(condition), true)
                : e.renderable_to_node(display_otherwise ?
                    (display_otherwise(null))
                    : document.createComment('false'), true);
        }
        return e(document.createComment('If'), new If.ConditionalDisplayer(display, condition, display_otherwise));
    }
    (function (If) {
        /**
         * Implementation of the `DisplayIf()` verb.
         * @internal
         */
        class ConditionalDisplayer extends Displayer {
            constructor(display, condition, display_otherwise) {
                super(condition.tf((cond, old, v) => {
                    if (old !== o.NoValue && !!cond === !!old && v !== o.NoValue)
                        return v;
                    if (cond) {
                        return display(condition);
                    }
                    else if (display_otherwise) {
                        return display_otherwise(condition);
                    }
                    else {
                        return null;
                    }
                }));
                this.display = display;
                this.condition = condition;
                this.display_otherwise = display_otherwise;
            }
        }
        If.ConditionalDisplayer = ConditionalDisplayer;
    })(If || (If = {}));
    /**
     * @category dom, toc
     *
     * Repeats the `render` function for each element in `ob`, optionally separating each rendering
     * with the result of the `separator` function.
     *
     * If `ob` is an observable, `Repeat` will update the generated nodes to match the changes.
     * If it is a `o.ReadonlyObservable`, then the `render` callback will be provided a read only observable.
     *
     * `ob` is not converted to an observable if it was not one, in which case the results are executed
     * right away and only once.
     *
     * ```tsx
     * import { o, Repeat, $click } from 'elt'
     *
     * const o_mylist = o(['hello', 'world'])
     *
     * document.body.appendChild(<div>
     *   {Repeat(
     *      o_mylist,
     *      o_item => <button>
     *        {$click(ev => o_item.mutate(value => value + '!'))}
     *        {o_item}
     *      </button>,
     *      () => ', '
     *   )}
     * </div>)
     * ```
     */
    function Repeat(ob, render, separator) {
        if (!(ob instanceof o.Observable)) {
            const arr = ob;
            var df = document.createDocumentFragment();
            for (var i = 0, l = arr.length; i < l; i++) {
                df.appendChild(e.renderable_to_node(render(arr[i], i), true));
                if (i > 1 && separator) {
                    df.appendChild(e.renderable_to_node(separator(i - 1), true));
                }
            }
            return df;
        }
        return e(document.createComment('Repeat'), new Repeat.Repeater(ob, render, separator));
    }
    (function (Repeat) {
        /**
         *  Repeats content.
         * @internal
         */
        class Repeater extends Mixin {
            constructor(ob, renderfn, separator) {
                super();
                this.renderfn = renderfn;
                this.separator = separator;
                this.positions = [];
                this.next_index = 0;
                this.lst = [];
                this.child_obs = [];
                this.obs = o(ob);
            }
            init() {
                this.observe(this.obs, lst => {
                    this.lst = lst || [];
                    const diff = lst.length - this.next_index;
                    if (diff < 0)
                        this.removeChildren(-diff);
                    if (diff > 0)
                        this.appendChildren(diff);
                });
            }
            /**
             * Generate the next element to append to the list.
             */
            next(fr) {
                if (this.next_index >= this.lst.length)
                    return false;
                // here, we *KNOW* it represents a defined value.
                var ob = this.obs.p(this.next_index);
                this.child_obs.push(ob);
                if (this.separator && this.next_index > 0) {
                    var sep = e.renderable_to_node(this.separator(this.next_index));
                    if (sep)
                        fr.appendChild(sep);
                }
                var node = e.renderable_to_node(this.renderfn(ob, this.next_index), true);
                this.positions.push(node instanceof DocumentFragment ? node.lastChild : node);
                fr.appendChild(node);
                this.next_index++;
                return true;
            }
            appendChildren(count) {
                var _a;
                const parent = this.node.parentNode;
                if (!parent)
                    return;
                const insert_point = this.positions.length === 0 ? this.node.nextSibling : (_a = this.positions[this.positions.length - 1]) === null || _a === void 0 ? void 0 : _a.nextSibling;
                var fr = document.createDocumentFragment();
                while (count-- > 0) {
                    if (!this.next(fr))
                        break;
                }
                insert_before_and_init(parent, fr, insert_point);
            }
            removeChildren(count) {
                var _a;
                if (this.next_index === 0 || count === 0)
                    return;
                // Détruire jusqu'à la position concernée...
                this.next_index = this.next_index - count;
                node_remove_after((_a = this.positions[this.next_index - 1]) !== null && _a !== void 0 ? _a : this.node, this.positions[this.positions.length - 1]);
                this.child_obs = this.child_obs.slice(0, this.next_index);
                this.positions = this.positions.slice(0, this.next_index);
            }
        }
        Repeat.Repeater = Repeater;
    })(Repeat || (Repeat = {}));
    /**
     * Similarly to `Repeat`, `RepeatScroll` repeats the `render` function for each element in `ob`,
     * optionally separated by the results of `separator`, until the elements overflow past the
     * bottom border of the current parent marked `overflow-y: auto`.
     *
     * As the user scrolls, new items are being added. Old items are *not* discarded and stay above.
     *
     * It will generate `scroll_buffer_size` elements at a time (or 10 if not specified), waiting for
     * the next repaint with `requestAnimationFrame()` between chunks.
     *
     * Unlike `Repeat`, `RepeatScroll` turns `ob` into an `Observable` internally even if it wasn't one.
     *
     * > **Note** : while functional, RepeatScroll is not perfect. A "VirtualScroll" behaviour is in the
     * > roadmap to only maintain the right amount of elements on screen.
     *
     * ```tsx
     * @include ../examples/repeatscroll.tsx
     * ```
     *
     * @category dom, toc
     */
    function RepeatScroll(ob, render, options = {}) {
        // we cheat the typesystem, which is not great, but we know what we're doing.
        return e(document.createComment('RepeatScroll'), new RepeatScroll.ScrollRepeater(o(ob), render, options));
    }
    (function (RepeatScroll) {
        /**
         * Repeats content and append it to the DOM until a certain threshold
         * is meant. Use it with `scrollable()` on the parent..
         * @internal
         */
        class ScrollRepeater extends Repeat.Repeater {
            constructor(ob, renderfn, options) {
                var _a, _b;
                super(ob, renderfn);
                this.options = options;
                this.parent = null;
                this.scroll_buffer_size = (_a = this.options.scroll_buffer_size) !== null && _a !== void 0 ? _a : 10;
                this.threshold_height = (_b = this.options.threshold_height) !== null && _b !== void 0 ? _b : 500;
                // Have to type this manually since dts-bundler chokes on Renderable
                this.separator = this.options.separator;
                this.onscroll = () => {
                    if (!this.parent)
                        return;
                    this.appendChildren();
                };
            }
            /**
             * Append `count` children if the parent was not scrollable (just like Repeater),
             * or append elements until we've added past the bottom of the container.
             */
            appendChildren() {
                if (!this.parent)
                    // if we have no scrollable parent (yet, if just inited), then just append items
                    return super.appendChildren(this.scroll_buffer_size);
                // Instead of appending all the count, break it down to bufsize packets.
                const bufsize = this.scroll_buffer_size;
                const p = this.parent;
                const append = () => {
                    if (this.next_index < this.lst.length && p.scrollHeight - (p.clientHeight + p.scrollTop) < this.threshold_height) {
                        super.appendChildren(bufsize);
                        requestAnimationFrame(append);
                    }
                };
                // We do not try appending immediately ; some observables may modify current
                // items height right after this function ends, which can lead to a situation
                // where we had few elements that were very high and went past the threshold
                // that would get very small suddenly, but since they didn't get the chance
                // to do that, append stops because it is past the threshold right now and
                // thus leaves a lot of blank space.
                requestAnimationFrame(append);
            }
            inserted() {
                // do not process this if the node is not inserted.
                if (!this.node.isConnected)
                    return;
                // Find parent with the overflow-y
                var iter = this.node.parentElement;
                while (iter) {
                    var style = getComputedStyle(iter);
                    if (style.overflowY === 'auto' || style.msOverflowY === 'auto' || style.msOverflowY === 'scrollbar') {
                        this.parent = iter;
                        break;
                    }
                    iter = iter.parentElement;
                }
                if (!this.parent) {
                    console.warn(`Scroll repeat needs a parent with overflow-y: auto`);
                    this.appendChildren();
                    return;
                }
                this.parent.addEventListener('scroll', this.onscroll);
                this.observe(this.obs, lst => {
                    this.lst = lst || [];
                    const diff = lst.length - this.next_index;
                    if (diff < 0)
                        this.removeChildren(-diff);
                    if (diff > 0)
                        this.appendChildren();
                });
            }
            removed() {
                // remove Scrolling
                if (!this.parent)
                    return;
                this.parent.removeEventListener('scroll', this.onscroll);
                this.parent = null;
            }
        }
        RepeatScroll.ScrollRepeater = ScrollRepeater;
    })(RepeatScroll || (RepeatScroll = {}));
    function Switch(obs) {
        return new Switch.Switcher(obs);
    }
    (function (Switch) {
        /**
         * @internal
         */
        class Switcher extends o.CombinedObservable {
            constructor(obs) {
                super([obs]);
                this.obs = obs;
                this.cases = [];
                this.passthrough = () => null;
                this.prev_case = null;
                this.prev = '';
            }
            getter([nval]) {
                const cases = this.cases;
                for (var c of cases) {
                    const val = c[0];
                    if (val === nval || (typeof val === 'function' && val(nval))) {
                        if (this.prev_case === val) {
                            return this.prev;
                        }
                        this.prev_case = val;
                        const fn = c[1];
                        return (this.prev = fn(this.obs));
                    }
                }
                if (this.prev_case === this.passthrough)
                    return this.prev;
                this.prev_case = this.passthrough;
                return (this.prev = this.passthrough ? this.passthrough() : null);
            }
            Case(value, fn) {
                this.cases.push([value, fn]);
                return this;
            }
            Else(fn) {
                this.passthrough = fn;
                return this;
            }
        }
        Switch.Switcher = Switcher;
    })(Switch || (Switch = {}));

    var __awaiter = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
        function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    };
    /**
     * An App is a collection of services that altogether form an application.
     * These services contain code, data and views that produce DOM elements.
     *
     * Use [[App.DisplayApp]] to instanciate an App and [[App#DisplayChildApp]] for child apps.
     *
     * An `App` needs to be provided a view name (see [[App.view]]) which will be the main
     * view that the `App` displays, and one or several service classes (not objects), that are
     * to be "activated", which means they will be instanciated and serve as the base services
     * that will be searched for the main view to render it. As Services can require other services,
     * and those services also can define views, `App` will look in them as well for the main view
     * and will stop at the first one it finds.
     *
     * Services are singletons ; once required, any subsequent [[Service#require]] on a same service
     * class will return the same instance (not always true for child apps).
     *
     * During the life of the application, the list of activated services can change using [[App#activate]],
     * in which case the views will be reevaluated using the same "first one that has it" rule.
     *
     * As the activated services change, so do their requirements. Services that were instanciated
     * but are not required anymore are thus removed. See [[Service#deinit]].
     *
     * **Why the app class**
     *
     * While [[Component]]s and their functional counterparts are a nice way of displaying data and
     * somewhat handling some simple states, they should never perform network calls or in general even be *aware* of any kind of network,
     * or query `localStorage`, or do anything other than just do what it was meant to do ; create
     * DOM Nodes to render some data, and signal the program that some user interaction has taken place.
     *
     * More precisely ; Components should not deal with anything that has side effects.
     *
     * The `App` class and its [[App.Service]] friend are a proposal to separate pure presentation from *business logic*.
     * Services can still have a visual role, but it is more about *layout* than display. They don't even have
     * to do anything visual ; a Service could for instance handle network calls exclusively for instance.
     *
     * The idea is that an `App` is created *by composition* ; it is the sum of its services, and they can change
     * during its life time.
     *
     * In a way, Services are *modules*, except they are loaded and unloaded dynamically as the application
     * is used. They also encapsulate state neatly, and it is perfectly possible to have several `Apps` on the
     * same page that never share data, or several that do using "child" apps.
     *
     * @category app, toc
     */
    class App extends Mixin {
        /** @internal */
        constructor(main_view, _parent_app) {
            super();
            this.main_view = main_view;
            this._parent_app = _parent_app;
            /** @internal */
            this._cache = new Map();
            /** @internal */
            this._active_services = new Set();
            /** @internal */
            this._children_app = new Set();
            /**
             * The currently active services, ie. the services that were specifically
             * given to [[#App.DisplayApp]] or [[App#activate]]
             */
            this.o_active_services = o(this._active_services);
            /**
             * For a given view name, get the service that defines it
             * @internal
             */
            this.o_view_services = o(new Map());
        }
        /** @internal */
        inserted() {
            var _a;
            // Tell our parent that we exist.
            // Now, when cleaning up, the parent will check that it doesn't remove a service
            // that the child needs.
            (_a = this._parent_app) === null || _a === void 0 ? void 0 : _a._children_app.add(this);
        }
        /** @internal */
        removed() {
            // When removed, unregister ourselves from our parent app, the services we had registered
            // now no longer hold a requirement in the parent app's cache.
            if (this._parent_app)
                this._parent_app._children_app.delete(this);
        }
        getService(key, init_if_not_found = true) {
            // First try to see if we already own a version of this service.
            var cached = this._cache.get(key);
            if (cached)
                return cached;
            // Try our parent app before trying to init it ourselves.
            if (this._parent_app) {
                // In the parent app however, we won't try to instanciate anything if it is not found
                cached = this._parent_app.getService(key, false);
                if (cached)
                    return cached;
            }
            if (init_if_not_found) {
                if (key.length > 1) {
                    // Services take no arguments in their constructors, so this is a bogus require.
                    throw new Error(`Trying to instanciate a service that requires arguments. Services should only have one`);
                }
                var result = new key(this);
                if (!result.unique_across_all_apps) {
                    this._cache.set(key, result);
                }
                else {
                    var _ap = this;
                    while (_ap._parent_app) {
                        _ap = _ap._parent_app;
                    }
                    _ap._cache.set(key, result);
                }
                return result;
            }
        }
        /**
         * @internal
         */
        getServicesInRequirementOrder(active_services) {
            var services = new Set(active_services);
            for (var bl of services) {
                for (var ch of bl._requirements) {
                    services.add(ch);
                }
            }
            return services;
        }
        /**
         * Get the views defined by our currently active services
         * @internal
         */
        getViews() {
            var res = new Map();
            for (var service of this.getServicesInRequirementOrder(this.o_active_services.get())) {
                const views = service.constructor._views;
                if (!views)
                    continue;
                for (var name of views) {
                    if (!res.has(name))
                        res.set(name, service);
                }
            }
            return res;
        }
        /**
         * Remove services that are not required anymore by the current activated services
         * or any of their requirements. Call deinit() on the services that are removed.
         * @internal
         */
        cleanup() {
            var kept_services = new Set();
            function keep(b) {
                if (kept_services.has(b))
                    return;
                kept_services.add(b);
                for (var req of b._requirements) {
                    keep(req);
                }
            }
            // We start by tagging services to know which are the active ones
            // as well as their dependencies.
            for (var bl of this._active_services) {
                keep(bl);
            }
            for (var ch of this._children_app) {
                for (var bl of ch._active_services)
                    keep(bl);
            }
            // Once we know who to keep, we remove those that were not tagged.
            for (var [key, service] of this._cache) {
                if (!kept_services.has(service) && !service.persistent) {
                    this._cache.delete(key);
                    service._deinit();
                }
            }
        }
        /**
         * Activate services to change the application's state.
         *
         * See [[App.view]] for an example.
         */
        activate(...new_services) {
            const active = this._active_services;
            const new_active_services = new Set();
            var already_has_services = true;
            // first check for the asked new_services if
            for (var b of new_services) {
                const instance = this._cache.get(b);
                if (!instance || !active.has(instance)) {
                    already_has_services = false;
                    break;
                }
            }
            // do not activate if the active services are already activated
            if (already_has_services)
                return;
            var previous_cache = new Map(this._cache);
            try {
                for (var b of new_services) {
                    var bl = this.getService(b);
                    new_active_services.add(bl);
                }
            }
            catch (e) {
                // cancel activating the new service
                console.warn(e);
                this._cache = previous_cache;
                throw e;
            }
            this._active_services = new_active_services;
            for (var service of new_active_services)
                service._activate();
            // remove dead services
            this.cleanup();
            o.transaction(() => {
                this.o_active_services.set(new_active_services);
                var views = this.getViews();
                this.o_view_services.set(views);
            });
        }
        /**
         * Display the specified `view_name`.
         *
         * ```tsx
         * @include ../examples/app.display.tsx
         * ```
         */
        display(view_name) {
            return Display(this.o_view_services.tf(v => {
                return v.get(view_name);
                // we use another tf to not retrigger the display if the service implementing the view did
                // not change.
            }).tf(service => {
                if (!service) {
                    console.warn(`view ${view_name} was not found, cannot display it`);
                    return undefined;
                }
                // unfortunately, we can't specify that view_name here accesses
                // a () => Renderable function, so we cheat.
                return service[view_name]();
            }));
        }
        /**
         * Display an App that depends on this one, displaying `view_name` as its main view
         * and activating the service classes passed in `services`.
         *
         * Services in the child app that require other services will query the parent [[App]] first. If the
         * parent does not have the service, then the child app is queried. If the service does not exist, the
         * child app instanciates its own version.
         *
         * Activated services through `this.app.activate` in a child app are instanciated even if they already exist
         * in the parent app.
         *
         * ```tsx
         * @include ../examples/app.subapp.tsx
         * ```
         */
        DisplayChildApp(view_name, ...services) {
            var newapp = new App(view_name, this);
            var res = newapp.display(view_name);
            newapp.activate(...services);
            node_add_mixin(res, newapp);
            return res;
        }
    }
    (function (App) {
        /**
         * Display an application with the specified `#App.Service`s as activated services, displaying
         * the `main_view` view.
         *
         * The app will look for the first service that implements the asked view in the requirement chain. See [[App.view]] for details.
         *
         * ```tsx
         * import { App } from 'elt'
         *
         * class LoginService extends App.Service {
         *   @App.view
         *   Main() {
         *     return <div>
         *       <SomeLoginForm/>
         *     </div>
         *   }
         * }
         *
         * document.body.appendChild(
         *   App.DisplayApp('Main', LoginService)
         * )
         * ```
         *
         * @category app, toc
         */
        function DisplayApp(main_view, ...services) {
            var app = new App(main_view);
            var disp = app.display(main_view);
            app.activate(...services);
            node_add_mixin(disp, app);
            return disp;
        }
        App.DisplayApp = DisplayApp;
        /**
         * @category app, toc
         *
         * This is a method decorator. It marks a method of a service as a view that can be displayed with [[App.DisplayApp]]
         * or [[App.Service#display]].
         *
         * Views are always a function with no arguments that return a Renderable.
         *
         * Starting with the activated services, and going up the [[Service.require]] calls, [[App]]
         * uses the first view that matches the name it's looking for and uses it to display its
         * contents.
         *
         * ```tsx
         * @include ../examples/app.view.tsx
         * ```
         */
        function view(object, key, desc) {
            var _a;
            const cons = object.constructor;
            (cons._views = (_a = cons._views) !== null && _a !== void 0 ? _a : new Set()).add(key);
        }
        App.view = view;
        /**
         * A base class to make application services.
         *
         * A service defines views through `this.view` and reacts to
         *
         * An ObserverHolder, Services can use `this.observe` to watch `#o.Observable`s and will
         * only actively watch them as long as they're either *activated* or in the *requirements* of
         * an activated service.
         *
         * Services are meant to be used by *composition*, and not through extension.
         * Do not subclass a subclass of Service unless its state is the exact same type.
         *
         * @category app, toc
         */
        class Service extends o.ObserverHolder {
            /**
             * A service is not meant to be instanciated by hand. Also, classes that subclass [[Service]]
             *  should never have any other arguments than just an [[App]] instance.
             */
            constructor(app) {
                super();
                this.app = app;
                /**
                 * A promise that is resolved once the service's `init()` has been called.
                 * Used
                 */
                this.init_promise = null;
                /** @internal */
                this._requirements = new Set();
            }
            /**
             * Wait for all the required services to init
             * @internal
             */
            _init() {
                return __awaiter(this, void 0, void 0, function* () {
                    if (this.init_promise) {
                        yield this.init_promise;
                        return;
                    }
                    // This is where we wait for all the required services to end their init.
                    // Now we can init.
                    this.init_promise = Promise.all([...this._requirements].map(b => b._init())).then(() => this.init());
                    yield this.init_promise;
                    this.startObservers();
                });
            }
            /** @internal */
            _activate() {
                return __awaiter(this, void 0, void 0, function* () {
                    yield this._init();
                    yield this.activated();
                });
            }
            /** @internal */
            _deinit() {
                return __awaiter(this, void 0, void 0, function* () {
                    this.stopObservers();
                    this.deinit();
                });
            }
            /**
             * Extend this method to run code whenever after the `init()` methods
             * of the its requirements have returned. If it had no requirements, then this method is
             * run shortly after the Service's instanciation.
             *
             * The `init` chain is started on [[App#activate]]. However, the views start displaying immediately,
             * which means that in all likelyhood, `init()` for a service will terminate **after** the DOM
             * from the views was inserted.
             *
             * If you need to run code **before** the views are displayed, overload the `constructor`.
             */
            init() {
                return __awaiter(this, void 0, void 0, function* () { });
            }
            /**
             * Extend this method to run code whenever the service is *activated* directly (ie: passed as an
             * argument to the `app.activate()` method).
             */
            activated() {
                return __awaiter(this, void 0, void 0, function* () { });
            }
            /**
             * Extend this method to run code whenever this service is removed from the app.
             *
             * A service is said to be removed from the app if it is not required by any other service.
             */
            deinit() {
                return __awaiter(this, void 0, void 0, function* () { });
            }
            /**
             * Require another service for this service to use.
             *
             * If the requested service does not already exist within this [[App]], instanciate it.
             *
             * See [[App.DisplayChildApp]] and [[App.view]] for examples.
             */
            require(service_def) {
                var result = this.app.getService(service_def);
                this._requirements.add(result);
                return result;
            }
        }
        App.Service = Service;
    })(App || (App = {}));

    exports.$class = $class;
    exports.$click = $click;
    exports.$id = $id;
    exports.$init = $init;
    exports.$inserted = $inserted;
    exports.$observe = $observe;
    exports.$on = $on;
    exports.$props = $props;
    exports.$removed = $removed;
    exports.$scrollable = $scrollable;
    exports.$style = $style;
    exports.$title = $title;
    exports.App = App;
    exports.CommentContainer = CommentContainer;
    exports.Component = Component;
    exports.Display = Display;
    exports.Displayer = Displayer;
    exports.Fragment = Fragment;
    exports.If = If;
    exports.Mixin = Mixin;
    exports.Repeat = Repeat;
    exports.RepeatScroll = RepeatScroll;
    exports.Switch = Switch;
    exports.append_child_and_init = append_child_and_init;
    exports.e = e;
    exports.insert_before_and_init = insert_before_and_init;
    exports.node_add_event_listener = node_add_event_listener;
    exports.node_add_mixin = node_add_mixin;
    exports.node_add_observer = node_add_observer;
    exports.node_do_init = node_do_init;
    exports.node_do_inserted = node_do_inserted;
    exports.node_do_remove = node_do_remove;
    exports.node_is_inited = node_is_inited;
    exports.node_is_inserted = node_is_inserted;
    exports.node_is_observing = node_is_observing;
    exports.node_observe = node_observe;
    exports.node_observe_attribute = node_observe_attribute;
    exports.node_observe_class = node_observe_class;
    exports.node_observe_style = node_observe_style;
    exports.node_off = node_off;
    exports.node_on = node_on;
    exports.node_remove_after = node_remove_after;
    exports.node_remove_mixin = node_remove_mixin;
    exports.node_unobserve = node_unobserve;
    exports.o = o;
    exports.remove_node = remove_node;
    exports.setup_mutation_observer = setup_mutation_observer;
    exports.sym_init = sym_init;
    exports.sym_inserted = sym_inserted;
    exports.sym_mixins = sym_mixins;
    exports.sym_mount_status = sym_mount_status;
    exports.sym_observers = sym_observers;
    exports.sym_removed = sym_removed;

    Object.defineProperty(exports, '__esModule', { value: true });

})));
//# sourceMappingURL=elt.js.map
