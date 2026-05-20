import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { eq } from 'drizzle-orm';
import { db, pool } from './db';
import { env, isProd } from './env';
import { users } from './schema';
import type { SessionUser } from '../shared/types';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

const PgSession = connectPgSimple(session);

export const sessionMiddleware = session({
  name: 'terp_agro_sid',
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: new PgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: false
  }),
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 1000 * 60 * 60 * 12
  }
});

export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const userId = req.session.userId;
  if (!userId) return null;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.active) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as SessionUser['role'],
    workLoop: user.workLoop ?? null
  };
}

export async function verifyLogin(email: string, password: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (!user || !user.active) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return user;
}

export function setLoggedIn(req: Request, userId: string) {
  return new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }
      req.session.userId = userId;
      resolve();
    });
  });
}

export function clearLogin(req: Request, res: Response) {
  return new Promise<void>((resolve, reject) => {
    req.session.destroy((error) => {
      if (error) {
        reject(error);
        return;
      }
      res.clearCookie('terp_agro_sid');
      resolve();
    });
  });
}
