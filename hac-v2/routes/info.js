import process from 'process';
import express from 'express';
import * as cheerio from 'cheerio';
import { asyncHandler } from '../../errorHandler.js';
import { authenticateUser, checkSessionValidity } from '../services/authentication.js';
import { createSuccessResponse } from '../utils/session.js';
import ProgressTracker from '../utils/progressTracker.js';
import { HAC_ENDPOINTS } from '../config/constants.js';
import { addUser } from '../../referrals.js';

const router = express.Router();

router.post('/info', asyncHandler(async (req, res) => {
    const progressTracker = new ProgressTracker(res, req.body?.stream === true);
    progressTracker.update(0, 'Authenticating');

    const authResult = await authenticateUser(req, progressTracker);

    if (!authResult) {
        return;
    }
    
    const { link, session, username } = authResult;
    progressTracker.update(50, 'Fetching student info');

    const $$ = cheerio.load(session.hacData);
    const registration = await session.get(link + HAC_ENDPOINTS.REGISTRATION);
    checkSessionValidity(registration);

    const $ = cheerio.load(registration.data);

    let studentInfo = {};

    if ($("span#plnMain_lblRegStudentName").length) {
        studentInfo = {
            name: $("span#plnMain_lblRegStudentName").text().trim(),
            grade: $("span#plnMain_lblGrade").text().trim(),
            school: $("span#plnMain_lblBuildingName").text().trim(),
            dob: $("span#plnMain_lblBirthDate").text().trim(),
            counselor: $("span#plnMain_lblCounselor").text().trim(),
            language: $("span#plnMain_lblLanguage").text().trim(),
            cohortYear: $("span#plnMain_lblCohortYear").text().trim(),
            district: $$("span.sg-banner-text").text().trim(),
        };

        if (studentInfo.name === process.env.MYNAME) {
            studentInfo.name = "Test User";
        }
    }
    const referredFrom = req.body.options.referralCode;
    const ref = await addUser(username.toLowerCase(), referredFrom, studentInfo.name);
    if (ref.success === false) {
        progressTracker.error(409, ref.message);
        return;
    }
    const response = createSuccessResponse({
        username,
        link,
        referralCode: ref.referralCode,
        ...studentInfo
    }, session);

    progressTracker.complete(response);
}));

export default router;