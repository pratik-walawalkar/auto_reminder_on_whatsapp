function treeBuildEdges({nodes, edges, classicTree, unions, visible, parentsOf, personById, levels, unionOfCouple, classicPositions, themeColors, relationshipColor, labeledEdge}) {  const organicEdgePhysics = (edgeKind, parentIds = [], childId = null) => {
    if (classicTree) return {};
    const directFamily = edgeKind === 'union' || (edgeKind === 'parent' && parentIds.length > 0 && childId && (levels.get(childId) || 0) - Math.max(...parentIds.map(id => levels.get(id) || 0)) <= 1);
    return directFamily
      ? {length: 130, physics: true}
      : {length: 300, physics: true};
  };
    // Classic renders the direct spouse rail; Organic renders the two dashed parent-to-hub rails.
  if (classicTree) {
    const drawnCouples = new Set();
    unions.forEach(union => {
      const pids = (union.partners || []).map(partner => partner.individual_id).filter(id => visible.has(id));
      if (pids.length !== 2) return;
      const coupleKey = [...pids].sort().join('|');
      if (drawnCouples.has(coupleKey)) return;
      drawnCouples.add(coupleKey);
      edges.push(labeledEdge({from: pids[0], to: pids[1], edgeKind: 'union', label: 'Spouse', arrows: {to: {enabled: false}}, color: {color: relationshipColor, opacity: 0.9}, width: 1.8, dashes: [4, 4], smooth: {enabled: true, type: 'cubicBezier', forceDirection: 'horizontal', roundness: 0.25}, ...organicEdgePhysics('union', pids)}));
    });
  }
  const parentGroups = new Map();
  parentsOf.forEach((parentIds, childId) => {
    const uniqueParents = [...new Set(parentIds)].filter(id => visible.has(id)).sort();
    if (!uniqueParents.length) return;
    const key = uniqueParents.join('|');
    if (!parentGroups.has(key)) parentGroups.set(key, {parentIds: uniqueParents, childIds: []});
    parentGroups.get(key).childIds.push(childId);
  });
    const childRelationLabel = (parentIds, childId) => {
    const child = personById.get(childId);
    if (!child) return '';
    return child.gender === 'M' ? 'Son' : child.gender === 'F' ? 'Daughter' : 'Child';
  };
  const invisibleClassicNode = (id, position, level) => nodes.push({id, label: '', shape: 'dot', size: 1, borderWidth: 0, color: {background: 'rgba(0,0,0,0)', border: 'rgba(0,0,0,0)'}, level, ...position, physics: false, fixed: {x: true, y: true}, chosen: false});
  const invisibleOrganicHub = (id, level) => nodes.push({id, label: '', shape: 'dot', size: 0, opacity: 0, borderWidth: 0, color: {background: 'rgba(0,0,0,0)', border: 'rgba(0,0,0,0)'}, level, physics: true, fixed: false, chosen: false});
  parentGroups.forEach(group => {
    const hasCouple = group.parentIds.length >= 2;
    const sourceId = group.parentIds[0];
    if (!classicTree) {
      if (hasCouple) {
        const hubId = `hub_${group.parentIds.join('_')}`;
        invisibleOrganicHub(hubId, Math.max(...group.parentIds.map(parentId => levels.get(parentId) || 0)) + 0.5);
        group.parentIds.forEach(parentId => edges.push(labeledEdge({from: parentId, to: hubId, edgeKind: 'marriage-hub', label: '', arrows: {to: {enabled: false}}, color: {color: themeColors.edge, opacity: 0.72}, width: 1.6, dashes: [4, 4], smooth: {enabled: false}, length: 45, springConstant: 0.18, physics: true})));
        group.childIds.forEach(childId => edges.push(labeledEdge({from: hubId, to: childId, edgeKind: 'parent', label: childRelationLabel(group.parentIds, childId), arrows: {to: {enabled: true, scaleFactor: 0.8}}, color: {color: themeColors.edge, highlight: themeColors.edgeHighlight}, width: 2, smooth: {enabled: true, type: 'dynamic'}, length: 160, springConstant: 0.04, physics: true})));
      } else {
        group.childIds.forEach(childId => edges.push(labeledEdge({from: sourceId, to: childId, edgeKind: 'parent', label: childRelationLabel(group.parentIds, childId), arrows: {to: {enabled: true, scaleFactor: 0.8}}, color: {color: themeColors.edge, highlight: themeColors.edgeHighlight}, width: 2, smooth: {enabled: true, type: 'dynamic'}, ...organicEdgePhysics('parent', group.parentIds, childId)})));
      }
      return;
    }
    // Single child: connect directly, no need for a shared trunk to split.
    if (group.childIds.length < 2 && !hasCouple) {
      group.childIds.forEach(childId => edges.push(labeledEdge({from: sourceId, to: childId, edgeKind: 'parent', label: childRelationLabel(group.parentIds, childId), arrows: {to: {enabled: true, scaleFactor: 0.8}}, color: {color: themeColors.edge, highlight: themeColors.edgeHighlight}, width: 2, smooth: {enabled: true, type: 'cubicBezier', forceDirection: 'vertical', roundness: classicTree ? 0.35 : 0.5}})));
      return;
    }
    // Whether one parent or a couple: a single trunk drops from the parent (or the
    // couple's union point) to an invisible branch node, which then fans out to each
    // child. This shared-trunk shape (one line splitting into several) is what gives
    // the classic pedigree chart its T/Y-junction look, instead of independent lines
    // radiating straight from the parent to every child.
    const intersectionId = `union_${group.parentIds.join('_')}`;
    const branchId = `${intersectionId}_branch`;
    let unionPosition;
    if (hasCouple) {
      const coupleKey = [...group.parentIds].sort().join('|');
      const unionId = unionOfCouple.get(coupleKey);
      unionPosition = classicPositions?.get(unionId) || classicPositions?.get(intersectionId);
    } else {
      unionPosition = classicPositions?.get(sourceId);
    }
    // Use the most common child Y (not just the first child) as the branch row: a child
    // who is also a spouse grafted into a different branch elsewhere sits at that other
    // branch's row, not this family's true generational row, and must not skew the trunk.
    const childPositions = group.childIds.map(childId => classicPositions?.get(childId)).filter(Boolean);
    const yCounts = new Map();
    childPositions.forEach(pos => yCounts.set(pos.y, (yCounts.get(pos.y) || 0) + 1));
    let childLaneY = unionPosition?.y;
    let bestCount = 0;
    yCounts.forEach((count, y) => { if (count > bestCount) { bestCount = count; childLaneY = y; } });
    const branchPosition = unionPosition && childLaneY !== undefined ? {x: unionPosition.x, y: (unionPosition.y + childLaneY) / 2} : {};
    if (hasCouple) {
      invisibleClassicNode(intersectionId, unionPosition || {}, Math.max(...group.parentIds.map(parentId => levels.get(parentId) || 0)) + 0.5);
    }
    invisibleClassicNode(branchId, branchPosition, Math.max(...group.childIds.map(childId => levels.get(childId) || 0)) - 0.4);
    const trunkFrom = hasCouple ? intersectionId : sourceId;
    edges.push({from: trunkFrom, to: branchId, edgeKind: 'parent', arrows: {to: {enabled: false}}, label: '', color: {color: themeColors.edge, opacity: 0.9}, width: 2, smooth: {enabled: true, type: 'cubicBezier', forceDirection: 'vertical', roundness: 0.25}});
    // Every child, including one grafted in elsewhere via marriage and sitting at a
    // different row, still branches off the same shared trunk point Ã¢â‚¬â€ this keeps the
    // single-trunk-splits-into-many look consistent no matter where the child lands.
    group.childIds.forEach(childId => edges.push(labeledEdge({from: branchId, to: childId, edgeKind: 'parent', label: childRelationLabel(group.parentIds, childId), arrows: {to: {enabled: true, scaleFactor: 0.8}}, color: {color: themeColors.edge, highlight: themeColors.edgeHighlight}, width: 2, smooth: {enabled: true, type: 'cubicBezier', forceDirection: 'vertical', roundness: 0.45}})));
  });
  return {nodes, edges};
}

