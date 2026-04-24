/**
 * Pan target geometry — pure math for centering a node in a viewport.
 *
 * Given a node's SVG position and dimensions, a viewport size, and a zoom
 * level, returns the pan values that place the node's centre at the viewport
 * centre (with an optional offset). No DOM, no rendering, no side effects.
 *
 * Coordinate identity:
 *   screenX = svgX * zoom + panX
 *
 * To centre node horizontally in viewport at a given zoom:
 *   panX = vpWidth/2 - nodeWidth/2 - node.x * zoom
 *
 * With xOffset (e.g. 200px left-of-centre to leave room for a side panel):
 *   panX = vpWidth/2 - nodeWidth/2 - xOffset - node.x * zoom
 */

/**
 * Compute the pan values that centre a node in the viewport.
 *
 * @param {object} node         Node with { x, y }
 * @param {object} layout       Node type layout config with { width, height }
 * @param {object} viewport     Viewport dimensions { width, height } in screen px
 * @param {object} [options]
 * @param {number} [options.zoom=1]     The zoom level at which to compute (use final zoom, not current)
 * @param {number} [options.xOffset=0]  Horizontal offset from centre (positive = shift left)
 * @param {number} [options.yOffset=0]  Vertical offset from centre (positive = shift up)
 * @returns {{ x: number, y: number }}  Target pan in screen pixels
 */
export function getPanTargetForNode(node, layout, viewport, { zoom = 1, xOffset = 0, yOffset = 0 } = {}) {
    return {
        x: viewport.width  / 2 - layout.width  / 2 - xOffset - node.x * zoom,
        y: viewport.height / 2 - layout.height / 2 - yOffset - node.y * zoom,
    };
}

/**
 * Compute the pan and zoom values that fit all placed nodes into the viewport.
 *
 * Pure math — no side effects. Pass the result directly to animateTo() for a
 * smooth transition, or apply immediately via setPan() + zoomToCenter().
 *
 * @param {object[]} nodes      All nodes from store.getNodes() — unplaced nodes (x == null) are skipped
 * @param {object}   viewport   Viewport dimensions { width, height } in screen px
 * @param {object}   [options]
 * @param {number}   [options.padding=0.9]   Fraction of viewport to fill (0.9 = 10% margin on each side)
 * @param {number}   [options.minZoom=0.1]   Floor on the computed zoom
 * @param {number}   [options.maxZoom=1]     Ceiling on the computed zoom — default 1 prevents magnifying
 *                                           a small graph beyond actual size
 * @returns {{ pan: { x, y }, zoom } | null}  null if no placed nodes
 */
export function getFitToContent(nodes, viewport, { padding = 0.9, minZoom = 0.1, maxZoom = 1 } = {}) {
    const placed = nodes.filter(n => n.x != null && n.y != null);
    if (!placed.length) return null;

    // Bounding box across all placed nodes — uses per-node w/h (set at addNode time)
    let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
    for (const n of placed) {
        bMinX = Math.min(bMinX, n.x);
        bMinY = Math.min(bMinY, n.y);
        bMaxX = Math.max(bMaxX, n.x + n.w);
        bMaxY = Math.max(bMaxY, n.y + n.h);
    }

    const contentW = bMaxX - bMinX;
    const contentH = bMaxY - bMinY;

    // Zoom to fit, clamped to [minZoom, maxZoom]
    const rawZoom = Math.min(
        (viewport.width  * padding) / contentW,
        (viewport.height * padding) / contentH,
    );
    const zoom = Math.min(Math.max(rawZoom, minZoom), maxZoom);

    // Pan to centre the bounding box midpoint in the viewport
    const pan = {
        x: viewport.width  / 2 - (bMinX + contentW / 2) * zoom,
        y: viewport.height / 2 - (bMinY + contentH / 2) * zoom,
    };

    return { pan, zoom };
}
