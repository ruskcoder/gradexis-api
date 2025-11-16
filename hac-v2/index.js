const express = require('express');
const { asyncHandler } = require('../errorHandler');

const homeRoutes = require('./routes/home');
const loginRoutes = require('./routes/login');
const infoRoutes = require('./routes/info');
const classesRoutes = require('./routes/classes');
const scheduleRoutes = require('./routes/schedule');
const attendanceRoutes = require('./routes/attendance');
const teachersRoutes = require('./routes/teachers');
const reportsRoutes = require('./routes/reports');

const app = express();

const _get = app.get.bind(app);
app.get = (path, ...handlers) => _get(path, ...handlers.map(h => asyncHandler(h)));

app.use('/', homeRoutes);
app.use('/', loginRoutes);
app.use('/', infoRoutes);
app.use('/', classesRoutes);
app.use('/', scheduleRoutes);
app.use('/', attendanceRoutes);
app.use('/', teachersRoutes);
app.use('/', reportsRoutes);

module.exports = app;
