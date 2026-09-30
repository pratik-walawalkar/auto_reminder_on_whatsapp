function adminDescribeProposalView(proposal) {
  return adminDescribeProposal(proposal);
}

async function adminOpenReviews() {
  try {
    const data = await api('/api/proposals');
    const content = data.proposals.length
      ? data.proposals
          .map(
            proposal => `
        <article class="proposal">
          <strong>${adminDescribeProposalView(proposal)}</strong>
          <p>Submitted by ${escapeHtml(proposal.proposer)}.</p>
          <pre>${escapeHtml(JSON.stringify(proposal.payload, null, 2))}</pre>
          <button data-review="${proposal.id}:approve">Approve</button>
          <button class="danger" data-review="${proposal.id}:reject">Reject</button>
        </article>`
          )
          .join('')
      : '<p>No pending proposals.</p>';
    $('reviewContent').innerHTML = `<p class="eyebrow">ADMINISTRATION</p><h2>Pending proposals</h2>${content}`;
    document.querySelectorAll('[data-review]').forEach(button => (button.onclick = () => adminReview(button.dataset.review)));
    show('reviewSheet');
  } catch (error) {
    notice(error.message);
  }
}

async function adminReview(value) {
  const [id, action] = value.split(':');
  try {
    await api(`/api/proposals/${id}/${action}`, {method: 'POST', body: JSON.stringify({})});
    await loadFamily();
    await adminOpenReviews();
    notice(`Proposal ${action}d.`);
  } catch (error) {
    notice(error.message);
  }
}

// ---------- Admin: user management ----------
function adminUserFieldView(label, name, value = '', type = 'text', placeholder = '') {
  return adminUserField(label, name, value, type, placeholder);
}

async function adminOpenUsers() {
  try {
    const data = await api('/api/admin/users');
    const rows = data.users
      .map(
        user => `
      <article class="proposal">
        <strong>${escapeHtml(user.display_name)}</strong> <span class="user-role">${escapeHtml(user.role)}</span>
        <p>Username: ${escapeHtml(user.username)}</p>
        <div class="panel-actions">
          <button data-role-toggle="${escapeHtml(user.username)}" class="secondary">${user.role === 'admin' ? 'Make member' : 'Make admin'}</button>
          <button data-reset-password="${escapeHtml(user.username)}" class="secondary">Reset password</button>
          ${user.username !== state.user.username ? `<button data-delete-user="${escapeHtml(user.username)}" class="danger">Delete</button>` : ''}
        </div>
      </article>`
      )
      .join('');
    $('reviewContent').innerHTML = `
      <p class="eyebrow">ADMINISTRATION</p>
      <h2>Family accounts</h2>
      <form id="newUserForm" class="form-grid">
        ${adminUserFieldView('Display name', 'display_name')}
        ${adminUserFieldView('Username', 'username', '', 'text', 'lowercase, letters/digits')}
        ${adminUserFieldView('Temporary password', 'password', '', 'password', 'at least 12 characters')}
        <label>Role<select name="role"><option value="member">Member</option><option value="admin">Admin</option></select></label>
        <button type="submit">Create account</button>
        <p id="userFormError" class="error" hidden></p>
      </form>
      <h3>Existing accounts</h3>
      ${rows || '<p>No accounts yet.</p>'}
    `;
    $('newUserForm').onsubmit = submitNewUser;
    document.querySelectorAll('[data-role-toggle]').forEach(button => (button.onclick = () => adminToggleRole(button.dataset.roleToggle)));
    document.querySelectorAll('[data-reset-password]').forEach(button => (button.onclick = () => adminResetPassword(button.dataset.resetPassword)));
    document.querySelectorAll('[data-delete-user]').forEach(button => (button.onclick = () => adminDeleteUserAccount(button.dataset.deleteUser)));
    show('reviewSheet');
  } catch (error) {
    notice(error.message);
  }
}

async function adminSubmitNewUser(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const data = Object.fromEntries(form.entries());
  try {
    await api('/api/admin/users', {method: 'POST', body: JSON.stringify(data)});
    await adminOpenUsers();
    notice('Account created.');
  } catch (error) {
    const target = $('userFormError');
    target.textContent = error.message;
    target.hidden = false;
  }
}

async function adminToggleRole(username) {
  const users = (await api('/api/admin/users')).users;
  const current = users.find(user => user.username === username);
  const role = current.role === 'admin' ? 'member' : 'admin';
  try {
    await api(`/api/admin/users/${encodeURIComponent(username)}`, {method: 'PATCH', body: JSON.stringify({role})});
    await adminOpenUsers();
    notice(`${username} is now a ${role}.`);
  } catch (error) {
    notice(error.message);
  }
}

async function adminResetPassword(username) {
  const password = prompt(`Enter a new password for ${username} (at least 12 characters):`);
  if (!password) return;
  try {
    await api(`/api/admin/users/${encodeURIComponent(username)}`, {method: 'PATCH', body: JSON.stringify({password})});
    notice(`Password updated for ${username}.`);
  } catch (error) {
    notice(error.message);
  }
}

async function adminDeleteUserAccount(username) {
  if (!confirm(`Delete the account for ${username}? This cannot be undone.`)) return;
  try {
    await api(`/api/admin/users/${encodeURIComponent(username)}`, {method: 'DELETE'});
    await adminOpenUsers();
    notice(`${username} was deleted.`);
  } catch (error) {
    notice(error.message);
  }
}

