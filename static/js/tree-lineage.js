function lineageGetAncestorsRecursive(nodeId, dataset, visited = new Set()) {
  if (!nodeId || visited.has(nodeId)) return visited;
  visited.add(nodeId);
  const person = Array.isArray(dataset) ? dataset.find(candidate => candidate.id === nodeId) : null;
  const parentIds = person?.parents || person?.relationships?.parents || (dataset instanceof Map ? dataset.get(nodeId) || [] : []);
  parentIds.forEach(parentId => lineageGetAncestorsRecursive(parentId, dataset, visited));
  return visited;
}

function lineageApplyHover(nodeId, people, unions, parentsOf) {
  if (isShiftPressed && state.lineageHover) return;
  if (!networkNodes || !networkEdges) return;
  const lineageDataset = people.map(person => ({...person, relationships: {...person.relationships, parents: parentsOf.get(person.id) || []}}));
  const lineage = lineageGetAncestorsRecursive(nodeId, parentsOf);
  const personIds = new Set(people.map(person => person.id));
  const vividNodes = new Set(lineage);
  const allEdges = networkEdges.get();
  const personById = new Map(lineageDataset.map(person => [person.id, person]));
  let changed = true;
  while (changed) {
    changed = false;
    [...vividNodes].forEach(id => {
      const ancestorCount = vividNodes.size;
      lineageGetAncestorsRecursive(id, parentsOf, vividNodes);
      if (vividNodes.size !== ancestorCount) changed = true;
      unions.forEach(union => {
        const partnerIds = (union.partners || []).map(partner => partner.individual_id);
        const childIds = (union.children || []).map(child => child.individual_id);
        if (partnerIds.includes(id) || childIds.some(childId => vividNodes.has(childId))) {
          partnerIds.forEach(partnerId => {
            if (personById.has(partnerId) && !vividNodes.has(partnerId)) {
              vividNodes.add(partnerId);
              changed = true;
            }
          });
        }
      });
    });
  }
  changed = true;
  while (changed) {
    changed = false;
    allEdges.forEach(edge => {
      const hiddenBranch = !personIds.has(edge.from) || !personIds.has(edge.to);
      if (edge.edgeKind === 'parent' && hiddenBranch && vividNodes.has(edge.to) && !vividNodes.has(edge.from)) {
        vividNodes.add(edge.from);
        changed = true;
      }
      if (edge.edgeKind === 'marriage-hub' && vividNodes.has(edge.from) && !vividNodes.has(edge.to)) {
        vividNodes.add(edge.to);
        changed = true;
      }
    });
  }
  const vividEdges = new Set(allEdges.filter(edge => {
    if (edge.edgeKind === 'parent') return vividNodes.has(edge.from) && vividNodes.has(edge.to);
    return vividNodes.has(edge.from) && vividNodes.has(edge.to);
  }).map(edge => edge.id));
  networkNodes.update(networkNodes.get().map(node => ({
    id: node.id,
    opacity: vividNodes.has(node.id) ? 1 : 0.12,
    color: vividNodes.has(node.id) ? node._lineageColor : {background: 'rgba(148, 163, 184, 0.12)', border: 'rgba(148, 163, 184, 0.16)'}
  })));
    const dimmedLabelStroke = document.documentElement.dataset.theme === 'light'
    ? 'rgba(253, 251, 247, 0.12)'
    : 'rgba(15, 23, 42, 0.12)';
  networkEdges.update(allEdges.map(edge => ({
    id: edge.id,
    opacity: vividEdges.has(edge.id) ? 1 : 0.12,
    width: vividEdges.has(edge.id) ? Math.max(edge._lineageWidth || 2, 4) : edge._lineageWidth || 2,
    selectionWidth: vividEdges.has(edge.id) ? 6 : edge._lineageSelectionWidth || 2,
    color: vividEdges.has(edge.id)
      ? {...edge._lineageColor, hover: edge._lineageColor.color}
      : {color: 'rgba(148, 163, 184, 0.12)', highlight: 'rgba(148, 163, 184, 0.12)', hover: 'rgba(148, 163, 184, 0.12)'},
    font: edge._lineageFont
      ? {...edge._lineageFont, color: vividEdges.has(edge.id) ? edge._lineageFont.color : 'rgba(148, 163, 184, 0.12)', strokeColor: vividEdges.has(edge.id) ? edge._lineageFont.strokeColor : dimmedLabelStroke}
      : undefined
  })));
  state.lineageHover = {nodeId, lineage, vividNodes, vividEdges};
  lineageUpdateAnimatedConnectionOpacity();
  lastPointerNodeId = nodeId;
}

function lineageUpdateAnimatedConnectionOpacity() {
  document.querySelectorAll('.connection-overlay circle.link-dot').forEach(dot => {
    const edgeId = dot.dataset.edgeId;
    const baseOpacity = state.lineageHover
      ? state.lineageHover.vividEdges.has(edgeId) ? 1 : 0.12
      : 1;
    const opacityAnimation = dot.querySelector('animate[attributeName="opacity"]');
    if (opacityAnimation) opacityAnimation.setAttribute('values', `${baseOpacity};${baseOpacity};0`);
    dot.style.opacity = String(baseOpacity);
  });
}

function lineageClearHover() {
  if (isShiftPressed) return;

  if (!networkNodes || !networkEdges) return;
  networkNodes.update(networkNodes.get().map(node => ({id: node.id, opacity: 1, color: node._lineageColor})));
  networkEdges.update(networkEdges.get().map(edge => ({
    id: edge.id,
    opacity: edge._lineageOpacity ?? 1,
    width: edge._lineageWidth || 2,
        selectionWidth: edge._lineageSelectionWidth || 2,
    color: edge._lineageColor,
    font: edge._lineageFont
  })));

  state.lineageHover = null;
  lineageUpdateAnimatedConnectionOpacity();
}

