function accountPasswordRequirementState(password, confirmation) {
  return {
    length: password.length >= 12,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
    match: password.length > 0 && password === confirmation,
  };
}

function accountInitials(displayName, username) {
  const parts = (displayName || username || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function accountApplyAvatar(dataString) {
  ['avatarImageDisplay', 'popoverAvatarImage', 'modalAvatarImage'].forEach(id => {
    const image = document.getElementById(id);
    if (image) {
      image.src = dataString;
      image.hidden = false;
    }
  });
  ['avatarInitialsDisplay', 'popoverAvatarInitials', 'modalAvatarInitials'].forEach(id => {
    const initials = document.getElementById(id);
    if (initials) initials.hidden = true;
  });
}
