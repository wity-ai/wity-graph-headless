/**
 * SessionLog — append-only event log for a graph session.
 *
 * A session is the raw, complete record of everything that happened on a graph:
 * mutations, interactions, cursor movements, agent actions, external events.
 * The graph itself is a curated projection of semantically significant events.
 * The session is the superset.
 *
 * Design principles:
 *   - Append-only: events are never modified or removed (immutable historical record)
 *   - Independent: works with or without a live GraphStore
 *   - If a GraphStore is provided, auto-captures all mutation events
 *   - Accepts external events via record() — cursors, selections, network events, etc.
 *   - Emits 'session:event' on every append so downstream consumers (PresenceState,
 *     analytics, replay) can react without polling
 *
 * ─── Event schema ─────────────────────────────────────────────────────────────
 *
 *   {
 *     id        {string}       — monotonic session-scoped identifier
 *     type      {string}       — event type string (see types below)
 *     actorId   {string|null}  — who caused this event; null = system / unknown
 *     timestamp {number}       — epoch ms
 *     payload   {object}       — type-specific data (see types below)
 *   }
 *
 * ─── Built-in event types ─────────────────────────────────────────────────────
 *
 * Auto-captured from GraphStore (when store option is provided):
 *   'nodes:changed'       payload: { uids: string[] }
 *   'node:removed'        payload: { uid, descendantUids: string[] }
 *   'node:moved'          payload: { uid, x, y }           ← SVG coordinate space
 *   'node:status-changed' payload: { uid, status }
 *   'edges:changed'       payload: { uids: string[] }
 *   'layout:computed'     payload: { nodeCount, edgeCount }
 *
 * Recorded by the presentation layer via record():
 *   'cursor:moved'        payload: { x, y }                ← SVG coordinate space
 *   'selection:changed'   payload: { uids: string[] }
 *   'viewport:panned'     payload: { x, y }
 *   'viewport:zoomed'     payload: { zoom }
 *
 * Any application-defined type string is accepted — the log is open.
 */

import { EventBus } from './event-bus.js';

let _counter = 0;
function nextId() { return `se-${++_counter}`; }

export class SessionLog extends EventBus {
    #events        = [];   // append-only array of event objects
    #unsubscribers = [];   // teardown handles for GraphStore subscriptions

    /**
     * @param {object}      [options]
     * @param {object}      [options.store]    GraphStore instance to auto-subscribe to.
     *                                         All mutation events are captured automatically.
     * @param {string|null} [options.actorId]  Default actorId stamped on auto-captured
     *                                         store events. Override per-record() call as needed.
     */
    constructor(options = {}) {
        super();
        if (options.store) {
            this.#subscribeToStore(options.store, options.actorId ?? null);
        }
    }

    /**
     * Record a single event into the log.
     *
     * This is the primary ingestion point for all event sources:
     * auto-captured store mutations, local cursor tracking, remote network events,
     * agent actions — anything that happened in this session.
     *
     * @param {object}      event
     * @param {string}      event.type
     * @param {object}      [event.payload={}]
     * @param {string|null} [event.actorId=null]
     * @param {number}      [event.timestamp]   Defaults to Date.now(). Pass an explicit
     *                                           value when ingesting historical/remote events.
     * @returns {object}  The stored event (id stamped)
     */
    record({ type, payload = {}, actorId = null, timestamp = Date.now() }) {
        const event = { id: nextId(), type, actorId, timestamp, payload };
        this.#events.push(event);
        this.emit('session:event', event);
        return event;
    }

    /**
     * Query the log with optional filters.
     * Returns a new array — the internal log is never exposed directly.
     *
     * @param {object}      [filters={}]
     * @param {string}      [filters.actorId]    — exact match on actorId
     * @param {string}      [filters.type]       — exact match on event type
     * @param {string}      [filters.typePrefix] — prefix match (e.g. 'node:' matches all node events)
     * @param {number}      [filters.since]      — epoch ms lower bound (inclusive)
     * @param {number}      [filters.until]      — epoch ms upper bound (inclusive)
     * @returns {object[]}
     */
    getEvents(filters = {}) {
        return this.#events.filter(e => {
            if (filters.actorId    != null && e.actorId  !== filters.actorId)          return false;
            if (filters.type       != null && e.type     !== filters.type)             return false;
            if (filters.typePrefix != null && !e.type.startsWith(filters.typePrefix))  return false;
            if (filters.since      != null && e.timestamp < filters.since)             return false;
            if (filters.until      != null && e.timestamp > filters.until)             return false;
            return true;
        });
    }

    /** @returns {number} Total number of events recorded */
    get size() {
        return this.#events.length;
    }

    /**
     * Unsubscribe from a connected GraphStore and remove all listeners.
     * The historical event log is preserved — call getEvents() after destroy() if needed.
     */
    destroy() {
        this.#unsubscribers.forEach(fn => fn());
        this.#unsubscribers = [];
        this.clear();  // EventBus: removes all registered listeners
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    #subscribeToStore(store, defaultActorId) {
        // Helper: subscribe and return unsubscriber; slim payloads only (no full node objects)
        const sub = (type, mapper) =>
            store.on(type, payload =>
                this.record({ type, payload: mapper(payload), actorId: defaultActorId })
            );

        this.#unsubscribers = [
            // Node mutations
            sub('nodes:changed',
                ({ nodes })              => ({ uids: nodes.map(n => n.uid) })),
            sub('node:removed',
                ({ uid, descendants })   => ({ uid, descendantUids: descendants.map(n => n.uid) })),
            sub('node:moved',
                ({ uid, x, y })          => ({ uid, x, y })),
            sub('node:status-changed',
                ({ uid, status })        => ({ uid, status })),
            // Edge mutations
            sub('edges:changed',
                ({ edges })              => ({ uids: edges.map(e => e.uid) })),
            // Layout
            sub('layout:computed',
                ({ nodes, edges })       => ({ nodeCount: nodes.length, edgeCount: edges.length })),
        ];
    }
}
