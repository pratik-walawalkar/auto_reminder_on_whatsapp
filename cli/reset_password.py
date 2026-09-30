import sqlite3
from werkzeug.security import generate_password_hash

conn = sqlite3.connect('family_vault.db')
cursor = conn.cursor()

# Get all users
cursor.execute('SELECT username, display_name, role FROM users')
users = cursor.fetchall()
print("Current users in database:")
for user in users:
    print(f"  - {user[0]}: {user[1]} ({user[2]})")

# Update admin password to 'password' for simplicity
new_hash = generate_password_hash('password')
cursor.execute('UPDATE users SET password_hash = ? WHERE username = ?', (new_hash, 'admin'))
conn.commit()

print("\nPassword reset successfully!")
print("\nLogin credentials:")
print("  Username: admin")
print("  Password: password")
print("  Display Name: Pratik Walawalkar")
print("  Role: admin")

conn.close()


