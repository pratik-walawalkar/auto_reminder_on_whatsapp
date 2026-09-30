function treeComputeDynamicGenerations(people, parentsOf) {
  const levels = new Map();
  const queue = [];
  people.forEach(person => {
    if (!(parentsOf.get(person.id) || []).length) {
      levels.set(person.id, 0);
      queue.push(person.id);
    }
  });
  while (queue.length) {
    const parentId = queue.shift();
    const parentLevel = levels.get(parentId);
    people.forEach(person => {
      if (!(parentsOf.get(person.id) || []).includes(parentId)) return;
      const nextLevel = parentLevel + 1;
      if (!levels.has(person.id) || levels.get(person.id) < nextLevel) {
        levels.set(person.id, nextLevel);
        queue.push(person.id);
      }
    });
  }
  people.forEach(person => { if (!levels.has(person.id)) levels.set(person.id, 0); });
  return levels;
}

function treeBuildUnionMaps(unions, people) {
  const partnerOf = new Map();
  const unionOfCouple = new Map();
  const childrenOf = new Map();
  unions.forEach(union => {
    const pids = (union.partners || []).map(p => p.individual_id).filter(Boolean);
    if (pids.length === 2) {
      const sorted = [...pids].sort();
      partnerOf.set(pids[0], pids[1]);
      partnerOf.set(pids[1], pids[0]);
      unionOfCouple.set(sorted.join('|'), union.id);
    }
    if (pids.length >= 1) {
      const coupleKey = [...pids].sort().join('|');
      const childIds = (union.children || [])
        .map(c => c.individual_id)
        .filter(cid => people.some(p => p.id === cid));
      if (childIds.length) {
        const existing = childrenOf.get(coupleKey) || [];
        childrenOf.set(coupleKey, [...new Set([...existing, ...childIds])]);
      }
    }
  });
  return {partnerOf, unionOfCouple, childrenOf};
}
