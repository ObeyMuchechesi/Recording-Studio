const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { User } = require("../models");
const asyncHandler = require("../middleware/asyncHandler");
const auth = require("../middleware/auth");

const sign = (user) =>
  jwt.sign(
    { uid: user._id.toString(), email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );

router.get("/me", auth, (req, res) => {
  res.json({ id: req.user.uid, email: req.user.email });
});

router.post("/register", asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: "email and password (min 6) required" });
  }
  if (await User.findOne({ email })) {
    return res.status(409).json({ error: "email exists" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ email, passwordHash });
  res.json({ token: sign(user), user: { id: user._id, email: user.email } });
}));

router.post("/login", asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  const user = await User.findOne({ email: (email || "").toLowerCase() });
  if (!user || !(await bcrypt.compare(password || "", user.passwordHash))) {
    return res.status(401).json({ error: "invalid credentials" });
  }
  res.json({ token: sign(user), user: { id: user._id, email: user.email } });
}));

module.exports = router;
