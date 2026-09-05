function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export default () => ({
  app: {
    port: readPositiveInteger(process.env.PORT, 3000),
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET,
    accessTokenExpiresIn: readPositiveInteger(
      process.env.ACCESS_TOKEN_EXPIRES_IN,
      3600,
    ),
  },
  sms: {
    provider: process.env.SMS_PROVIDER ?? 'mock',
    codeSecret:
      process.env.SMS_CODE_SECRET ??
      process.env.JWT_SECRET ??
      'nest-learn-development-sms-secret',
    codeExpiresIn: readPositiveInteger(process.env.SMS_CODE_EXPIRES_IN, 300),
    resendInterval: readPositiveInteger(
      process.env.SMS_CODE_RESEND_INTERVAL,
      60,
    ),
    maxAttempts: readPositiveInteger(process.env.SMS_CODE_MAX_ATTEMPTS, 5),
    fixedCode: process.env.SMS_FIXED_CODE,
  },
});
