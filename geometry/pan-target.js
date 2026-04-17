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
