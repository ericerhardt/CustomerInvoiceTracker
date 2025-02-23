import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { sendPasswordResetEmail } from "./email";

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

      // Create the user
      const user = await storage.createUser({
        ...req.body,
        password: await hashPassword(req.body.password),
      });

      // Create default settings for the new user
      try {
        await storage.upsertSettings({
          userId: user.id,
          companyName: '',
          companyAddress: '',
          companyEmail: '',
          stripeSecretKey: '',
          stripePublicKey: '',
          stripeWebhookSecret: null,
          sendGridApiKey: '',
          sendGridFromEmail: '',
          resetLinkUrl: `http://localhost:5000/reset-password`,
          taxRate: 10,
        });
        console.log('Created default settings for new user:', user.id);
      } catch (settingsError) {
        console.error('Failed to create default settings:', settingsError);
        // Continue with registration even if settings creation fails
      }

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
      console.log('Processing password reset request for email:', req.body.email);
      const { email } = req.body;
      const user = await storage.getUserByEmail(email);

      if (user) {
        console.log('User found, generating reset token...');
        const resetToken = randomBytes(32).toString('hex');

        // Get settings to use custom reset URL
        const settings = await storage.getSettingsByUserId(user.id);
        const baseResetUrl = settings?.resetLinkUrl || `${process.env.APP_URL || 'http://localhost:5000'}/reset-password`;

        // Store reset token with user ID
        console.log('Storing reset token in session store...');
        const sessionData = {
          cookie: {
            originalMaxAge: 24 * 60 * 60 * 1000, // 24 hours
            expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
          },
          userId: user.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        };
        await storage.sessionStore.set(`pwreset_${resetToken}`, sessionData);

        console.log('Attempting to send password reset email...');
        try {
          await sendPasswordResetEmail({
            to: email,
            resetToken,
            resetUrl: baseResetUrl,
            userId: user.id
          });
          console.log('Password reset email sent successfully');
          res.json({ message: 'Password reset email sent' });
        } catch (emailError) {
          console.error('Failed to send password reset email:', emailError);
          res.status(500).json({ 
            message: 'Failed to send password reset email',
            error: emailError instanceof Error ? emailError.message : 'Unknown error'
          });
        }
      } else {
        console.log('No user found for email:', email);
        // Return success even if user not found for security
        res.json({ message: 'If an account exists, a reset email will be sent' });
      }
    } catch (error) {
      console.error('Password reset error:', error);
      res.status(500).json({ 
        message: 'Failed to process password reset',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post("/api/reset-password/confirm", async (req, res) => {
    try {
      const { token, newPassword } = req.body;

      storage.sessionStore.get(`pwreset_${token}`, async (err, data) => {
        if (err || !data) {
          return res.status(400).json({ message: 'Invalid or expired reset token' });
        }

        const tokenData = JSON.parse(data.toString());
        const now = new Date();
        if (now > new Date(tokenData.expiresAt)) {
          return res.status(400).json({ message: 'Reset token has expired' });
        }

        // Update password
        const user = await storage.getUser(tokenData.userId);
        if (!user) {
          return res.status(400).json({ message: 'User not found' });
        }

        const hashedPassword = await hashPassword(newPassword);
        await storage.updateUserPassword(user.id, hashedPassword);

        // Clean up the reset token
        storage.sessionStore.destroy(`pwreset_${token}`);

        res.json({ message: 'Password updated successfully' });
      });
    } catch (error) {
      console.error('Password reset confirmation error:', error);
      res.status(500).json({ message: 'Failed to reset password' });
    }
  });
}