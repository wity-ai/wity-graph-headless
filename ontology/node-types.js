/**
 * Node type ontology — grounded in Basic Formal Ontology (BFO) terminology.
 *
 * Continuant:   An entity that persists through time — a thought, concept, or idea.
 *               Exists independently and retains identity across time.
 *
 * Occurant:     A process or event — a brainstorming session, thought expansion,
 *               or agentic action. Unfolds over time rather than persisting through it.
 *
 * Placeholder:  A prospective node indicating potential thought connections.
 *               Ephemeral by nature — becomes a continuant or occurant when committed.
 *
 * Port model:
 *   Each node type declares named ports — the attachment points where edges connect.
 *   Ports have:
 *     id        — unique within the node type ('in', 'out', 'image', etc.)
 *     side      — 'input' (left) or 'output' (right)
 *     yFraction — vertical position as a fraction of node height (0 = top, 1 = bottom)
 *     xOffset   — pixel inset from the node edge (default 0 = exactly on border)
 *
 *   getPortSvgPos() in port-geometry.js converts these to absolute SVG coordinates.
 *   The magic-offset fields (linkXOffset, linkYOffset, containerLMargin,
 *   containerRMargin) have been replaced by ports — values are identical.
 */

export const NODE_TYPES = {
    continuant: {
        label:       'Continuant',
        description: 'A persisting entity — thought, concept, or idea node',
        layout: {
            xSpacing: 320,
            ySpacing: 150,
            width:    240,   // px
            height:   272,   // px
        },
        ports: {
            // yFraction: 120/272 ≈ 0.44  →  y = 120px  (vertically centered on node face)
            // xOffset 0 on both sides  →  dot sits exactly on the node border
            inputs:  [{ id: 'in',  side: 'input',  yFraction: 0.44, xOffset: 0, style: { color: '#6b7280', radius: 6 } }],
            outputs: [{ id: 'out', side: 'output', yFraction: 0.44, xOffset: 0, style: { color: '#6b7280', radius: 6 } }],
        },
        style: {
            containerClass: 'p-3 overflow-visible relative',
            nodeClass:      'default-node-vector color-primary',
            widthCss:       '15em',
            heightCss:      '17em',
        },
    },

    occurant: {
        label:       'Occurant',
        description: 'A process or event — thought expansion, brainstorm session',
        layout: {
            xSpacing: 320,
            ySpacing: 150,
            width:    240,
            height:   136,
        },
        ports: {
            // yFraction: 60/136 ≈ 0.44  →  y = 60px  (vertically centered on node face)
            inputs:  [{ id: 'in',  side: 'input',  yFraction: 0.44, xOffset: 0, style: { color: '#f97316', radius: 5 } }],
            outputs: [{ id: 'out', side: 'output', yFraction: 0.44, xOffset: 0, style: { color: '#f97316', radius: 5 } }],
        },
        style: {
            containerClass: 'p-3 overflow-visible relative',
            nodeClass:      'default-node-vector color-secondary',
            widthCss:       '15em',
            heightCss:      '8.5em',
        },
    },

    placeholder: {
        label:       'Placeholder',
        description: 'A prospective node — marks potential thought connections during drag-to-link',
        layout: {
            xSpacing: 0,
            ySpacing: 0,
            width:    2,
            height:   2,
        },
        ports: {
            inputs:  [{ id: 'in',  side: 'input',  yFraction: 0.5, xOffset: 0, style: { color: 'transparent', radius: 0 } }],
            outputs: [{ id: 'out', side: 'output', yFraction: 0.5, xOffset: 0, style: { color: 'transparent', radius: 0 } }],
        },
        style: {
            containerClass: 'p-3 overflow-visible relative',
            nodeClass:      'default-node-vector color-secondary',
            widthCss:       '15em',
            heightCss:      '17em',
        },
    },
};

export const DEFAULT_NODE_TYPE = 'continuant';

/**
 * Returns the config for a node type, falling back to continuant if unknown.
 */
export function getNodeTypeConfig(type) {
    return NODE_TYPES[type] ?? NODE_TYPES[DEFAULT_NODE_TYPE];
}

/**
 * Register a custom node type at runtime.
 * Enables extending the ontology without modifying this file.
 *
 * @example
 * registerNodeType('goal', {
 *   label: 'Goal',
 *   layout: { xSpacing: 320, ySpacing: 150, width: 240, height: 272 },
 *   ports: {
 *     inputs:  [{ id: 'in',  side: 'input',  yFraction: 0.5, xOffset: 0 }],
 *     outputs: [{ id: 'out', side: 'output', yFraction: 0.5, xOffset: 0 }],
 *   },
 *   style: { nodeClass: 'goal-node', widthCss: '15em', heightCss: '17em' }
 * })
 */
export function registerNodeType(name, config) {
    if (NODE_TYPES[name]) {
        console.warn(`[NodeTypes] Overwriting existing node type: "${name}"`);
    }
    NODE_TYPES[name] = {
        ...config,
        style: {
            nodeClass:      '',
            containerClass: '',
            ...config.style,
        },
    };
}

/**
 * Partially update a built-in or registered node type.
 * Deep-merges one level per structural key — only the fields you provide change;
 * everything else (ports, spacing, style classes, etc.) stays untouched.
 *
 * Call at app initialisation, BEFORE any nodes of that type are added to the
 * store. Layout spacing and hit-testing use node.w / node.h which are stamped
 * at addNode() time — patching after nodes exist leaves those cached values
 * stale until the next computeLayout() + node recreation.
 *
 * @example
 * patchNodeType('occurant', {
 *   layout: { height: 100 },
 *   style:  { heightCss: '6.25em' },
 * });
 *
 * @param {string} name   Existing type name ('continuant', 'occurant', or custom)
 * @param {object} patch  Partial config — only the keys you want to change
 */
export function patchNodeType(name, patch) {
    const existing = NODE_TYPES[name];
    if (!existing) {
        console.warn(`[NodeTypes] patchNodeType: unknown type "${name}". Use registerNodeType to define new types.`);
        return;
    }
    NODE_TYPES[name] = {
        ...existing,
        ...patch,
        layout: { ...existing.layout, ...(patch.layout ?? {}) },
        ports: {
            inputs:  patch.ports?.inputs  ?? existing.ports.inputs,
            outputs: patch.ports?.outputs ?? existing.ports.outputs,
        },
        style: { ...existing.style, ...(patch.style ?? {}) },
    };
}
