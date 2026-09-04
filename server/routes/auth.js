import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { AuditLog } from '../models/AuditLog.js';
import { requireAuth, JWT_SECRET } from '../middleware/auth.js';

export const authRouter = express.Router();

// ── In-Memory Demo Users Store (Active when Mongo is disconnected or for seeded demo) ──
const fallbackUsers = new Map([
  [
    'operator@veritas.sec',
    {
      _id: 'mem_usr_8842',
      name: 'Sarah Lin',
      email: 'operator@veritas.sec',
      passwordHash: bcrypt.hashSync('veritas2026', 10),
      badgeId: 'OP-8842',
      role: 'Lead Forensic Investigator',
      clearance: 'LEVEL-3 TOP SECRET',
      department: 'Synthetic ID Taskforce',
      created_at: new Date('2026-01-15T08:00:00Z'),
      lastLogin: new Date()
    }
  ],
  [
    'analyst@veritas.sec',
    {
      _id: 'mem_usr_4109',
      name: 'David Chen',
      email: 'analyst@veritas.sec',
      passwordHash: bcrypt.hashSync('veritas2026', 10),
      badgeId: 'OP-4109',
      role: 'Forensic Intelligence Analyst',
      clearance: 'LEVEL-2 CONFIDENTIAL',
      department: 'Financial Crime Intelligence',
      created_at: new Date('2026-02-01T10:00:00Z'),
      lastLogin: new Date()
    }
  ]
]);

