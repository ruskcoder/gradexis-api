/* eslint-disable no-undef */
const express = require('express');
const cors = require('cors');
const app = express(); 

const hac = require('./hac/index.js');
const demo = require('./demo/index.js');
const powerschool = require('./powerschool/index.js');

app.use(cors());
app.use('/hac', hac); 
app.use('/demo', demo);
app.use('/powerschool', powerschool);

const port = 3000; 
app.listen(port, () => { 
    console.log(`Main App listening on http://localhost:${port}`);
});

module.exports = app;