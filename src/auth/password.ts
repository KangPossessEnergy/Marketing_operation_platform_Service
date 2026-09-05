import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT_PREFIX = 'scrypt';
const SCRYPT_KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString('hex');

  return `${SCRYPT_PREFIX}$${salt}$${hash}`;
}

export function verifyPassword(
  password: string,
  passwordHash: string,
): boolean {
  const [algorithm, salt, expectedHash] = passwordHash.split('$');

  if (
    algorithm !== SCRYPT_PREFIX ||
    !salt ||
    !expectedHash ||
    !/^[a-f0-9]+$/i.test(expectedHash)
  ) {
    return false;
  }

  const actualHash = scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  const expectedHashBuffer = Buffer.from(expectedHash, 'hex');

  return (
    actualHash.length === expectedHashBuffer.length &&
    timingSafeEqual(actualHash, expectedHashBuffer)
  );
}
