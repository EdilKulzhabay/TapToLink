const puppeteer = require("puppeteer");

let browserInstance = null;

const getBrowser = async () => {
    if (!browserInstance) {
        browserInstance = await puppeteer.launch({ headless: true }); // Всегда используем один экземпляр
    }
    return browserInstance;
};

module.exports = { getBrowser };