/**
 * EventBus — typed pub/sub event system.
 * Foundation for all inter-layer communication in the graph engine.
 * Framework-agnostic, zero dependencies.
 */
export class EventBus {
    #handlers = new Map();

    /**
     * Subscribe to an event.
     * @param {string} event
     * @param {Function} handler
     * @returns {Function} unsubscribe function
     */
    on(event, handler) {
        if (!this.#handlers.has(event)) this.#handlers.set(event, new Set());
        this.#handlers.get(event).add(handler);
        return () => this.off(event, handler);
    }

    off(event, handler) {
        this.#handlers.get(event)?.delete(handler);
    }

    /**
     * Subscribe to an event once.
     * @returns {Function} unsubscribe function
     */
    once(event, handler) {
        const unsub = this.on(event, (payload) => {
            handler(payload);
            unsub();
        });
        return unsub;
    }

    /**
     * Emit an event with payload.
     * Wildcard listeners subscribed to '*' receive { event, payload }.
     */
    emit(event, payload) {
        this.#handlers.get(event)?.forEach(h => h(payload));
        this.#handlers.get('*')?.forEach(h => h({ event, payload }));
    }

    /**
     * Remove all listeners for an event, or all listeners if no event given.
     */
    clear(event) {
        if (event) {
            this.#handlers.delete(event);
        } else {
            this.#handlers.clear();
        }
    }
}
