import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

let compSciAvg = "91.50";
app.get('/setAvg', async (req, res) => {
    compSciAvg = req.query.new || "91.50";
    res.send({ message: 'Average set successfully', average: compSciAvg });
});

app.get('/classes', async (req, res) => {
    const classesPath = path.resolve(__dirname, 'classes.json');
    let fileData = await fs.readFile(classesPath, 'utf8');
    let data = JSON.parse(fileData);
    
    if (req.query.stream == "true") {
        for (let percent = 0; percent < 5; percent += 1) {
            res.write(JSON.stringify({
                percent: percent * 20,
                message: streamMsgs[percent]
            }) + "\n\n");
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        data['term'] = req.query.term || data.term;
        data['classes'][0]['average'] = compSciAvg;
        res.write(JSON.stringify(data));
        res.end();
        return;
    }
    else {
        await new Promise(resolve => setTimeout(resolve, 3000));
        data['term'] = req.query.term || data.term;
        data['classes'][0]['average'] = compSciAvg;
        res.send(data);
    }
});

const monthLookup = {
    "January": "01",
    "February": "02",
    "March": "03",
    "April": "04",
    "May": "05",
    "June": "06",
    "July": "07",
    "August": "08",
    "September": "09",
    "October": "10",
    "November": "11",
    "December": "12"
};

app.get('/attendance', async (req, res) => {
    const classesPath = path.resolve(__dirname, 'attendance.json');
    let fileData = await fs.readFile(classesPath, 'utf8');

    const now = new Date();
    if (req.query.date) {
        fileData = fileData.replaceAll('MMM', req.query.date.split('-')[0]);
        fileData = fileData.replaceAll('YYYY', req.query.date.split('-')[1]);
        fileData = fileData.replaceAll('MM', monthLookup[req.query.date.split('-')[0]]);
        fileData = fileData.replaceAll('YY', req.query.date.split('-')[1].slice(-2));
    } else {
        fileData = fileData.replaceAll('MMM', Object.entries(monthLookup).find(([name, num]) => num === String(now.getMonth() + 1).padStart(2, '0'))[0]);
        fileData = fileData.replaceAll('YYYY', String(now.getFullYear()));
        fileData = fileData.replaceAll('MM', now.getMonth() + 1);
        fileData = fileData.replaceAll('YY', String(now.getFullYear()).slice(-2));
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
    res.send(JSON.parse(fileData));
});

export default app;