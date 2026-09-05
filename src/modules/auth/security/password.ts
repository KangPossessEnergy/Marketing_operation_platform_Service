import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derivedKey}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [algorithm, salt, key] = storedHash.split('$');

  if (algorithm !== 'scrypt' || !salt || !key) {
    return false;
  }

  try {
    const storedKey = Buffer.from(key, 'hex');
    const derivedKey = scryptSync(password, salt, storedKey.length);
    return (
      storedKey.length === derivedKey.length &&
      timingSafeEqual(storedKey, derivedKey)
    );
  } catch {
    return false;
  }
}
