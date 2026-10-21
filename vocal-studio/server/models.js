const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
}, { timestamps: true });

const FxSchema = new mongoose.Schema({
  gate:     { on: Boolean, threshold: Number, attack: Number, release: Number },
  eq:       { hpf: Number, low: Number, loMidFreq: Number, loMidGain: Number,
              hiMidFreq: Number, hiMidGain: Number, high: Number },
  deEsser:  { on: Boolean, freq: Number, amount: Number },
  comp:     { on: Boolean, threshold: Number, ratio: Number, attack: Number,
              release: Number, knee: Number, makeup: Number },
  sat:      { on: Boolean, drive: Number, mix: Number },
  reverb:   { on: Boolean, size: Number, decay: Number, mix: Number },
}, { _id: false });

const TakeSchema = new mongoose.Schema({
  name:       String,
  offset:     Number,   // seconds into session
  sampleRate: Number,
  gain:       { type: Number, default: 1 },
  mute:       Boolean,
  // 24-bit WAV data, base64. In production use S3/GridFS — Mongo docs cap at 16MB.
  wavBase64:  { type: String, required: true },
}, { timestamps: true });

const TrackSchema = new mongoose.Schema({
  name:    String,
  color:   String,
  gain:    { type: Number, default: 1 },
  pan:     { type: Number, default: 0 },
  mute:    Boolean,
  solo:    Boolean,
  fx:      FxSchema,
  takes:   [TakeSchema],
}, { _id: true });

const MasterFxSchema = new mongoose.Schema({
  eq:      { low: Number, mid: Number, high: Number },
  comp:    { on: Boolean, threshold: Number, ratio: Number, makeup: Number },
  limiter: { ceiling: Number, threshold: Number, release: Number },
  output:  { type: Number, default: 1 },
}, { _id: false });

const SessionSchema = new mongoose.Schema({
  owner:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name:       { type: String, required: true },
  bpm:        { type: Number, default: 100 },
  sampleRate: { type: Number, default: 48000 },
  masterFx:   MasterFxSchema,
  tracks:     [TrackSchema],
}, { timestamps: true });

module.exports = {
  User:    mongoose.model("User", UserSchema),
  Session: mongoose.model("Session", SessionSchema),
};
