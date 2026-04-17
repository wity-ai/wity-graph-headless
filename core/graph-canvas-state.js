/**
 * GraphCanvasState — single source of truth for all computed canvas state.
 *
 * Composes GraphStore (node data + layout) with PanZoomState (pan/zoom) and
 * viewport dimensions to produce fully computed, ready-to-apply state.
 *
 * The rendering layer reads from this object and applies values directly to
 * the DOM — it performs zero computation of its own.
 *
 * Architecture contract:
 *   Headless layer  → owns ALL state and ALL derived math
 *   Rendering layer → owns ONLY DOM mutations and event binding
 *
 * Coordinate convention:
 *   screenX = svgX * zoom + panX
 *   pan is in screen pixels; SVG coords are 1:1 with CSS px for our SVG.
 */

import { PanZoomState }    from './pan-zoom-state.js';
import { getNodeTypeConfig } from '../ontology/node-types.js';

export class GraphCanvasState {
    #store;
    #panZoom;
    #viewport;

    /**
     * @param {GraphStore}   store    The graph data store
     * @param {object}       viewport Initial viewport dimensions { width, height }
     */
    constructor(store, viewport = { width: 800, height: 600 }) {
        this.#store   = store;
        this.#panZoom = new PanZoomState();
        this.#viewport = { ...viewport };
    }

    // ─── Viewport ─────────────────────────────────────────────────────────────

    setViewport(width, height) {
        this.#viewport = { width, height };
    }

    getViewport() {
        return { ...this.#viewport };
    }

    // ─── Transform ────────────────────────────────────────────────────────────

    /** SVG matrix transform string — apply directly to the <g> viewport element. */
    getTransform() {
        return this.#panZoom.getTransform();
    }

    // ─── Pan / zoom state ─────────────────────────────────────────────────────

    get pan()  { return this.#panZoom.pan; }
    get zoom() { return this.#panZoom.zoom; }

    setPan(x, y)         { this.#panZoom.setPan(x, y); }
    panBy(dx, dy)        { this.#panZoom.panBy(dx, dy); }
    setZoomRaw(v)        { this.#panZoom.setZoomRaw(v); }
    setMinZoom(v)        { this.#panZoom.setMinZoom(v); }
    setMaxZoom(v)        { this.#panZoom.setMaxZoom(v); }

    /**
     * Zoom toward a screen point (keeps that point fixed on screen).
     * Use for wheel zoom — cursor stays under the mouse.
     */
    zoomToPoint(newZoom, screenX, screenY) {
        this.#panZoom.zoomToPoint(newZoom, screenX, screenY);
    }

    /**
     * Zoom around the viewport centre.
     * Use for programmatic zoom (buttons, API).
     */
    zoomToCenter(newZoom) {
        this.#panZoom.zoomToCenter(newZoom, this.#viewport.width, this.#viewport.height);
    }

    // ─── Coordinate transforms ────────────────────────────────────────────────

    /** Convert screen coordinates to SVG/canvas coordinates. */
    screenToSvg(sx, sy) { return this.#panZoom.screenToSvg(sx, sy); }

    /** Convert SVG/canvas coordinates to screen coordinates. */
    svgToScreen(svgX, svgY) { return this.#panZoom.svgToScreen(svgX, svgY); }

    // ─── Node screen positions ────────────────────────────────────────────────

    /**
     * Returns the screen-space bounding rect of a node.
     * Accounts for current pan and zoom.
     *
     * @param {string} uid
     * @returns {{ x, y, width, height } | null}
     */
    getNodeScreenRect(uid) {
        const node = this.#store.getNode(uid);
        if (!node || node.x == null) return null;

        const cfg  = getNodeTypeConfig(node.type).layout;
        const pan  = this.#panZoom.pan;
        const zoom = this.#panZoom.zoom;

        return {
            x:      node.x * zoom + pan.x,
            y:      node.y * zoom + pan.y,
            width:  cfg.width  * zoom,
            height: cfg.height * zoom,
        };
    }

    /**
     * Returns the screen position of the action overlay anchor for a node.
     * Anchor sits just to the right of the node, aligned to its top edge.
     *
     * @param {string} uid
     * @param {number} [gap=10]  Pixel gap between node right edge and overlay
     * @returns {{ x, y } | null}
     */
    getOverlayAnchor(uid, gap = 10) {
        const rect = this.getNodeScreenRect(uid);
        if (!rect) return null;
        return { x: rect.x + rect.width + gap, y: rect.y };
    }

    /**
     * Computes the pan values that centre a node in the viewport at a given zoom.
     * Pass this directly to the animation layer — no further math needed.
     *
     * @param {string} uid
     * @param {object} [options]
     * @param {number} [options.zoom]       Target zoom (defaults to current)
     * @param {number} [options.xOffset=0]  Shift node left of centre by this many px
     * @param {number} [options.yOffset=0]  Shift node above centre by this many px
     * @returns {{ x, y } | null}
     */
    getPanTargetForNode(uid, { zoom, xOffset = 0, yOffset = 0 } = {}) {
        const node = this.#store.getNode(uid);
        if (!node || node.x == null) return null;

        const cfg       = getNodeTypeConfig(node.type).layout;
        const finalZoom = zoom ?? this.#panZoom.zoom;
        const vp        = this.#viewport;

        return {
            x: vp.width  / 2 - cfg.width  / 2 - xOffset - node.x * finalZoom,
            y: vp.height / 2 - cfg.height / 2 - yOffset - node.y * finalZoom,
        };
    }

    /**
     * Returns true if any part of the node is currently visible in the viewport.
     */
    isNodeInViewport(uid) {
        const rect = this.getNodeScreenRect(uid);
        if (!rect) return false;
        const vp = this.#viewport;
        return rect.x < vp.width  && rect.x + rect.width  > 0 &&
               rect.y < vp.height && rect.y + rect.height > 0;
    }
}
