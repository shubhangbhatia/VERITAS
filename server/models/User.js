import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true, 
    trim: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true, 
    trim: true 
  },
  password: { 
    type: String, 
    required: true 
  },
  badgeId: { 
    type: String, 
    default: () => `OP-${Math.floor(1000 + Math.random() * 9000)}` 
  },
  role: { 
    type: String, 
    default: 'Forensic Analyst' 
  },
  clearance: { 
    type: String, 
    default: 'LEVEL-2 CONFIDENTIAL' 
  },
  department: { 
    type: String, 
    default: 'Synthetic ID Taskforce' 
  },
  avatar: { 
    type: String, 
    default: '' 
  },
  lastLogin: { 
    type: Date, 
    default: Date.now 
  },
}, { 
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } 
});

// Compare hashed password helper
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Remove sensitive fields before converting to JSON
userSchema.methods.toSafeObject = function() {
  const obj = this.toObject ? this.toObject() : { ...this };
  delete obj.password;
  return obj;
};

export const User = mongoose.model('User', userSchema);