function createToken(user) {
  return jwt.sign(
    {
      id: user._id ? user._id.toString() : user.id,
      name: user.name,
      email: user.email,
      badgeId: user.badgeId,
      role: user.role,
      clearance: user.clearance,
      department: user.department,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function sanitizeUser(user) {
  const safe = user.toObject ? user.toObject() : { ...user };
  delete safe.password;
  delete safe.passwordHash;
  safe.id = safe._id ? safe._id.toString() : safe.id;
  return safe;
}

// ── POST /api/auth/signup ──────────────────────────────────────────────────
authRouter.post('/signup', async (req, res) => {
  try {
    const { 
      name, 
      email, 
      password, 
      badgeId, 
      role = 'Forensic Analyst', 
      clearance = 'LEVEL-2 CONFIDENTIAL', 
      department = 'Synthetic ID Taskforce' 
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Operator full name is required.' });
    }

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const finalBadgeId = badgeId && badgeId.trim() 
      ? badgeId.trim().toUpperCase() 
      : `OP-${Math.floor(1000 + Math.random() * 9000)}`;

    const isDbConnected = mongoose.connection.readyState === 1;

    let user;
    if (isDbConnected) {
      const existingUser = await User.findOne({ email: normalizedEmail });
      if (existingUser) {
        return res.status(409).json({ error: 'An operator with this email address already exists.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      user = await User.create({
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        badgeId: finalBadgeId,
        role: role.trim(),
        clearance: clearance.trim(),
        department: department.trim(),
        lastLogin: new Date()
      });
    } else {
      if (fallbackUsers.has(normalizedEmail)) {
        return res.status(409).json({ error: 'An operator with this email address already exists.' });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = {
        _id: `mem_usr_${Date.now()}`,
        name: name.trim(),
        email: normalizedEmail,
        passwordHash: hashedPassword,
        badgeId: finalBadgeId,
        role: role.trim(),
        clearance: clearance.trim(),
        department: department.trim(),
        created_at: new Date(),
        lastLogin: new Date()
      };
      fallbackUsers.set(normalizedEmail, newUser);
      user = newUser;
    }

    // Safe audit logging
    try {
      if (isDbConnected) {
        await AuditLog.create({
          action: 'signup',
          analyst_id: finalBadgeId,
          target_name: name.trim(),
          meta: { email: normalizedEmail, role, clearance, department },
          timestamp: new Date()
        });
      }
    } catch (auditErr) {
      console.warn('[Audit non-fatal]', auditErr.message);
    }

    const safeUser = sanitizeUser(user);
    const token = createToken(safeUser);

    res.status(201).json({
      message: 'Operator credential successfully provisioned.',
      token,
      user: safeUser
    });
  } catch (err) {
    console.error('[auth signup error]', err);
    res.status(500).json({ error: 'Failed to provision operator credentials: ' + err.message });
  }
});

// ── POST /api/auth/login ───────────────────────────────────────────────────
authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const isDbConnected = mongoose.connection.readyState === 1;

    let user = null;
    let passwordMatches = false;

    if (isDbConnected) {
      user = await User.findOne({ email: normalizedEmail });
      if (user) {
        passwordMatches = await bcrypt.compare(password, user.password);
      }
    }

    // Check in-memory fallback if not found in DB
    if (!user && fallbackUsers.has(normalizedEmail)) {
      user = fallbackUsers.get(normalizedEmail);
      passwordMatches = await bcrypt.compare(password, user.passwordHash);
    }

    if (!user || !passwordMatches) {
      return res.status(401).json({ error: 'Invalid operator credentials. Access denied.' });
    }

    // Update lastLogin
    if (isDbConnected && user.save) {
      user.lastLogin = new Date();
      await user.save();
    } else if (user) {
      user.lastLogin = new Date();
    }

    // Safe audit logging
    try {
      if (isDbConnected) {
        await AuditLog.create({
          action: 'login',
          analyst_id: user.badgeId,
          target_name: user.name,
          meta: { email: normalizedEmail, role: user.role },
          timestamp: new Date()
        });
      }
    } catch (auditErr) {
      console.warn('[Audit non-fatal]', auditErr.message);
    }

    const safeUser = sanitizeUser(user);
    const token = createToken(safeUser);

    res.json({
      message: 'Operator session established.',
      token,
      user: safeUser
    });
  } catch (err) {
    console.error('[auth login error]', err);
    res.status(500).json({ error: 'Authentication failed: ' + err.message });
  }
});

// ── POST /api/auth/demo-login ──────────────────────────────────────────────
authRouter.post('/demo-login', async (req, res) => {
  try {
    const { preset = 'lead' } = req.body;
    let demoUser = null;

    if (preset === 'specialist') {
      demoUser = {
        _id: 'demo_op_4109',
        name: 'David Chen',
        email: 'analyst@veritas.sec',
        badgeId: 'OP-4109',
        role: 'Forensic Intelligence Analyst',
        clearance: 'LEVEL-2 CONFIDENTIAL',
        department: 'Financial Crime Intelligence',
        lastLogin: new Date()
      };
    } else {
      demoUser = {
        _id: 'demo_op_8842',
        name: 'Sarah Lin',
        email: 'operator@veritas.sec',
        badgeId: 'OP-8842',
        role: 'Lead Forensic Investigator',
        clearance: 'LEVEL-3 TOP SECRET',
        department: 'Synthetic ID Taskforce',
        lastLogin: new Date()
      };
    }

    const token = createToken(demoUser);

    // Audit log
    try {
      if (mongoose.connection.readyState === 1) {
        await AuditLog.create({
          action: 'login',
          analyst_id: demoUser.badgeId,
          target_name: demoUser.name,
          meta: { mode: 'quick-demo-login', role: demoUser.role },
          timestamp: new Date()
        });
      }
    } catch {
      // non-fatal
    }

    res.json({
      message: 'Demo analyst session established.',
      token,
      user: demoUser
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to establish demo session: ' + err.message });
  }
});

// ── GET /api/auth/me ───────────────────────────────────────────────────────
authRouter.get('/me', requireAuth, (req, res) => {
  res.json({
    user: sanitizeUser(req.user)
  });
});

// ── PATCH /api/auth/profile ────────────────────────────────────────────────
authRouter.patch('/profile', requireAuth, async (req, res) => {
  try {
    const { name, role, department, clearance } = req.body;
    const isDbConnected = mongoose.connection.readyState === 1;

    let updatedUser = null;
    if (isDbConnected && req.user._id) {
      const dbUser = await User.findById(req.user._id);
      if (dbUser) {
        if (name) dbUser.name = name.trim();
        if (role) dbUser.role = role.trim();
        if (department) dbUser.department = department.trim();
        if (clearance) dbUser.clearance = clearance.trim();
        await dbUser.save();
        updatedUser = sanitizeUser(dbUser);
      }
    }

    if (!updatedUser) {
      // Fallback update
      const existing = fallbackUsers.get(req.user.email) || req.user;
      if (name) existing.name = name.trim();
      if (role) existing.role = role.trim();
      if (department) existing.department = department.trim();
      if (clearance) existing.clearance = clearance.trim();
      updatedUser = sanitizeUser(existing);
    }

    const newToken = createToken(updatedUser);

    res.json({
      message: 'Profile updated successfully.',
      user: updatedUser,
      token: newToken
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update operator profile: ' + err.message });
  }
});

// ── POST /api/auth/logout ──────────────────────────────────────────────────
authRouter.post('/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (mongoose.connection.readyState === 1) {
          await AuditLog.create({
            action: 'logout',
            analyst_id: decoded.badgeId || 'OP-UNKNOWN',
            target_name: decoded.name || 'Analyst',
            timestamp: new Date()
          });
        }
      } catch {
        // ignore
      }
    }
    res.json({ success: true, message: 'Operator session terminated cleanly.' });
  } catch (err) {
    res.json({ success: true });
  }
});
