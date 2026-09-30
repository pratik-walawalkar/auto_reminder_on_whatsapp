function resetTreeLifecycle({network, networkNodes, networkEdges, container, state}) {
  if (networkNodes) networkNodes.clear();
  if (networkEdges) networkEdges.clear();
  if (network) network.destroy();
  if (container) container.replaceChildren();
  state.svgOverlay = null;
  state.edgeAnimationMap = null;
  state.scale = 1;
  state.x = 40;
  state.y = 40;
}

function preserveNetworkViewport(activeNetwork) {
  if (!activeNetwork) return null;
  return {view: activeNetwork.getViewPosition(), scale: activeNetwork.getScale()};
}

function restoreNetworkViewport(activeNetwork, viewport) {
  if (activeNetwork && viewport) {
    activeNetwork.moveTo({position: viewport.view, scale: viewport.scale, animation: false});
  }
}
