import express from 'express';
import { asyncHandler } from '../errorHandler.js';

// Import route modules
import homeRoutes from './routes/home.js';
import loginRoutes from './routes/login.js';
import infoRoutes from './routes/info.js';
import classesRoutes from './routes/classes.js';
import scheduleRoutes from './routes/schedule.js';
import attendanceRoutes from './routes/attendance.js';
import teachersRoutes from './routes/teachers.js';
import reportsRoutes from './routes/reports.js';

const app = express();
app.use(express.json());

// Apply async handler to all app methods
const _get = app.get.bind(app);
app.get = (path, ...handlers) => _get(path, ...handlers.map(h => asyncHandler(h)));

// Mount routes
app.use('/', homeRoutes);
app.use('/', loginRoutes);
app.use('/', infoRoutes);
app.use('/', classesRoutes);
app.use('/', scheduleRoutes);
app.use('/', attendanceRoutes);
app.use('/', teachersRoutes);
app.use('/', reportsRoutes);

export default app;
