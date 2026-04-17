/**
 * BatchProcessor — sequential async task queue with configurable interval.
 *
 * Improvement over the existing RateLimitedQueue:
 *  - Async/await based (no setTimeout chaining)
 *  - Error isolation per task (one failure doesn't block the queue)
 *  - Observable state (size, busy)
 *  - Drainable (await drain())
 *  - Backwards-compatible: same enqueue() interface
 */
export class BatchProcessor {
    #queue = [];
    #isProcessing = false;
    #interval;
    #drainResolvers = [];

    constructor(interval = 0) {
        this.#interval = interval;
    }

    /**
     * Add a task to the queue.
     * @param {Function} fn  Sync or async function
     * @returns {this}  Chainable
     */
    enqueue(fn) {
        this.#queue.push(fn);
        this.#process();
        return this;
    }

    /**
     * Returns a Promise that resolves when the queue is empty and idle.
     */
    drain() {
        if (!this.#isProcessing && this.#queue.length === 0) {
            return Promise.resolve();
        }
        return new Promise(resolve => this.#drainResolvers.push(resolve));
    }

    /** Number of pending tasks. */
    get size() { return this.#queue.length; }

    /** Whether the queue is actively processing. */
    get busy() { return this.#isProcessing; }

    /** Remove all pending tasks (does not stop the running task). */
    clear() { this.#queue = []; }

    async #process() {
        if (this.#isProcessing) return;
        this.#isProcessing = true;

        while (this.#queue.length > 0) {
            const fn = this.#queue.shift();
            try {
                await fn();
            } catch (e) {
                console.error('[BatchProcessor] Task error:', e);
            }
            if (this.#interval > 0 && this.#queue.length > 0) {
                await new Promise(r => setTimeout(r, this.#interval));
            }
        }

        this.#isProcessing = false;

        // Notify drain waiters
        const resolvers = this.#drainResolvers.splice(0);
        resolvers.forEach(r => r());
    }
}
