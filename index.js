/* eslint-disable no-undef */
const express = require('express');
const cors = require('cors');
const app = express(); 

const hac = require('./hac/index.js');

app.use(cors()); // Enable CORS for all routes
app.use('/hac', hac); 

const port = 3000; 
app.listen(port, () => { 
    console.log(`Main App lsitening on http://localhost:${port}`); 
});

module.exports = app;