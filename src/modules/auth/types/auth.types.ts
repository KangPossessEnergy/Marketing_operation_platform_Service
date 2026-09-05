import type { Request } from 'express';

export interface PublicUser {
  id: string;
  username: string | null;
  phone: string | null;
}

export interface AuthResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: PublicUser;
}

export interface SendSmsCodeResult {
  message: string;
  expiresIn: number;
}

export interface AccessTokenPayload {
  sub: string;
  username: string | null;
  sid: string;
  iat: number;
  exp: number;
}

export interface AuthenticatedUser {
  id: string;
  username: string | null;
  sessionId: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
