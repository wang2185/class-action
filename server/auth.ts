import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";
import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";

const BCRYPT_ROUNDS = 12;
const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4시간

export function setupAuth(app: Express) {
  if (process.env.NODE_ENV === "production" && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16)) {
    throw new Error("SESSION_SECRET(16자 이상)을 운영 환경에 반드시 설정해야 합니다.");
  }
  const PgStore = connectPgSimple(session);

  app.use(
    session({
      store: new PgStore({
        conString: process.env.DATABASE_URL,
        tableName: "session",
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "change-me",
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        maxAge: SESSION_TTL_MS,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  // Local strategy
  passport.use(
    new LocalStrategy(
      { usernameField: "email", passwordField: "password" },
      async (email, password, done) => {
        try {
          const [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, email.toLowerCase().trim()))
            .limit(1);

          if (!user || !user.password) {
            await bcrypt.hash("dummy", BCRYPT_ROUNDS); // 타이밍 공격 완화 + 소셜 전용 계정 분기
            const msg = user && !user.password
              ? "소셜 로그인으로 가입된 계정입니다. 간편 로그인을 이용해주세요."
              : "이메일 또는 비밀번호가 올바르지 않습니다.";
            return done(null, false, { message: msg });
          }

          const valid = await bcrypt.compare(password, user.password);
          if (!valid) {
            return done(null, false, { message: "이메일 또는 비밀번호가 올바르지 않습니다." });
          }

          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      done(null, user || null);
    } catch (err) {
      done(err);
    }
  });
}

// 로그인 시 세션 재생성 (Session Fixation 방지)
export function loginWithSessionRegeneration(req: Request, user: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const passportData = (req.session as any).passport;
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.login(user, (loginErr) => {
        if (loginErr) return reject(loginErr);
        req.session.save((saveErr) => {
          if (saveErr) return reject(saveErr);
          resolve();
        });
      });
    });
  });
}

// Middleware: 로그인 필수
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "로그인이 필요합니다." });
  }
  next();
}

// Middleware: 관리자 필수 (lawyer·owner 는 관리자 권한 전부 보유)
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "로그인이 필요합니다." });
  }
  const role = (req.user as any).role;
  if (role !== "admin" && role !== "lawyer" && role !== "owner") {
    return res.status(403).json({ error: "관리자 권한이 필요합니다." });
  }
  next();
}

// Middleware: 변호사 필수 (전환기 — admin·owner 도 허용)
export function requireLawyer(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "로그인이 필요합니다." });
  }
  const role = (req.user as any).role;
  if (role !== "lawyer" && role !== "admin" && role !== "owner") {
    return res.status(403).json({ error: "변호사 권한이 필요합니다." });
  }
  next();
}

// Middleware: 오너(최고관리자) 필수 — 권한 부여·경영 콘솔 등 최상위 작업
export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "로그인이 필요합니다." });
  }
  if ((req.user as any).role !== "owner") {
    return res.status(403).json({ error: "오너 권한이 필요합니다." });
  }
  next();
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
