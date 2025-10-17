import { hash, verify } from '@node-rs/argon2';

interface HashPasswordParams {
  password: string;
}

async function hashPassword({ password }: HashPasswordParams) {
  return hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1
  });
}

interface VerifyPasswordParams {
  storedHash: string;
  passwordAttempt: string;
}

async function verifyPassword({ storedHash, passwordAttempt }: VerifyPasswordParams) {
  return verify(storedHash, passwordAttempt);
}

export { hashPassword, verifyPassword };
