/**
 * SelectionManager — headless selection state for graph nodes.
 *
 * Owns all selection concerns so the UI layer only subscribes to events
 * rather than managing its own parallel selection state.
 *
 * Instantiate with a GraphStore reference so it can auto-deselect
 * when nodes are removed.
 *
 * Events emitted:
 *   'selection:changed'  { selected, lastSelected, lastDeselected,
 *                          isMulti, compositeUid, compositeLabel }
 */

import { EventBus } from './event-bus.js';

export class SelectionManager extends EventBus {
    #selected = new Map();   // uid → node
    #lastSelected   = null;
    #lastDeselected = null;
    #store;

    /**
     * @param {import('./graph-store.js').GraphStore} store
     */
    constructor(store) {
        super();
        this.#store = store;

        // Auto-deselect nodes that are removed from the graph
        store.on('node:removed', ({ uid }) => {
            if (this.#selected.has(uid)) {
                this.#lastDeselected = this.#selected.get(uid);
                this.#selected.delete(uid);
                this.#emit();
            }
        });
    }

    // ─── Selection API ────────────────────────────────────────────────────────

    /**
     * Select a node.
     * @param {string}  uid
     * @param {object}  [opts]
     * @param {boolean} [opts.addToSelection=false]  If false, clears previous selection first.
     */
    select(uid, { addToSelection = false } = {}) {
        const node = this.#store.getNode(uid);
        if (!node) return;

        if (!addToSelection) {
            this.#selected.forEach(n => { this.#lastDeselected = n; });
            this.#selected.clear();
        }

        this.#selected.set(uid, node);
        this.#lastSelected = node;
        this.#emit();
    }

    /**
     * Deselect a node. No-op if it wasn't selected.
     */
    deselect(uid) {
        if (!this.#selected.has(uid)) return;
        this.#lastDeselected = this.#selected.get(uid);
        this.#selected.delete(uid);
        this.#emit();
    }

    /**
     * Toggle selection of a node.
     */
    toggle(uid, { addToSelection = false } = {}) {
        if (this.#selected.has(uid)) {
            this.deselect(uid);
        } else {
            this.select(uid, { addToSelection });
        }
    }

    /**
     * Clear all selections.
     * @param {string[]} [excludeUids]  UIDs to keep selected.
     */
    clear(excludeUids = []) {
        if (!this.#selected.size) return;   // nothing selected — fast no-op

        let changed = false;
        if (excludeUids.length) {
            for (const uid of [...this.#selected.keys()]) {
                if (!excludeUids.includes(uid)) {
                    this.#lastDeselected = this.#selected.get(uid);
                    this.#selected.delete(uid);
                    changed = true;
                }
            }
        } else {
            this.#selected.forEach(n => { this.#lastDeselected = n; });
            this.#selected.clear();
            changed = true;
        }
        if (changed) this.#emit();
    }

    // ─── Queries ──────────────────────────────────────────────────────────────

    getSelected()     { return [...this.#selected.values()]; }
    getSelectedUids() { return [...this.#selected.keys()]; }
    isSelected(uid)   { return this.#selected.has(uid); }
    get count()       { return this.#selected.size; }
    get isMulti()     { return this.#selected.size > 1; }
    get lastSelected()   { return this.#lastSelected; }
    get lastDeselected() { return this.#lastDeselected; }

    /**
     * Stable composite key for the current selection — useful for caching
     * or deciding whether to re-run a query.
     */
    get compositeUid() {
        return this.getSelectedUids().sort().join('|');
    }

    /**
     * Human-readable label for the current selection.
     */
    get compositeLabel() {
        return this.getSelected()
            .map(n => n.title || n.content?.slice(0, 20) || n.uid)
            .join(', ');
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    #emit() {
        this.emit('selection:changed', {
            selected:        this.getSelected(),
            lastSelected:    this.#lastSelected,
            lastDeselected:  this.#lastDeselected,
            isMulti:         this.isMulti,
            compositeUid:    this.compositeUid,
            compositeLabel:  this.compositeLabel,
        });
    }
}
