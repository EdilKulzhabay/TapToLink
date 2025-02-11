const puppeteer = require("puppeteer");

let browserInstance = null;

const getBrowser = async () => {
    if (!browserInstance) {
        browserInstance = await puppeteer.launch({ headless: "new" });
    }
    return browserInstance;
};

module.exports = { getBrowser };
