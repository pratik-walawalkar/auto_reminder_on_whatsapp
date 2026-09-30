function treeAnimateConnections({state, network, edges, personById, activeTheme, overlayColors, defs}) {
    if (!state.svgOverlay || state.edgeStyle !== 'moving-dots') return;
    state.svgOverlay.querySelectorAll('path.family-link, circle.link-dot, text.connection-label, animateMotion').forEach(el => el.remove());
    state.connectionMask?.remove();
    state.connectionAnimationLayer?.remove();
    
    const positions = network.getPositions();
    const zoom = network.getScale();
    const toCanvas = pos => network.canvasToDOM(pos);
    // Keep the overlay above the canvas for animation, but exclude every node card from it.
    const maskId = `connection-mask-${Date.now()}`;
    const mask = document.createElementNS('http://www.w3.org/2000/svg', 'mask');
    mask.setAttribute('id', maskId);
    mask.setAttribute('maskUnits', 'userSpaceOnUse');
    const maskBackground = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    maskBackground.setAttribute('width', '100%');
    maskBackground.setAttribute('height', '100%');
    maskBackground.setAttribute('fill', 'white');
    mask.appendChild(maskBackground);
    Object.keys(positions).forEach(nodeId => {
      const bounds = network.getBoundingBox(nodeId);
      if (!bounds) return;
      const topLeft = toCanvas({x: bounds.left, y: bounds.top});
      const bottomRight = toCanvas({x: bounds.right, y: bounds.bottom});
      const shield = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      shield.setAttribute('x', String(topLeft.x));
      shield.setAttribute('y', String(topLeft.y));
      shield.setAttribute('width', String(Math.max(0, bottomRight.x - topLeft.x)));
      shield.setAttribute('height', String(Math.max(0, bottomRight.y - topLeft.y)));
      shield.setAttribute('fill', 'black');
      mask.appendChild(shield);
    });
    defs.appendChild(mask);
    const animationLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    animationLayer.setAttribute('mask', `url(#${maskId})`);
    state.connectionMask = mask;
    state.connectionAnimationLayer = animationLayer;
    state.svgOverlay.appendChild(animationLayer);
    // The overlay uses screen coordinates, so scale the dot with the network zoom.
    const dotRadius = 5.5 * zoom;
    const endpointGap = 2 * zoom;
    edges.filter(edge => edge.edgeKind === 'parent').forEach((edge, idx) => {
      const fromPos = positions[edge.from];
      const toPos = positions[edge.to];
      if (!fromPos || !toPos) return;
      
      const renderedEdge = network.body.edges[edge.id];
      if (!renderedEdge?.edgeType?.fromPoint || !renderedEdge.edgeType.toPoint) return;
      const fromScreen = toCanvas(renderedEdge.edgeType.fromPoint);
      const toScreen_pos = toCanvas(renderedEdge.edgeType.toPoint);
      const via = renderedEdge.edgeType.getViaNode();
      const viaScreen = via?.[0]?.x !== undefined && via?.[1]?.x !== undefined
        ? [toCanvas(via[0]), toCanvas(via[1])] : null;
      const destinationBounds = network.getBoundingBox(edge.to);
      const destinationCenter = toCanvas(positions[edge.to]);
      const destinationBottomRight = toCanvas({x: destinationBounds.right, y: destinationBounds.bottom});
      const tangentStart = viaScreen?.[1] || fromScreen;
      const tangent = {x: destinationCenter.x - tangentStart.x, y: destinationCenter.y - tangentStart.y};
      const tangentLength = Math.hypot(tangent.x, tangent.y) || 1;
      const direction = {x: tangent.x / tangentLength, y: tangent.y / tangentLength};
      const boundaryDistance = Math.min(
        (destinationBottomRight.x - destinationCenter.x) / Math.abs(direction.x || Infinity),
        (destinationBottomRight.y - destinationCenter.y) / Math.abs(direction.y || Infinity)
      );
      const nodeBoundary = {
        x: destinationCenter.x - direction.x * Math.max(0, boundaryDistance - dotRadius - endpointGap),
        y: destinationCenter.y - direction.y * Math.max(0, boundaryDistance - dotRadius - endpointGap)
      };
      const pathData = viaScreen
        ? `M${fromScreen.x} ${fromScreen.y} C${viaScreen[0].x} ${viaScreen[0].y},${viaScreen[1].x} ${viaScreen[1].y},${nodeBoundary.x} ${nodeBoundary.y}`
        : `M${fromScreen.x} ${fromScreen.y} L${nodeBoundary.x} ${nodeBoundary.y}`;
      
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('class', 'link-dot');
      dot.setAttribute('r', String(dotRadius));
      dot.setAttribute('id', `dot-${idx}`);
      dot.dataset.edgeId = edge.id;
      dot.style.opacity = state.lineageHover?.vividEdges.has(edge.id) ? '1' : state.lineageHover ? '0.12' : '';

      const destination = personById.get(edge.to);
      const destinationColor = destination?.gender === 'M'
        ? activeTheme.nodeBorderMale
        : destination?.gender === 'F' ? activeTheme.nodeBorderFemale : overlayColors.dot;
      const colorAnimation = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
      colorAnimation.setAttribute('attributeName', 'fill');
      colorAnimation.setAttribute('dur', '2s');
      colorAnimation.setAttribute('values', `${overlayColors.dot};${destinationColor}`);
      colorAnimation.setAttribute('repeatCount', 'indefinite');
      colorAnimation.setAttribute('calcMode', 'linear');

      const opacityAnimation = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
      opacityAnimation.setAttribute('attributeName', 'opacity');
      opacityAnimation.setAttribute('dur', '2s');
      const initialDotOpacity = state.lineageHover
        ? state.lineageHover.vividEdges.has(edge.id) ? 1 : 0.12
        : 1;
      opacityAnimation.setAttribute('values', `${initialDotOpacity};${initialDotOpacity};0`);
      opacityAnimation.setAttribute('keyTimes', '0;0.92;1');
      opacityAnimation.setAttribute('repeatCount', 'indefinite');
      opacityAnimation.setAttribute('calcMode', 'linear');

      const animate = document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
      animate.setAttribute('dur', '2s');
      animate.setAttribute('repeatCount', 'indefinite');
      animate.setAttribute('path', pathData);
      dot.appendChild(colorAnimation);
      dot.appendChild(opacityAnimation);
      dot.appendChild(animate);
      animationLayer.appendChild(dot);
    });
  };


