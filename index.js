require("dotenv").config();
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { default: axios } = require("axios");
const mongoose = require("mongoose")
const User = require("./Models/User.js")
const { prompt } = require("./prompt.js");
const { fetchBookings } = require("./fetchBookings.js");
const { deleteBooking } = require("./deleteBooking.js");
const { kaspiParser } = require("./kaspi.js");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

mongoose
    .connect("mongodb://localhost:27017/tapToLink")
    .then(() => {
        console.log("Mongodb OK");
    })
    .catch((err) => {
        console.log("Mongodb Error", err);
    });

// Настройка WhatsApp клиента
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
    },
});

client.on("qr", (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on("authenticated", () => {
    console.log("Authenticated successfully!");
});

client.on("auth_failure", (msg) => {
    console.error("Authentication failed:", msg);
});

client.on("ready", () => {
    console.log("Client is ready!");
});

const activeTimers = new Map(); 

client.on("message", async (msg) => {
    const chatId = msg.from;
    const clientName = msg._data.notifyName
    const message = msg.body;

    if (message.toLocaleLowerCase().includes("addGandona")) {
        const digits = message.match(/\d/g);
        const result = digits.join("") + "@c.us";

        const gandon = await User.findOne({phone: result})

        if (gandon && !gandon.isGandon) {
            gandon.isGandon = true
            await gandon.save()
        } else {
            const newGandon = new User({phone: result, isGandon: true})
            await newGandon.save()
        }

    }
    if (!message || message.trim() === "") {
        return client.sendMessage(chatId, "Пожалуйста, отправьте сообщение.");
    }

    // Находим или создаем пользователя
    let user = await User.findOne({ phone: chatId });

    if (user && user?.isGandon) {
        client.sendMessage(chatId, "Здравствуйте, к сожалению в данный момент нет свободных квартир.")
        return;
    }

    if (user?.waitFIO) {
        console.log("Запуск kaspiParser с аргументом:", message);
        const kaspi = await kaspiParser(message)
        if (kaspi) {
            client.sendMessage(chatId, `Вы оплатили ${kaspi} тенге`)
        }
    }

    if (user?.specialPhone) {
        const phone = message?.match(/\d/g)?.join('');
        const isBooked = await fetchBookings(phone)
        if (isBooked?.success) {
            client.sendMessage(chatId, "Счет на оплату");
            user.specialPhone = false
            user.apartment = isBooked.booked
            const apartments = [...user.apartments, isBooked.booked]
            user.apartments = apartments
            await user.save()
            const timer = setTimeout(async () => {
                console.log(`Удаляем бронь пользователя: ${chatId}`);
                await deleteBooking({apartment_id: user.apartment.apartment_id, id: user.apartment.id}); // Реализуйте deleteBooking отдельно
                user.specialPhone = false;
                await user.save();
                client.sendMessage(chatId, "Ваша бронь была удалена из-за отсутствия ответа.");
            }, 60000); // 1 минута = 60000 мс

            activeTimers.set(chatId, timer);
            return
        } else {
            client.sendMessage(chatId, "К сожалению мы не смогли найти ваш бронь, отправьте номер в формате '+7 777 777 77 77' по которому забронировали квартиру что бы мы могли проверить");
            updateLastMessages(user, "К сожалению мы не смогли найти ваш бронь, отправьте номер в формате '+7 777 777 77 77' по которому забронировали квартиру что бы мы могли проверить", "assistant");
            user.specialPhone = true
            await user.save();
            return
        }
    }

    if (!user) {
        user = new User({ phone: chatId });
        await user.save();
    }

    if (message.toLocaleLowerCase().includes("не понял")) {
        client.sendMessage("120363378709019183@g.us", `Клиенту ${clientName} с номером '${chatId.slice(0, -5)}' нужно написать wa.me//+${chatId.slice(0, -5)}`)
        return client.sendMessage(chatId, "В скором времени с вами свяжется менеджер")
    }

    // Обновляем массив lastMessages
    if (message) {
        updateLastMessages(user, message, "user");
    }

    const answer = await gptResponse(message, user.lastMessages);
    console.log(answer);
    

    if (answer.toLocaleLowerCase().includes("оплатил")) {
        clearTimeout(activeTimers.get(chatId)); // Сбрасываем таймер, если пользователь ответил вовремя
        activeTimers.delete(chatId);
        client.sendMessage(chatId, "Напишите ФИО плательщика");
        updateLastMessages(user, "Напишите ФИО плательщика", "assistant");
        user.waitFIO = true
        await user.save()
        return
    }

    if (answer.toLocaleLowerCase().includes("забронировал")) {
        const phone = chatId.match(/\d/g).join('');
        const isBooked = await fetchBookings(phone)
        if (isBooked?.success) {
            client.sendMessage(chatId, "Счет на оплату");
            user.apartment = isBooked.booked
            const apartments = [...user.apartments, isBooked.booked]
            user.apartments = apartments
            await user.save()
            const timer = setTimeout(async () => {
                console.log(`Удаляем бронь пользователя: ${chatId}`);
                await deleteBooking({apartment_id: user.apartment.apartment_id, id: user.apartment.id});
                user.specialPhone = false;
                await user.save();
                client.sendMessage(chatId, "Ваша бронь была удалена из-за отсутствия ответа.");
            }, 60000); // 1 минута = 60000 мс

            activeTimers.set(chatId, timer);
            return
        } else {
            client.sendMessage(chatId, "К сожалению мы не смогли найти ваш бронь, отправьте номер в формате '+7 777 777 77 77' по которому забронировали квартиру что бы мы могли проверить");
            updateLastMessages(user, "К сожалению мы не смогли найти ваш бронь, отправьте номер в формате '+7 777 777 77 77' по которому забронировали квартиру что бы мы могли проверить", "assistant");
            user.specialPhone = true
            await user.save();
            return
        }
    }

    if (answer.toLocaleLowerCase().includes("инструкция")) {

    }

    client.sendMessage(chatId, answer);
    updateLastMessages(user, answer, "assistant");

    // Сохраняем изменения в базе данных
    await user.save();
});

const updateLastMessages = (user, message, role) => {
    user.lastMessages.push({ role, content: message }); // Добавляем объект
    if (user.lastMessages.length > 10) {
        user.lastMessages.shift(); // Удаляем самое старое сообщение
    }
};

const gptResponse = async (text, lastMessages) => {
    const messages = [
        {
            role: "system",
            content: prompt,
        },
        ...lastMessages.map((msg) => ({
            role: msg.role,
            content: msg.content,
        })),
        {
            role: "user",
            content: text,
        },
    ];

    const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
            model: "gpt-3.5-turbo",
            messages,
        },
        {
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${OPENAI_API_KEY}`,
            },
        }
    );

    const answer = response.data.choices[0].message.content;
    return answer;
};


client.initialize();