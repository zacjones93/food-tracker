import * as bcrypt from 'bcryptjs';

interface HashPasswordParams {
  password: string;
}

async function hashPassword({ password }: HashPasswordParams) {
  // Use bcrypt (pure JS, works in Cloudflare Workers)
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

interface VerifyPasswordParams {
  storedHash: string;
  passwordAttempt: string;
}

async function verifyPassword({ storedHash, passwordAttempt }: VerifyPasswordParams) {
  // Check if it's an Argon2 hash (existing passwords from before migration)
  if (storedHash.startsWith('$argon2')) {
    // Legacy Argon2 hashes - these cannot be verified in Workers
    // User will need to reset password
    // For now, return false to prompt password reset
    throw new Error('Legacy password format detected. Please contact support to reset your password.');
  }

  // Bcrypt verification (new passwords)
  return bcrypt.compare(passwordAttempt, storedHash);
}

export { hashPassword, verifyPassword };
