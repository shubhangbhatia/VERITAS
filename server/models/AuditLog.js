import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  analyst_id: { type: String, default: 'OP-8842' },
  action: { 
    type: String, 
    required: true,
    enum: ['upload', 'inspect', 'escalate', 'dismiss', 'seize', 'quarantine', 'search', 'export', 'login', 'signup', 'logout']
  },
  target_id: { type: String, default: '' },
  target_name: { type: String, default: '' },
  meta: { type: Object, default: {} },
  timestamp: { type: Date, default: Date.now }
});

auditLogSchema.index({ timestamp: -1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
