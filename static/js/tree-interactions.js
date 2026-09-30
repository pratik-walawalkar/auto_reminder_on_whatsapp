function treeBindInteractions({network, classicTree, state, personById, people, unions, parentsOf, query, matchedIds, api, notice, openPanel, applyLineageHover, clearLineageHover, focusSearchMatch, animateConnections, syncConnectorPositions, isShiftPressed}) {
  network.on('stabilizationIterationsDone', () => {
    if (!classicTree) network.setOptions({physics: {enabled: false}});
    syncConnectorPositions();
    animateConnections();
  });
  network.on('dragStart', () => {
    if (classicTree) return;
    network.setOptions({physics: {enabled: true}});
  });
  network.on('dragEnd', () => {
    if (classicTree) return;
    setTimeout(() => network?.setOptions({physics: {enabled: false}}), 400);
  });
  network.on('hoverNode', ({node}) => {
    if (personById.has(node)) {
      lastPointerNodeId = node;
      applyLineageHover(node, people, unions, parentsOf);
    }
  });
    network.on('blurNode', () => {
    if (!isShiftPressed()) clearLineageHover();
  });
  network.on('mousemove', ({pointer}) => {
    const nodeId = network.getNodeAt(pointer.canvas);
    if (personById.has(nodeId)) {
      lastPointerNodeId = nodeId;
      applyLineageHover(nodeId, people, unions, parentsOf);
    } else if (!isShiftPressed && state.lineageHover) clearLineageHover();
  });
  network.on('afterDrawing', () => animateConnections());
  network.on('zoom', () => animateConnections());
  network.on('dragEnd', () => animateConnections());
  network.on('dragEnd', async event => {
    const positions = {};
    (event.nodes || []).forEach(id => {
      if (personById.has(id)) {
        const point = network.getPositions([id])[id];
        positions[id] = {x: Math.round(point.x), y: Math.round(point.y)};
      }
    });
    syncConnectorPositions();
    animateConnections();
    if (!Object.keys(positions).length) return;
    try {
      await api('/api/family/positions', {method: 'PATCH', body: JSON.stringify({positions})});
      Object.entries(positions).forEach(([id, position]) => { const person = personById.get(id); person.position = position; });
    } catch (error) {
      notice(`Could not save layout: ${error.message}`);
    }
  });
  network.on('doubleClick', event => {
    const personId = (event.nodes || []).find(id => personById.has(id));
    if (personId) openPanel(personById.get(personId));
  });
  if (query && matchedIds.size) {
    network.once('afterDrawing', () => {
      const matchedId = [...matchedIds][0];
      applyLineageHover(matchedId, people, unions, parentsOf);
      focusSearchMatch(matchedId);
    });
  }
}

