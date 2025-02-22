import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || 'dev-secret-key',
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      const user = await storage.getUserByUsername(username);
      if (!user || !(await comparePasswords(password, user.password))) {
        return done(null, false);
      } else {
        return done(null, user);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    const user = await storage.getUser(id);
    done(null, user);
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).send("Username already exists");
      }

      const user = await storage.createUser({
        ...req.body,
        password: await hashPassword(req.body.password),
      });

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(user);
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    res.status(200).json(req.user);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });

  app.post("/api/reset-password", async (req, res) => {
    try {
      const { email } = req.body;
      const user = await storage.getUserByUsername(email);
      
      if (user) {
        const resetToken = randomBytes(32).toString('hex');
        const resetUrl = `${process.env.APP_URL || 'http://localhost:5000'}/reset-password`;
        
        // Store reset token in database (you may want to add this to your schema)
        // For now we'll use the session store temporarily
        storage.sessionStore.set(`pwreset_${resetToken}`, user.id, (err) => {
          if (err) throw err;
        });

        await sendPasswordResetEmail({
          to: email,
          resetToken,
          resetUrl
        });

        res.json({ message: 'Password reset email sent' });
      } else {
        // Return success even if user not found for security
        res.json({ message: 'If an account exists, a reset email will be sent' });
      }
    } catch (error) {
      console.error('Password reset error:', error);
      res.status(500).json({ message: 'Failed to process password reset' });
    }
  });

  app.post("/api/reset-password/confirm", async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      
      storage.sessionStore.get(`pwreset_${token}`, async (err, userId) => {
        if (err || !userId) {
          return res.status(400).json({ message: 'Invalid or expired reset token' });
        }

        // Update password
        const user = await storage.getUser(userId);
        if (!user) {
          return res.status(400).json({ message: 'User not found' });
        }

        const hashedPassword = await hashPassword(newPassword);
        await storage.updateUserPassword(user.id, hashedPassword);
        
        // Clean up the reset token
        storage.sessionStore.destroy(`pwreset_${token}`, (err) => {
          if (err) console.error('Failed to cleanup reset token:', err);
        });

        res.json({ message: 'Password updated successfully' });
      });
    } catch (error) {
      console.error('Password reset confirmation error:', error);
      res.status(500).json({ message: 'Failed to reset password' });
    }
  });
