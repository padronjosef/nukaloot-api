import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * scrypt ships with Node, so there is no native module to build into the
 * image. Format: `scrypt$<salt hex>$<derived key hex>`.
 */
export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
};

export const verifyPassword = async (
  password: string,
  stored: string,
): Promise<boolean> => {
  const [scheme, saltHex, keyHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;

  const derived = await scryptAsync(
    password,
    Buffer.from(saltHex, 'hex'),
    KEY_LENGTH,
  );
  const expected = Buffer.from(keyHex, 'hex');

  return (
    derived.length === expected.length && timingSafeEqual(derived, expected)
  );
};
