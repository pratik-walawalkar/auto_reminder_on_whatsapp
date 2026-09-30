function exportDownloadBlob(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], {type}));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportCloseMenu() {
  $('exportDropdownMenu').classList.add('hidden');
  $('exportDropdownBtn').setAttribute('aria-expanded', 'false');
}

function exportCalculateBounds(activeNetwork, nodesData) {
  const positions = activeNetwork.getPositions();
  const nodes = nodesData.get();
  const points = nodes.map(node => positions[node.id]).filter(Boolean);
  if (!points.length) return null;
  const halfWidth = 100;
  const halfHeight = 38;
  const padding = 48;
  const minX = Math.floor(Math.min(...points.map(point => point.x - halfWidth)) - padding);
  const minY = Math.floor(Math.min(...points.map(point => point.y - halfHeight)) - padding);
  const maxX = Math.ceil(Math.max(...points.map(point => point.x + halfWidth)) + padding);
  const maxY = Math.ceil(Math.max(...points.map(point => point.y + halfHeight)) + padding);
  return {positions, nodes, minX, minY, width: maxX - minX, height: maxY - minY};
}
