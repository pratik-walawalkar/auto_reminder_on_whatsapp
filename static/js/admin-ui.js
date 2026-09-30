function adminDescribeProposal(proposal) {
  if (proposal.kind === 'delete') return `delete · ${escapeHtml(proposal.target_id)}`;
  return `${escapeHtml(proposal.kind)} · ${escapeHtml(proposal.target_id || proposal.payload.id)}`;
}

function adminUserField(label, name, value = '', type = 'text', placeholder = '') {
  return `<label>${label}<input name="${name}" value="${escapeHtml(value)}" type="${type}" placeholder="${escapeHtml(placeholder)}"></label>`;
}
