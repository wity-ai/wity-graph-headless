/**
 * Link type ontology.
 *
 * default:     A directed relationship between two nodes. The fundamental
 *              connection in a brainstorming graph — idea leads to idea.
 *
 * placeholder: A tentative link rendered during drag-to-link interaction.
 *              Ephemeral — becomes default if the drag completes, removed if cancelled.
 *
 * semantic:    An explicitly typed conceptual relationship (e.g. "supports",
 *              "contradicts", "derives-from"). Reserved for future rich-linking.
 */

export const LINK_TYPES = {
    default: {
        label: 'Default',
        description: 'Standard directed connection between nodes',
        style: { stroke: 'darkgray', strokeWidth: '2px', dashArray: null },
    },

    placeholder: {
        label: 'Placeholder',
        description: 'Tentative link shown during drag-to-link interaction',
        style: { stroke: 'darkgray', strokeWidth: '2px', dashArray: '4 4' },
    },

    semantic: {
        label: 'Semantic',
        description: 'Explicitly typed conceptual relationship between nodes',
        style: { stroke: '#6366f1', strokeWidth: '2px', dashArray: null },
    },
};

export const DEFAULT_LINK_TYPE = 'default';

export function getLinkTypeConfig(type) {
    return LINK_TYPES[type] ?? LINK_TYPES.default;
}

/**
 * Register a custom link type at runtime.
 */
export function registerLinkType(name, config) {
    LINK_TYPES[name] = config;
}
