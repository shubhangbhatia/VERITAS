import mongoose from 'mongoose';

const identitySchema = new mongoose.Schema({
  // Raw identity fields
  id: { type: String, required: true, unique: true },
  name: String,
  age: Number,
  address: String,
  zip_code: String,
  phone: String,
  email: String,
  pan_prefix: String,
  account_age_months: Number,
  address_history_count: Number,
  shared_phone_count: Number,
  shared_email_count: Number,
  payment_smoothness: Number,
  age_address_mismatch: Number,

  // Ground truth (for demo/eval only)
  ring_id: { type: Number, default: 0 },
  is_fraud: { type: Number, default: 0 },

  // Model outputs
  model_a_score: { type: Number, default: null },
  model_b_score: { type: Number, default: null },
  fused_score: { type: Number, default: null },
  risk_label: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: null },
  shap_values: { type: Object, default: null },
  cluster_id: { type: Number, default: -1 },
  ring_flag: { type: Boolean, default: false },

  // Metadata
  batch_id: String,
  scored_at: { type: Date, default: Date.now },
  created_at: { type: Date, default: Date.now },
}, { timestamps: true });

export const Identity = mongoose.model('Identity', identitySchema);
