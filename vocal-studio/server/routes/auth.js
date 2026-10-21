const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { User } = require("../models");

const sign = (u) =>
  jwt.sign({ uid: u._id.toString(), email: u.email },
           process.env.JWT_SECRET, { expiresIn: "30d" });

router.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password || password.length < 6)
      return res.status(400).json({ error: "email and password (min 6) required" });
    if (await User.findOne({ email })) return res.status(409).json({ error: "email exists" });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, passwordHash });
    res.json({ token: sign(user), user: { id: user._id, email: user.email } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: (email || "").toLowerCase() });
  if (!user) return res.status(401).json({ error: "invalid credentials" });
  if (!(await bcrypt.compare(password || "", user.passwordHash)))
    return res.status(401).json({ error: "invalid credentials" });
  res.json({ token: sign(user), user: { id: user._id, email: user.email } });
});

module.exports = router;
