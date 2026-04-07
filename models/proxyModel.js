import mongoose from "mongoose";

const proxySchema = new mongoose.Schema(
  {
    ip: { type: String, required: true },
    port: { type: String, required: true },
    username: { type: String, required: true },
    password: { type: String, required: true },
    raw: { type: String, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

proxySchema.index({ ip: 1, port: 1 }, { unique: true });

export const Proxy =
  mongoose.models.Proxy || mongoose.model("Proxy", proxySchema);
