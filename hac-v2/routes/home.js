const express = require('express');
const { asyncHandler } = require('../../errorHandler');

const router = express.Router();

router.post('/', asyncHandler(async (req, res) => {
    res.json({ message: "HAC API", success: true });
}));

module.exports = router;

