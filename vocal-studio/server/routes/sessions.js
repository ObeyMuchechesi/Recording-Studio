const router = require("express").Router();
const auth = require("../middleware/auth");
const asyncHandler = require("../middleware/asyncHandler");
const { Session } = require("../models");

router.use(auth);

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

  const session = await Session.findOneAndUpdate(
    { _id: req.params.id, owner: req.user.uid },
    { $set: updates },
    { new: true }
  );
  if (!session) return res.status(404).json({ error: "not found" });
  res.json(session);
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  await Session.deleteOne({ _id: req.params.id, owner: req.user.uid });
  res.json({ ok: true });
}));

module.exports = router;
