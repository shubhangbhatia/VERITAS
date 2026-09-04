import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'veritas-forensic-secret-enclave-key-2026';

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required. Missing Bearer token.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // If MongoDB is connected, find the user
    let user = null;
    try {
      user = await User.findById(decoded.id).select('-password');
    } catch {
      // ignore
    }

    if (!user) {
      // Check if user was in fallback payload
      if (decoded.email && decoded.badgeId) {
        user = {
          _id: decoded.id,
          name: decoded.name,
          email: decoded.email,
          badgeId: decoded.badgeId,
          role: decoded.role,
          clearance: decoded.clearance || 'LEVEL-2 CONFIDENTIAL',
          department: decoded.department || 'Synthetic ID Taskforce',
        };
      } else {
        return res.status(401).json({ error: 'Session expired or invalid operator credentials.' });
      }
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token. Please sign in again.' });
  }
}

export async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      let user = null;
      try {
        user = await User.findById(decoded.id).select('-password');
      } catch {
        // ignore
      }
      if (user) {
        req.user = user;
      } else if (decoded.email) {
        req.user = {
          _id: decoded.id,
          name: decoded.name,
          email: decoded.email,
          badgeId: decoded.badgeId,
          role: decoded.role,
          clearance: decoded.clearance,
          department: decoded.department,
        };
      }
    }
  } catch {
    // optional, proceed anyway
  }
  next();
}
