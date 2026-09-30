import sqlite3
from werkzeug.security import generate_password_hash

conn = sqlite3.connect('family_vault.db')
cursor = conn.cursor()

# Update admin password to the original: adminadmin123#
original_password = 'adminadmin123#'
new_hash = generate_password_hash(original_password)
cursor.execute('UPDATE users SET password_hash = ? WHERE username = ?', (new_hash, 'admin'))
conn.commit()

print("Password restored successfully!")
print("\nLogin credentials:")
print("  Username: admin")
print("  Password: adminadmin123#")
print("  Display Name: Pratik Walawalkar")
print("  Role: admin")

conn.close()


