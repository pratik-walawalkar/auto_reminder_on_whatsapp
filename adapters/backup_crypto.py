from __future__ import annotations

import hashlib
import os
import secrets

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

MAGIC = b"FAMILYVAULTDB1"
SALT_BYTES = 16
NONCE_BYTES = 12
SCRYPT_N = 2**15
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_MAXMEM = 64 * 1024 * 1024


class BackupCryptoError(RuntimeError):
    pass


def passphrase() -> bytes:
    value = os.environ.get("FAMILY_VAULT_BACKUP_PASSPHRASE")
    if not value:
        raise BackupCryptoError("Set FAMILY_VAULT_BACKUP_PASSPHRASE before creating, verifying, or restoring a backup.")
    return value.encode("utf-8")


def derive_key(secret: bytes, salt: bytes) -> bytes:
    try:
        return hashlib.scrypt(secret, salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, maxmem=SCRYPT_MAXMEM, dklen=32)
    except ValueError as error:
        raise BackupCryptoError("Unable to derive the backup key on this host.") from error


def encrypt(plaintext: bytes, secret: bytes) -> bytes:
    salt = secrets.token_bytes(SALT_BYTES)
    nonce = secrets.token_bytes(NONCE_BYTES)
    ciphertext = AESGCM(derive_key(secret, salt)).encrypt(nonce, plaintext, MAGIC)
    return MAGIC + salt + nonce + ciphertext


def decrypt(payload: bytes, secret: bytes) -> bytes:
    minimum = len(MAGIC) + SALT_BYTES + NONCE_BYTES + 16
    if len(payload) < minimum or payload[:len(MAGIC)] != MAGIC:
        raise BackupCryptoError("This is not a Family Vault encrypted database backup.")
    salt_start = len(MAGIC)
    salt_end = salt_start + SALT_BYTES
    nonce_end = salt_end + NONCE_BYTES
    try:
        return AESGCM(derive_key(secret, payload[salt_start:salt_end])).decrypt(
            payload[salt_end:nonce_end], payload[nonce_end:], MAGIC
        )
    except Exception as error:
        raise BackupCryptoError("Backup decryption failed. Check the passphrase and file integrity.") from error


