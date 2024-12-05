const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { OpenAIApi, Configuration } = require("openai");
require("dotenv").config();
// const path = require("path");
// const { default: axios } = require("axios");
// const fs = require("fs");
// const FormData = require('form-data');

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Убедитесь, что путь к сессии корректный
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true, // Убедитесь, что Puppeteer работает в headless режиме
    },
});

client.on("qr", (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on("authenticated", (session) => {
    console.log(
        "Authenticated with session:",
        session ? JSON.stringify(session) : "undefined"
    );
});

client.on("auth_failure", (msg) => {
    console.error("Authentication failed:", msg);
});

client.on("disconnected", (reason) => {
    console.log("Client was logged out:", reason);
});

client.on("ready", () => {
    console.log("Client is ready!");
});

const chatHistories = {};

// Системный промпт для установки контекста диалога
const systemMessage = {
    role: "system",
    content:
        "Здравствуйте! Я бот воды «Тибетская». Чем могу помочь? Заказ воды:Укажите адрес и количество бутылей (минимум 2).Тип бутыли по умолчанию: 18,9 л Поликарбонат. Цены:18,9л—1300₸, 12,5л—900₸. Подтверждение заказа:Пример:‘Ваш заказ: 4 бутыли 18,9 л по адресу [адрес]. Подтверждаете?’При подтверждении:‘Спасибо! Курьер свяжется за час до доставки.’ Доп.товары:Сайт:tibetskaya.kz/accessories. Чистка кулера:От 4000 ₸, скидка 50% при заказе воды. Мы работаем:Пн–Сб:с 8:00–22:00, Вс:выходной. Контакты: Менеджер:87475315558.Если заказали по 16:00 то доставят завтра",
};

// Функция для обращения к GPT и получения ответа
async function getGPTResponse(chatHistory) {
    let attempts = 0;
    const maxAttempts = 3; // Максимум 3 попытки
    const retryDelay = 3000; // 3 секунды между попытками

    // Добавляем системное сообщение перед историей
    const messages = [systemMessage, ...chatHistory];

    while (attempts < maxAttempts) {
        try {
            const response = await openai.createChatCompletion({
                model: "gpt-4",
                messages: messages, // передаем системное сообщение и всю историю диалога
                max_tokens: 500,
                temperature: 0.7,
            });
            return response.data.choices[0].message.content.trim();
        } catch (error) {
            if (error.response && error.response.status === 429) {
                console.log("Превышен лимит запросов, повторная попытка...");
                attempts++;
                await new Promise((resolve) => setTimeout(resolve, retryDelay));
            } else {
                console.error("Ошибка при обращении к OpenAI:", error);
                return "Извините, произошла ошибка при обработке вашего запроса.";
            }
        }
    }
    return "Извините, превышен лимит попыток обращения к OpenAI.";
}

// Функция для сохранения сообщения в историю
function saveMessageToHistory(chatId, message, role) {
    if (!chatHistories[chatId]) {
        chatHistories[chatId] = [];
    }

    // Сохраняем новое сообщение в виде объекта с ролью
    chatHistories[chatId].push({
        role: role,
        content: message,
    });

    // Оставляем только последние 8 пар сообщений (16 сообщений всего)
    if (chatHistories[chatId].length > 10) {
        chatHistories[chatId].shift(); // Удаляем самое старое сообщение, если больше 16
    }
}

// Обработка входящих сообщений
client.on("message", async (msg) => {

    if (msg.body) {
        client.sendMessage("Abok loh")
        return 
    }
    
    if (msg.body) {
        saveMessageToHistory(chatId, msg.body, "user");
        const gptResponse = await getGPTResponse(chatHistories[chatId]);

        client.sendMessage(chatId, gptResponse);

        // Сохраняем ответ бота в историю
        saveMessageToHistory(chatId, gptResponse, "assistant");
    }
});


client.initialize();