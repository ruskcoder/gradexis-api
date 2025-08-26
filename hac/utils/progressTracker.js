// Progress Tracker for streaming responses
class ProgressTracker {
    constructor(res, streaming = false) {
        this.res = res;
        this.streaming = streaming;
    }

    update(percent, message) {
        if (this.streaming) {
            this.res.write(JSON.stringify({ percent, message }) + '\n\n');
        }
    }

    complete(data) {
        if (this.streaming) {
            this.res.end(JSON.stringify(data));
        } else {
            this.res.json(data);
        }
    }
}

module.exports = ProgressTracker;
