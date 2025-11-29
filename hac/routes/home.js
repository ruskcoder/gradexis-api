import express from 'express';
import { asyncHandler } from '../../errorHandler.js';

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
    res.json({ message: "HAC API", success: true });
}));

export default router;
