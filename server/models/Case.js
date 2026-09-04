import mongoose from 'mongoose';

const caseSchema = new mongoose.Schema({
  identity_id: { type: String, required: true },
  identity_name: { type: String, default: 'Unknown Identity' },
  risk_score: { type: Number, default: 0 },
  risk_label: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'HIGH' },
  status: { 
    type: String, 
    enum: ['open', 'escalated', 'dismissed', 'seized'], 
    default: 'open' 
  },
  cluster_id: { type: Number, default: -1 },
  analyst_id: { type: String, default: 'OP-8842' },
  notes: { type: String, default: '' },
}, { 
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } 
});

caseSchema.index({ identity_id: 1 });
caseSchema.index({ status: 1 });

export const Case = mongoose.model('Case', caseSchema);
