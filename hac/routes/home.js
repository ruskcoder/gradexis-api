const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
    res.json({ message: "HAC API", success: true });
}));

module.exports = router;
