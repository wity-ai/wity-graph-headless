/**
 * PanZoomState — headless pan/zoom state machine.
 *
 * Owns all pan/zoom math: current state, target computation, coordinate
 * transforms, and clamping. Zero DOM, zero SVG, zero rendering concerns.
 *
 * The rendering layer (PanZoomManager) reads state from here and writes the
 * CSS transform. Input events (wheel, pointer drag) call mutate methods and
 * read back the new transform to apply.
 *
 * Coordinate convention (matches the SVG rendering model):
 *   screenX = svgX * zoom + panX
 *   screenY = svgY * zoom + panY
 *
 *   pan values are in screen pixels.
 *   svg coordinates are in SVG user units (1:1 with CSS px for a non-scaled SVG).
 */

export class PanZoomState {
    #pan  = { x: 0, y: 0 };
    #zoom = 1;
    #minZoom = 0.05;
    #maxZoom = 10;

    /**
     * @param {object} [opts]
     * @param {number} [opts.minZoom=0.05]
     * @param {number} [opts.maxZoom=10]
     */
    constructor({ minZoom, maxZoom } = {}) {
        if (minZoom != null) this.#minZoom = minZoom;
        if (maxZoom != null) this.#maxZoom = maxZoom;
    }

    // ─── State accessors ──────────────────────────────────────────────────────

    get pan()  { return { ...this.#pan }; }
    get zoom() { return this.#zoom; }

    getTransform() {
        return `matrix(${this.#zoom},0,0,${this.#zoom},${this.#pan.x},${this.#pan.y})`;
    }

    // ─── Mutation ─────────────────────────────────────────────────────────────

    setPan(x, y) {
        this.#pan = { x, y };
    }

    panBy(dx, dy) {
        this.#pan = { x: this.#pan.x + dx, y: this.#pan.y + dy };
    }

    /**
     * Zoom towards a screen point (sx, sy) — the point stays fixed on screen.
     * This is the standard "zoom to cursor" behaviour used by wheel events.
     *
     * @param {number} newZoom   Desired absolute zoom level
     * @param {number} sx        Screen x of the focal point (e.g. cursor position)
     * @param {number} sy        Screen y of the focal point
     */
    zoomToPoint(newZoom, sx, sy) {
        const clamped = Math.min(Math.max(newZoom, this.#minZoom), this.#maxZoom);
        const ratio   = clamped / this.#zoom;
        // Keep (sx, sy) fixed: pan adjusts so the SVG point under the cursor doesn't move.
        this.#pan = {
            x: sx - ratio * (sx - this.#pan.x),
            y: sy - ratio * (sy - this.#pan.y),
        };
        this.#zoom = clamped;
    }

    /**
     * Set zoom around the centre of the viewport (used for programmatic zoom).
     */
    zoomToCenter(newZoom, vpWidth, vpHeight) {
        this.zoomToPoint(newZoom, vpWidth / 2, vpHeight / 2);
    }

    /**
     * Set zoom level directly without adjusting pan.
     * Use during simultaneous pan+zoom animation where pan is already
     * computed for the final zoom — adjusting pan via zoomToPoint would
     * undo the carefully placed target pan.
     */
    setZoomRaw(v) {
        this.#zoom = Math.min(Math.max(v, this.#minZoom), this.#maxZoom);
    }

    setMinZoom(v) { this.#minZoom = v; }
    setMaxZoom(v) { this.#maxZoom = v; }

    // ─── Coordinate transforms ────────────────────────────────────────────────

    /** Convert screen coordinates to SVG/canvas coordinates. */
    screenToSvg(sx, sy) {
        return {
            x: (sx - this.#pan.x) / this.#zoom,
            y: (sy - this.#pan.y) / this.#zoom,
        };
    }

    /** Convert SVG/canvas coordinates to screen coordinates. */
    svgToScreen(svgX, svgY) {
        return {
            x: svgX * this.#zoom + this.#pan.x,
            y: svgY * this.#zoom + this.#pan.y,
        };
    }
}
