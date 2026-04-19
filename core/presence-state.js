/**
 * PresenceState — live per-actor state, derived from session events.
 *
 * While SessionLog is the historical record (everything that ever happened),
 * PresenceState is the current snapshot (what each actor is doing right now).
 * These are two distinct concerns that share the same event source.
 *
 * Designed for real-time rendering: cursor overlays, per-actor selection
 * highlights, connection indicators. The presentation layer subscribes to
 * 'presence:updated' and renders using ActorRegistry for display metadata
 * (color, nickname, avatar, etc.).
 *
 * Can be driven from multiple sources:
 *   - A SessionLog instance (subscribes to 'session:event')
 *   - Direct calls to updateCursor() / updateSelection() for the local actor
 *   - Remote events relayed through a SessionLog (network → record() → here)
 *
 * ─── Per-actor presence shape ─────────────────────────────────────────────────
 *
 *   {
 *     actorId   {string}         — matches ActorRegistry key and node.createdBy strings
 *     cursor    {object|null}    — { x, y } in SVG coordinate space, or null (off-canvas)
 *     selection {string[]}       — UIDs of nodes this actor currently has selected
 *     lastSeen  {number}         — epoch ms of the last recorded activity
 *   }
 *
 * Coordinates are always SVG-space (graph-absolute), never screen-space.
 * The presentation layer applies the same pan/zoom transform as everything else —
 * actor cursors correctly follow graph content at any zoom level.
 *
 * ─── Events emitted ───────────────────────────────────────────────────────────
 *
 *   'presence:updated'  { actorId, presence }  — on any per-actor state change
 */

import { EventBus } from './event-bus.js';

export class PresenceState extends EventBus {
    #presence    = new Map();  // actorId → presence object
    #unsubscribe = null;

    /**
     * @param {object} [options]
     * @param {object} [options.sessionLog]  SessionLog instance to subscribe to.
     *                                       cursor:moved and selection:changed events
     *                                       are automatically applied. All other events
     *                                       with a non-null actorId update lastSeen.
     */
    constructor(options = {}) {
        super();
        if (options.sessionLog) {
            this.#unsubscribe = options.sessionLog.on('session:event', e => this.#handleEvent(e));
        }
    }

    /**
     * Update the cursor position for an actor.
     *
     * Call this for the local actor from bindCursorCapture() results.
     * For remote actors, route through SessionLog.record() instead so the
     * event is also persisted in the log.
     *
     * @param {string}              actorId
     * @param {{x:number,y:number}|null} pos  SVG-space coordinates, or null to clear
     *                                         (actor moved off-canvas or disconnected)
     */
    updateCursor(actorId, pos) {
        this.#touch(actorId, { cursor: pos });
    }

    /**
     * Update the active selection for an actor.
     *
     * @param {string}   actorId
     * @param {string[]} uids  Currently selected node UIDs
     */
    updateSelection(actorId, uids) {
        this.#touch(actorId, { selection: uids });
    }

    /**
     * @param {string} actorId
     * @returns {object|undefined}
     */
    getPresence(actorId) {
        return this.#presence.get(actorId);
    }

    /** @returns {object[]} Presence objects for all known actors */
    getAll() {
        return [...this.#presence.values()];
    }

    /**
     * Actors with a non-null cursor (actively moving on the canvas).
     * Useful for the presentation layer to know which cursors to render.
     *
     * @returns {object[]}
     */
    getActiveCursors() {
        return [...this.#presence.values()].filter(p => p.cursor !== null);
    }

    destroy() {
        if (this.#unsubscribe) this.#unsubscribe();
        this.#unsubscribe = null;
        this.clear();  // EventBus: removes all registered listeners
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    #touch(actorId, updates) {
        const existing = this.#presence.get(actorId) ?? {
            actorId,
            cursor:    null,
            selection: [],
            lastSeen:  0,
        };
        const next = { ...existing, ...updates, lastSeen: Date.now() };
        this.#presence.set(actorId, next);
        this.emit('presence:updated', { actorId, presence: next });
        return next;
    }

    #handleEvent(event) {
        if (!event.actorId) return;

        if (event.type === 'cursor:moved') {
            this.updateCursor(event.actorId, event.payload ?? null);
        } else if (event.type === 'selection:changed') {
            this.updateSelection(event.actorId, event.payload.uids ?? []);
        } else {
            // Any event with a known actorId keeps lastSeen current
            this.#touch(event.actorId, {});
        }
    }
}
