/* eslint-disable no-undef */
const express = require('express');
const fs = require('fs').promises; // Use promises API
const path = require('path');

const app = express();
const port = 5000;

const streamMsgs = [
    "Loading...",
    "Almost there...",
    "Just a moment...",
    "Hang tight...",
    "So close..."
]

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

async function readAndSend(route, res, modify = function (data) { return data; }) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    try {
        var data = JSON.parse(await fs.readFile(path.join(__dirname, route + '.json'), 'utf8'));
        data = modify(data);
        res.send(data);
        return;
    } catch (err) {
        res.send({ "error": "Error loading file" });
        return;
    }
}

async function readAndStream(route, res) {
    try {
        const data = await fs.readFile(path.join(__dirname, route + '.json'), 'utf8');
        for (let i = 0; i < 5; i++) {
            res.write(JSON.stringify({ percent: i * 20, message: streamMsgs[i] }) + "\n\n");
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
        res.write(JSON.stringify(JSON.parse(data)));
        res.end();
        return;
    } catch (err) {
        res.send({ "error": err.message });
        return;
    }
}

app.get('/', (req, res) => {
    res.send('Demo App');
});

app.get('/login', async (req, res) => {
    await readAndSend('login', res);
});

app.get('/info', async (req, res) => {
    await readAndSend('info', res);
});

app.get('/classes', async (req, res) => {
    if (req.query.stream == "true") {
        await readAndStream('classes', res);
    }
    else {
        await readAndSend('classes', res);
    }
});

app.get('/attendance', async (req, res) => {
    if (req.query.date) {
        await readAndSend('attendance', res, modify = function (data) {
            data.month = capitalizeFirstLetter(req.query.date.split('-')[0]);
            data.year = req.query.date.split('-')[1];
            return data;
        });
    }
    else {
        await readAndSend('attendance', res);
    }
});

module.exports = app;