import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GraphAbstract, viewOf, ordered, checkJoins, reachable, shortestPath, propagate } from '../index.js';

const net = () => {
    const g = new GraphAbstract();
    for (const [uid, type] of [['p1', 'place'], ['t1', 'transition'], ['p2', 'place'], ['s', 'step'], ['x', 'asset']]) g.addNode({ uid, type });
    g.addEdge({ srcUid: 'p1', targetUid: 't1', type: 'arc' });
    g.addEdge({ srcUid: 't1', targetUid: 'p2', type: 'arc' });
    g.addEdge({ srcUid: 'p1', targetUid: 'p2', type: 'arc' });                // a place joined to a place: not allowed
    g.addEdge({ srcUid: 'x', targetUid: 's', type: 'performs' });
    return g;
};

test('a view: only the nodes that pass, only the edges between them — and the algorithms run over it unchanged', () => {
    const g = net();
    const v = viewOf(g, { node: (n) => n.type === 'place' || n.type === 'transition' });
    assert.deepEqual([v.getNodes().map((n) => n.uid), v.getEdges().map((e) => e.uid)], [['p1', 't1', 'p2'], ['arc:p1→t1', 'arc:t1→p2', 'arc:p1→p2']]);
    assert.deepEqual([v.hasNode('x'), v.getNode('x'), v.getOutgoing('x'), v.getEdge('performs:x→s')], [false, null, [], null]);
    assert.deepEqual(reachable(v, 'p1').sort(), ['p2', 't1']);
    assert.deepEqual(shortestPath(v, 'p1', 'p2').path, ['p1', 'p2']);
    assert.deepEqual(propagate(v, 'x'), [], 'outside the view, nothing');
    // it reads the graph as it is now
    g.addNode({ uid: 't2', type: 'transition' }); g.addEdge({ srcUid: 'p2', targetUid: 't2', type: 'arc' });
    assert.deepEqual(v.getOutgoing('p2').map((e) => e.targetUid), ['t2']);
    // a view of a view
    const places = viewOf(v, { node: (n) => n.type === 'place' });
    assert.deepEqual([places.getNodes().map((n) => n.uid), places.getEdges().map((e) => e.uid)], [['p1', 'p2'], ['arc:p1→p2']]);
    assert.throws(() => viewOf(g, {}), /needs \{ node/);
    assert.ok(Object.isFrozen(v));
});

test('ordered: by data.order, then as added; stable; a new array', () => {
    const e = (uid, order) => ({ uid, data: order === undefined ? {} : { order } });
    const list = [e('c', 2), e('none1'), e('a', 0), e('b', 1), e('none2'), e('b2', 1)];
    assert.deepEqual(ordered(list).map((x) => x.uid), ['a', 'b', 'b2', 'c', 'none1', 'none2']);
    assert.notEqual(ordered(list), list);
});

test('checkJoins: an edge of a governed type that joins kinds of node it may not', () => {
    const g = net();
    assert.deepEqual(checkJoins(g, { arc: { from: ['place', 'transition'], to: ['place', 'transition'] } }), []);
    // a Petri net: an arc joins a place to a transition, or a transition to a place — never two of a kind
    assert.deepEqual(checkJoins(g, { arc: { pairs: [['place', 'transition'], ['transition', 'place']] } }), [
        { edge: 'arc:p1→p2', type: 'arc', from: 'p1', to: 'p2', fromType: 'place', toType: 'place' }]);
    assert.deepEqual(checkJoins(g, { performs: { from: ['asset'], to: ['task'] } }), [{ edge: 'performs:x→s', type: 'performs', from: 'x', to: 's', fromType: 'asset', toType: 'step' }]);
});
