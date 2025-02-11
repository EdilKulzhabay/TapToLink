const { getBrowser } = require("./puppeteerManager");
const fs = require('fs')

const COOKIES_PATH = './cookies.json';

const kaspiParser = async (name) => {
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
        if (fs.existsSync(COOKIES_PATH)) {
            try {
                const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
                await page.setCookie(...cookies);
            } catch (error) {
                console.error("Ошибка чтения cookies.json, удаляем файл...", error);
                fs.unlinkSync(COOKIES_PATH);
            }
        }

        await page.goto('https://merchant.kaspi.kz/new', { waitUntil: 'networkidle2' });

        const isLoggedIn = await page.evaluate(() => {
            return !!document.querySelector('a[href*="logout"]') || !!document.querySelector('.logout-button');
        });

        if (!isLoggedIn) {
            console.log('Требуется авторизация.');
            
            const loginInput = await page.$('#Login');
            if (loginInput) {
                await page.type('#Login', process.env.login);
                await page.click('#submit');
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
            }

            const passwordInput = await page.$('#Password');
            if (passwordInput) {
                await page.type('#Password', process.env.pass);
                await page.click('#submit');
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
            }

            const cookies = await page.cookies();
            console.log("we here");
            
            fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
        } else {
            console.log('Вы уже авторизованы.');
        }

        await page.waitForSelector('table tr', { timeout: 15000 });

        await new Promise(resolve => setTimeout(resolve, 20000));

        const rows = await page.evaluate(() => {
            const data = [];
            document.querySelectorAll('table tr').forEach((row) => {
                const rowData = [];
                row.querySelectorAll('td, th').forEach((cell) => {
                    rowData.push(cell.innerText.trim());
                });
                if (rowData.length > 0) data.push(rowData);
            });
            return data;
        });

        console.log('Данные из таблицы:');
        rows.forEach((row, index) => {
            console.log(`Строка ${index + 1}:`, row);
        });

        const foundRow = rows.find(row => row[6] && row[6] === name);
        if (foundRow) {
            console.log(`Найден клиент: ${name}, сумма оплаты: ${foundRow[3]}`);
            return foundRow[3]; // Возвращаем сумму оплаты
        } else {
            console.log(`Клиент ${name} не найден.`);
            return null;
        }

    } catch (error) {
        console.error('Ошибка:', error);
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = { kaspiParser };