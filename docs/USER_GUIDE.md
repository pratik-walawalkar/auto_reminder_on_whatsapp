# Family Vault user guide

## What Family Vault is

Family Vault is a private family-history application available only through your family Tailnet and a Family Vault account. It lets you explore the shared family tree and suggest additions or corrections. An administrator reviews every suggestion before it changes the official record.

## Sign in

1. Open the Family Vault address shared by your administrator.
2. Enter the username and password supplied by the administrator.
3. Select **Sign in**.

Contact an administrator if you do not have an account or cannot sign in. There is no self-registration.

## Explore the family tree

- **Open a person:** select a card in the tree. A panel slides in from the right with that person's details and an edit form.
- **Switch to another person:** while the panel is open, select a different card. The panel updates in place — you do not need to close it first.
- **Move around:** drag an empty area of the tree.
- **Zoom:** use your mouse wheel or trackpad. On a touch device, use the browser zoom controls if required; the tree can still be dragged.
- **Reset view:** select **Reset view** to return to the starting position and zoom.
- **Search:** type a name in **Search**. Only matching people appear.
- **Time travel:** move **View up to** to show people born on or before a selected year.
- **Switch theme:** select the sun/moon button in the header to toggle light and dark appearance. Your choice is remembered on this device.

Selecting a person shows their birth/death information, roots, migration history, tags, and notes, followed by an edit form for that person. A locked padlock on a card means that person is marked private — non-administrators see only their name and place; sensitive details are hidden until an administrator signs in.

## Suggest a new family member

1. Select **+ Add family member**. The same right-side panel opens, empty and ready for a new entry.
2. Enter the person's first name, last name, and gender. A person ID is generated for you automatically from the name (falling back to birth year, then a number, only if that name is already used) — you do not need to invent one.
3. Birth date is optional. Enter as much as you know (a year alone is fine, e.g. `1948`) or leave it blank if unknown; it will be stored as "unknown".
4. Choose a relationship:
   - **No known parents / start a branch** adds a separate branch.
   - **Child of an existing family unit** links the person to known parents. Select the appropriate family unit.
5. Add any known locations, cultural details, migration information, or notes.
6. Optionally add **Tags** (comma-separated words, e.g. `Verified, Needs research`) to help organize the tree, and tick **Mark this person as private** if their details should be hidden from non-administrators.
7. Select **Submit for review**.

Your suggestion remains pending until an administrator approves or rejects it. It does not alter the official tree immediately.

## Suggest a correction

1. Select the person's card in the tree. The right-side panel opens pre-filled with their current details.
2. Correct the available information.
3. Select **Submit for review**.

Editing a person only changes the fields shown in the form; other recorded details (such as migration history) are kept as they are. Please add only information that the family has agreed to store. Be especially careful with details about living people.

## Suggest removing a person

1. Select the person's card in the tree.
2. In the right-side panel, select **Delete this person** and confirm.

This submits a deletion request; the person is not removed until an administrator approves it. Approval also detaches the person from any recorded marriage/parentage without affecting other family members in that family unit.

## For administrators

Administrators see **Review proposals** and **Manage users** in the header.

### Reviewing proposals

1. Open **Review proposals**.
2. Read the proposed data (additions, edits, or deletions) and verify it with the contributor or family evidence.
3. Select **Approve** to update the official ledger, or **Reject** to leave it unchanged.

Approved updates are validated and backed up automatically.

### Managing family accounts

1. Open **Manage users**.
2. To add someone, fill in their display name, a username, a temporary password (at least 12 characters), and a role, then select **Create account**. Share the username and temporary password with them directly and privately — never over a public channel.
3. To change an existing account, use **Make admin**/**Make member** to change its role, **Reset password** to set a new temporary password, or **Delete** to remove the account.
4. The system always keeps at least one administrator: you cannot demote or delete the last remaining admin, and you cannot delete your own account.

### Exporting to Gramps or another genealogy tool

Select **Export GEDCOM** in the header to download the whole family ledger as a standard `.ged` file. GEDCOM 5.5.1 is the common exchange format supported by Gramps, Ancestry, MyHeritage, and most other genealogy software, so this lets you back up to or move into another tool without retyping anything. People marked private are still included but flagged as restricted in the file.

Never share credentials, the backup passphrase, or Tailnet access outside the family.

## Troubleshooting

| Problem | What to do |
| --- | --- |
| Cannot reach the site | Confirm Tailnet is connected and ask the host administrator whether the Family Vault PC is online. |
| Cannot sign in | Confirm the username spelling; ask an administrator to reset or create the account. |
| A person is missing | Check search text and the **View up to** year. A person born after that year is hidden. |
| A proposal fails | Check required fields and the person ID. For a child relationship, choose an existing family unit. |
| Need a change to an approved record | Submit an edit proposal; do not modify files directly. |

## Privacy

Treat everything in Family Vault as private family information. Do not copy data into public chats, public websites, or untrusted AI tools without the family’s consent.
