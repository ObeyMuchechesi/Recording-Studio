const router = require("express").Router();
const auth = require("../middleware/auth");
const { Session } = require("../models");

router.use(auth);

router.get("/", async (req, res) => {
  const list = await Session.find({ owner: req.user.uid })
    .select("name bpm sampleRate updatedAt")
    .sort("-updatedAt").lean();
  res.json(list);
});

router.post("/", async (req, res) => {
  const s = await Session.create({
    owner: req.user.uid,
    name: req.body.name || "Untitled Session",
    bpm: req.body.bpm || 100,
    sampleRate: req.body.sampleRate || 48000,
    tracks: [{ name: "Vocal 1", color: "#5fd4a0", fx: {} }],
  });
  res.json(s);
});

router.get("/:id", async (req, res) => {
  const s = await Session.findOne({ _id: req.params.id, owner: req.user.uid }).lean();
  if (!s) return res.status(404).json({ error: "not found" });
  res.json(s);
});

router.patch("/:id", async (req, res) => {
  const s = await Session.findOneAndUpdate(
    { _id: req.params.id, owner: req.user.uid },
    { $set: req.body },
    { new: true }
  );
  if (!s) return res.status(404).json({ error: "not found" });
  res.json(s);
});

router.delete("/:id", async (req, res) => {
  await Session.deleteOne({ _id: req.params.id, owner: req.user.uid });
  res.json({ ok: true });
});

module.exports = router;
