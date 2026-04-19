/**
 * ActorRegistry — identity store for actors operating on a graph.
 *
 * An "actor" is any entity that can interact with graph data:
 * a human user, an AI agent, an automated pipeline, etc.
 *
 * The graph layer carries only opaque identifier strings on node/edge data
 * (node.createdBy, node.updatedBy[]). This registry is the lookup point
 * for display metadata — nicknames, colours, avatars, roles, etc.
 *
 * Deliberately NOT a reactive state machine. The presentation layer owns
 * reactivity. This is a plain lookup with a minimal CRUD API.
 *
 * Zero dependencies. No DOM. No graph coupling.
 *
 * Suggested metadata fields (open object — none are enforced):
 *   nickname  {string}   — display name
 *   color     {string}   — CSS colour string, used for cursor / presence rendering
 *   avatar    {string}   — URL or initials string
 *   type      {string}   — 'human' | 'agent' | 'system'
 *   [any]                — extend freely; the library carries it opaquely
 */

export class ActorRegistry {
    #actors = new Map();  // actorId → { actorId, ...metadata }

    /**
     * Register an actor. If the actor already exists, metadata is merged (shallow).
     *
     * @param {string} actorId   Opaque identifier — must match the strings used in
     *                           node.createdBy and node.updatedBy[] entries.
     * @param {object} [metadata={}]
     */
    register(actorId, metadata = {}) {
        const existing = this.#actors.get(actorId) ?? {};
        this.#actors.set(actorId, { ...existing, ...metadata, actorId });
    }

    /**
     * Partially update metadata for an existing actor.
     * Silently ignores unknown actorIds — register first.
     *
     * @param {string} actorId
     * @param {object} metadata  Partial metadata to merge
     */
    update(actorId, metadata) {
        const actor = this.#actors.get(actorId);
        if (!actor) return;
        Object.assign(actor, metadata);
    }

    /**
     * @param {string} actorId
     * @returns {object|undefined}
     */
    get(actorId) {
        return this.#actors.get(actorId);
    }

    /** @returns {object[]} All registered actors */
    getAll() {
        return [...this.#actors.values()];
    }

    /** @param {string} actorId */
    has(actorId) {
        return this.#actors.has(actorId);
    }

    /**
     * Remove an actor from the registry.
     * Does not affect any graph data — identifier strings on nodes/edges are untouched.
     *
     * @param {string} actorId
     */
    unregister(actorId) {
        this.#actors.delete(actorId);
    }

    /** @returns {number} */
    get size() {
        return this.#actors.size;
    }
}
