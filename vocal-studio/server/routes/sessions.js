const router = require("express").Router();
const auth = require("../middleware/auth");
const asyncHandler = require("../middleware/asyncHandler");
const { Session } = require("../models");
const mongoose = require("mongoose");

const CHUNK_BYTES = 1024 * 1024;
const MAX_AUDIO_BYTES = 2 * 1024 * 1024 * 1024;
let indexesPromise;

async function audioChunks() {
  const collection = mongoose.connection.db.collection("takeAudioChunks");
  if (!indexesPromise) indexesPromise = Promise.all([
    collection.createIndex({ owner: 1, sessionId: 1, takeKey: 1, index: 1 }, { unique: true }),
    collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
  await indexesPromise;
  return collection;
}

function validId(value) { return mongoose.Types.ObjectId.isValid(value); }
function collectAudioKeys(tracks = []) {
  return new Set(tracks.flatMap((track) => (track.takes || [])
    .map((take) => take.audioStorageKey).filter(Boolean).map(String)));
}

router.use(auth);

// Each WAV is uploaded as small chunks so recordings can exceed MongoDB's
// 16 MB document limit and Vercel's per-request payload limit.
router.put("/:id/audio/:takeKey/chunks/:index", asyncHandler(async (req, res) => {
  if (!validId(req.params.id) || !/^[\w-]{1,100}$/.test(req.params.takeKey)) {
    return res.status(400).json({ error: "invalid audio upload id" });
  }
  const session = await Session.findOne({ _id: req.params.id, owner: req.user.uid }).select("_id").lean();
  if (!session) return res.status(404).json({ error: "not found" });
  const { total, data } = req.body || {};
  const index = Number(req.params.index);
  if (!Number.isInteger(total) || total < 1 || total > 2048 || !Number.isInteger(index) || index < 0 || index >= total || typeof data !== "string") {
    return res.status(400).json({ error: "invalid audio chunk" });
  }
  const bytes = Buffer.from(data, "base64");
  if (!bytes.length || bytes.length > CHUNK_BYTES || bytes.toString("base64") !== data) {
    return res.status(400).json({ error: "audio chunks must be valid base64 up to 1 MB" });
  }
  const chunks = await audioChunks();
  await chunks.replaceOne(
    { owner: new mongoose.Types.ObjectId(req.user.uid), sessionId: session._id, takeKey: req.params.takeKey, index },
    { owner: new mongoose.Types.ObjectId(req.user.uid), sessionId: session._id, takeKey: req.params.takeKey,
      index, total, data: bytes, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    { upsert: true }
  );
  res.json({ ok: true, index });
}));

router.post("/:id/audio/:takeKey/complete", asyncHandler(async (req, res) => {
  if (!validId(req.params.id) || !/^[\w-]{1,100}$/.test(req.params.takeKey)) {
    return res.status(400).json({ error: "invalid audio upload id" });
  }
  const session = await Session.findOne({ _id: req.params.id, owner: req.user.uid }).select("_id").lean();
  if (!session) return res.status(404).json({ error: "not found" });
  const { total, bytes } = req.body || {};
  if (!Number.isInteger(total) || total < 1 || total > 2048 || !Number.isInteger(bytes) || bytes < 44 || bytes > MAX_AUDIO_BYTES) {
    return res.status(400).json({ error: "invalid audio manifest" });
  }
  const chunks = await audioChunks();
  const owner = new mongoose.Types.ObjectId(req.user.uid);
  const filter = { owner, sessionId: session._id, takeKey: req.params.takeKey };
  const count = await chunks.countDocuments({ ...filter, total });
  const byteCount = await chunks.aggregate([
    { $match: { ...filter, total } },
    { $group: { _id: null, bytes: { $sum: { $binarySize: "$data" } } } },
  ]).toArray();
  if (count !== total || (byteCount[0]?.bytes ?? 0) !== bytes) {
    return res.status(409).json({ error: "audio upload is incomplete; retry missing chunks" });
  }
  await chunks.updateMany(filter, { $set: { expiresAt: new Date("2100-01-01T00:00:00.000Z") } });
  res.json({ ok: true, audioStorageKey: req.params.takeKey, audioChunkCount: total, audioByteLength: bytes });
}));

router.get("/:id/audio/:takeKey/chunks/:index", asyncHandler(async (req, res) => {
  if (!validId(req.params.id) || !/^[\w-]{1,100}$/.test(req.params.takeKey)) {
    return res.status(400).json({ error: "invalid audio id" });
  }
  const session = await Session.findOne({ _id: req.params.id, owner: req.user.uid }).select("tracks").lean();
  if (!session) return res.status(404).json({ error: "not found" });
  const take = (session.tracks || []).flatMap((track) => track.takes || [])
    .find((item) => String(item.audioStorageKey || "") === req.params.takeKey);
  const index = Number(req.params.index);
  if (!take || !Number.isInteger(index) || index < 0 || index >= take.audioChunkCount) {
    return res.status(404).json({ error: "audio chunk not found" });
  }
  const chunks = await audioChunks();
  const chunk = await chunks.findOne({ owner: new mongoose.Types.ObjectId(req.user.uid),
    sessionId: session._id, takeKey: req.params.takeKey, index, total: take.audioChunkCount });
  if (!chunk) return res.status(404).json({ error: "audio chunk not found" });
  res.set({ "Content-Type": "application/octet-stream", "Cache-Control": "private, no-store" });
  res.send(chunk.data.buffer.slice(chunk.data.byteOffset, chunk.data.byteOffset + chunk.data.byteLength));
}));

router.get("/", asyncHandler(async (req, res) => {
  const sessions = await Session.find({ owner: req.user.uid })
    .select("name bpm sampleRate updatedAt")
    .sort("-updatedAt")
    .lean();
  res.json(sessions);
}));

router.post("/", asyncHandler(async (req, res) => {
  const body = req.body || {};
  const session = await Session.create({
    owner: req.user.uid,
    name: body.name || "Untitled Session",
    bpm: body.bpm || 100,
    sampleRate: body.sampleRate || 48000,
    tracks: [{ name: "Vocal 1", color: "#5fd4a0", fx: {} }],
  });
  res.json(session);
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const session = await Session.findOne({
    _id: req.params.id,
    owner: req.user.uid,
  }).lean();
  if (!session) return res.status(404).json({ error: "not found" });
  res.json(session);
}));

router.patch("/:id", asyncHandler(async (req, res) => {
  const body = req.body || {};
  const allowedFields = ["name", "bpm", "sampleRate", "masterFx", "tracks"];
  const updates = Object.fromEntries(
    Object.entries(body).filter(([key]) => allowedFields.includes(key))
  );

  const previous = await Session.findOne({ _id: req.params.id, owner: req.user.uid }).select("tracks").lean();
  if (!previous) return res.status(404).json({ error: "not found" });
  const session = await Session.findOneAndUpdate(
    { _id: req.params.id, owner: req.user.uid },
    { $set: updates },
    { new: true }
  );
  if (!session) return res.status(404).json({ error: "not found" });
  const oldKeys = collectAudioKeys(previous.tracks);
  const newKeys = collectAudioKeys(updates.tracks ?? previous.tracks);
  const removedKeys = [...oldKeys].filter((key) => !newKeys.has(key));
  if (removedKeys.length) {
    const chunks = await audioChunks();
    await chunks.deleteMany({ owner: new mongoose.Types.ObjectId(req.user.uid), sessionId: session._id, takeKey: { $in: removedKeys } });
  }
  res.json(session);
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  await Session.deleteOne({ _id: req.params.id, owner: req.user.uid });
  if (validId(req.params.id)) {
    const chunks = await audioChunks();
    await chunks.deleteMany({ owner: new mongoose.Types.ObjectId(req.user.uid), sessionId: new mongoose.Types.ObjectId(req.params.id) });
  }
  res.json({ ok: true });
}));

module.exports = router;
