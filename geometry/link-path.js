/**
 * Link path geometry — pure math, no D3 dependency.
 *
 * Produces cubic bezier SVG paths identical to d3.linkHorizontal().
 * Self-contained so the headless layer has no D3 import.
 */

import { getPortSvgPos } from './port-geometry.js';

/**
 * Cubic bezier path between two absolute SVG points.
 * Output is identical to d3.linkHorizontal()({ source, target }).
 *
 * @param {[number, number]} source  [x, y]
 * @param {[number, number]} target  [x, y]
 * @returns {string} SVG path `d` attribute
 */
export function horizontalLinkPath(source, target) {
    const mx = (source[0] + target[0]) / 2;
    return `M${source[0]},${source[1]}C${mx},${source[1]} ${mx},${target[1]} ${target[0]},${target[1]}`;
}

/**
 * Compute the SVG path between two nodes using their port positions.
 *
 * @param {object}   srcNode      Node with { x, y, movedX?, movedY?, type }
 * @param {object}   targetNode   Node with { x, y, movedX?, movedY?, type }
 * @param {Function} getConfig    (type) => nodeTypeConfig
 * @param {string}   [srcPortId]  Defaults to first output port ('out')
 * @param {string}   [tgtPortId]  Defaults to first input port ('in')
 * @returns {string} SVG path `d` attribute
 */
export function computeNodeLinkPath(srcNode, targetNode, getConfig, srcPortId = 'out', tgtPortId = 'in') {
    const src = getPortSvgPos(srcNode, srcPortId, getConfig);
    const tgt = getPortSvgPos(targetNode, tgtPortId, getConfig);

    // Fallback if port ids not found in config — should not happen in practice
    if (!src || !tgt) {
        console.warn('[LinkPath] Port not found:', srcPortId, tgtPortId, srcNode.type, targetNode.type);
        const sx = (srcNode.movedX ?? srcNode.x ?? 0);
        const sy = (srcNode.movedY ?? srcNode.y ?? 0);
        const tx = (targetNode.movedX ?? targetNode.x ?? 0);
        const ty = (targetNode.movedY ?? targetNode.y ?? 0);
        return horizontalLinkPath([sx, sy], [tx, ty]);
    }

    // Always render left-to-right visually.
    // When the logical source is to the right of the target (e.g. child→parent in
    // a horizontal tree), swap which node each portId is applied to — srcPortId ('out')
    // goes to the visually-left node, tgtPortId ('in') to the visually-right node.
    // Swapping just the coordinates (without re-fetching ports) would anchor the path
    // to the wrong dots when nodes differ in height.
    if (src.x > tgt.x) {
        const vSrc = getPortSvgPos(targetNode, srcPortId, getConfig);
        const vTgt = getPortSvgPos(srcNode,    tgtPortId, getConfig);
        if (vSrc && vTgt) {
            return horizontalLinkPath([vSrc.x, vSrc.y], [vTgt.x, vTgt.y]);
        }
    }

    return horizontalLinkPath([src.x, src.y], [tgt.x, tgt.y]);
}
