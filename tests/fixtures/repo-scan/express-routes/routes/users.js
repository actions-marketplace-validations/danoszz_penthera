// Fixture: an Express app whose routes live in routes/, with no Next.js route.js files.
const express = require("express");
const { exec } = require("node:child_process");

const router = express.Router();

router.get("/users", (req, res) => {
  res.json([]);
});

router.post("/users/:id/export", (req, res) => {
  exec(`tar czf /tmp/${req.params.id}.tgz /data/${req.params.id}`, () => res.sendStatus(202));
});

module.exports = router;
