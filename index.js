require("dotenv").config();
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { default: axios } = require("axios");
const mongoose = require("mongoose")
const Apartments = require("./Models/Apatments.js")
const User = require("./Models/User.js");
const { prompt, agreementPrompt, additionalPromot } = require("./const/prompt.js");
const { fetchBookings } = require("./scripts/fetchBookings.js");
const { deleteBooking } = require("./scripts/deleteBooking.js");
const { kaspiParser } = require("./kaspi.js");
const { handleMessage } = require("./messageHandler.js");
const { getLink } = require("./scripts/getLink.js");
const fs = require('fs').promises; // Используем промисы для асинхронной работы с файлами
const path = require('path');
const globalVar = require("./globalVar.js");
const { addBooking } = require("./scripts/addBooking.js");
const { depo, kaspiText, startMessage } = require("./const/messages.js");

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
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
    },
});

// Путь к файлу для хранения данных
const VACANT_APARTMENTS_FILE = path.join(__dirname, 'vacantApartments.json');

// Функция для проверки, нужно ли обновлять данные
const shouldUpdateData = async () => {
    try {
        const stats = await fs.stat(VACANT_APARTMENTS_FILE);
        const lastModified = new Date(stats.mtime);
        const today = new Date();
        // Проверяем, был ли файл обновлен сегодня
        return (
            lastModified.getDate() !== today.getDate() ||
            lastModified.getMonth() !== today.getMonth() ||
            lastModified.getFullYear() !== today.getFullYear()
        );
    } catch (err) {
        // Если файла нет, нужно его создать
        return true;
    }
};

// Функция для получения и сохранения данных
const fetchAndSaveVacantApartments = async () => {
    try {
        const response = await axios.get(process.env.vacantApartments);
        const data = response.data;
        await fs.writeFile(VACANT_APARTMENTS_FILE, JSON.stringify(data, null, 2));
        console.log('Vacant apartments data updated and saved to file.');
        return data;
    } catch (err) {
        console.error('Error fetching vacant apartments:', err);
        throw err;
    }
};

// Функция для получения данных (из файла или API)
const getVacantApartments = async () => {
    const updateNeeded = await shouldUpdateData();
    if (updateNeeded) {
        return await fetchAndSaveVacantApartments();
    } else {
        const data = await fs.readFile(VACANT_APARTMENTS_FILE, 'utf8');
        return JSON.parse(data);
    }
};

client.on("qr", (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on("authenticated", () => {
    console.log("Authenticated successfully!");
});

client.on("auth_failure", (msg) => {
    console.error("Authentication failed:", msg);
});

client.on("ready", async () => {
    console.log("Client is ready!");
    await getVacantApartments();
});

const activeTimers = new Map();

function calculateDaysBetweenDates(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const timeDifference = end - start;
    const daysDifference = timeDifference / (1000 * 3600 * 24);

    return daysDifference;
}

client.on('message_create', async (msg) => {
    if (msg.fromMe) {
        const chatId = msg.to;
        const message = msg.body;
        if (message.toLocaleLowerCase().includes("отключить бота")) {
            console.log("we here отключить бота");
            
            const digits = message.match(/\d/g);
            const result = digits.join("") + "@c.us";
    
            const gandon = await User.findOne({phone: result})
    
            if (gandon) {
                gandon.isGandon = true
                await gandon.save()
            } else {
                const newGandon = new User({phone: result, isGandon: true})
                await newGandon.save()
            }
            return
        }
    
        if (message.toLocaleLowerCase().includes("включить бота")) {
            console.log("we here включить бота");
            const digits = message.match(/\d/g);
            const result = digits.join("") + "@c.us";
    
            const gandon = await User.findOne({phone: result})
    
            if (gandon) {
                gandon.isGandon = false
                await gandon.save()
            } 
            return
        }
    }
});

client.on("message", async (msg) => {
    const chatId = msg.from;
    const clientName = msg._data.notifyName
    const message = msg.body;

    // console.log(chatId);
    // return
    

    if (message.toLocaleLowerCase().includes("restart")) {
        await User.findOneAndDelete({phone: chatId})
        return
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

    if (user?.additionalPrompt) {
        const answer = await gptResponse(message, user.lastMessages, additionalPromot);
        if (answer.toLocaleLowerCase().includes("инструкция")) {
            const apartmentId = user?.apartment?.apartment_id
            const apartment = await Apartments.findOne({apartment_id: apartmentId})
    
            if (!apartment) {
                await client.sendMessage(chatId, "К сожалению мы не смогли найти инструкцию по этой квартире, с вами свяжется менеджер");
                updateLastMessages(user, "К сожалению мы не смогли найти инструкцию по этой квартире, с вами свяжется менеджер", "assistant");
                client.sendMessage("120363162509779134@g.us", `Клиенту ${clientName} с номером '${chatId.slice(0, -5)}' нужно написать wa.me//+${chatId.slice(0, -5)}`)
            } else {
                await client.sendMessage(chatId, apartment.links[0]);
                updateLastMessages(user, apartment.links[0], "assistant");
                await client.sendMessage(chatId, apartment.text);
                updateLastMessages(user, apartment.text, "assistant");
            }
            return
        }
        client.sendMessage(chatId, answer)
        updateLastMessages(user, answer, "assistant")
        user.save()
        return
    }

    if (!user) {
        user = new User({ phone: chatId, last_message_date: new Date(msg.timestamp) });
        client.sendMessage(chatId, startMessage);
        const today = new Date();
        updateLastMessages(user, startMessage, "assistant");
        user.last_message_date = new Date(today);
        await user.save();
        return
    } else {
        const lastMessageDate = user.last_message_date;
        const today = new Date();
        const lastMessageDateObj = lastMessageDate ? new Date(lastMessageDate) : null;
        console.log("lastMessageDateObj", lastMessageDateObj);
        console.log("today", today);
        
        if (!lastMessageDate || lastMessageDateObj.toDateString() != today.toDateString()) {
            client.sendMessage(chatId, startMessage);
            updateLastMessages(user, startMessage, "assistant");
            user.last_message_date = new Date(today);
            await user.save();
            return
        }
    }

    if (user?.waitAgreement?.status) {
        if (user?.waitAgreement?.what?.name === "chooseApartment") {
            const agreementAnswer = await gptResponse(message, user.lastMessages, agreementPrompt);
            if (agreementAnswer === "1" || agreementAnswer === 1) {
                client.sendMessage(chatId, "Отлично, сейчас создам бронь")
                updateLastMessages(user, "Отлично, сейчас создам бронь", "assistant")
                user.waitAgreement = {status: false, what: {}}
                const userData = {
                    bookingDate: {
                        startDate: user.bookingDate.startDate,
                        endDate: user.bookingDate.endDate
                    },
                    phone: `+${user.phone.slice(0, 11)}`,
                }
                const apartmentData = {
                    amount: user.chooseApartment.price,
                    apartment_id: user.chooseApartment.id
                }
                const addBook = await addBooking(userData, apartmentData, clientName)
                if (addBook) {
                    const sum = user.chooseApartment.price * calculateDaysBetweenDates(user.bookingDate.startDate, user.bookingDate.endDate)
                    client.sendMessage(chatId, `Стоимость проживания ${sum} + депозит`)
                    updateLastMessages(user, `Стоимость проживания ${sum} + депозит`, "assistant")
                    client.sendMessage(chatId, depo)
                    updateLastMessages(user, depo, "assistant")
                    client.sendMessage(chatId, "Можете ли провести оплату по каспи?")
                    updateLastMessages(user, "Можете ли провести оплату по каспи?", "assistant")
                    user.waitAgreement = {status: true, what: {name: "mayToKaspi", sum}}
                    user.apartment = addBook
                }

                await user.save()
                return
            } else {
                client.sendMessage(chatId, "Вы могли бы написать адрес квартиры которую выбрали")
                updateLastMessages(user, "Вы могли бы написать адрес квартиры которую выбрали", "assistant")
                user.waitAgreement = {status: true, what: {name: "chooseApartment2"}}
                await user.save()
                return
            }
        }

        if (user?.waitAgreement?.what?.name === "chooseApartment2") {
            const [year, month, day] = user.bookingDate.startDate.split("-");
            const beginDate = `${day}.${month}.${year}`
            const [year2, month2, day2] = user.bookingDate.endDate.split("-");
            const endDate = `${day2}.${month2}.${year2}`
            const response = await axios.get(`${process.env.vacantApartments}begin_date=${beginDate}&end_date=${endDate}`)
            const vacantApartments = response.data.apartments
            const chooseApartment = vacantApartments.find((item) => item.address.includes(message))
            if (chooseApartment) {
                client.sendMessage(chatId, `${chooseApartment.address}, вот на этот адрес, да?`)
                updateLastMessages(user, `${chooseApartment.address}, вот на этот адрес, да?`, "assistant")
                user.chooseApartment = chooseApartment
                user.waitAgreement = {status: true, what: {name: "chooseApartment", chooseApartmentNumber: chooseApartment}}
                await user.save()
                return
            } else {
                client.sendMessage("120363162509779134@g.us", `Клиенту ${clientName} с номером '${chatId.slice(0, -5)}' нужно написать, не можем понять какая квартира нужна wa.me//+${chatId.slice(0, -5)}`)
                return client.sendMessage(chatId, "В скором времени с вами свяжется менеджер")
            }
        }

        if (user?.waitAgreement?.what?.name === "mayToKaspi") {
            const agreementAnswer = await gptResponse(message, user.lastMessages, agreementPrompt);
            if (agreementAnswer === "1" || agreementAnswer === 1) {
                await client.sendMessage(chatId, kaspiText);
                updateLastMessages(user, kaspiText, "assistant");
                client.sendMessage(chatId, "И после оплаты прошу уведомите нас об оплате 😊");
                updateLastMessages(user, "И после оплаты прошу уведомите нас об оплате 😊", "assistant");
        
                // Атомарное обновление первого шага
                await User.findOneAndUpdate(
                    { _id: user._id },
                    {
                        $set: {
                            "paid.apartment_id": user.apartment.apartment_id,
                            apartments: [...user.apartments, user.apartment],
                            waitAgreement: { status: false, what: {} }
                        }
                    },
                    { new: true } // Возвращает обновленный документ, если нужно
                );
        
                const timer = setTimeout(async () => {
                    try {
                        console.log(`Удаляем бронь пользователя: ${chatId}`);
                        await deleteBooking({ apartment_id: user.apartment.apartment_id, id: user.apartment.id });
        
                        // Атомарное обновление второго шага
                        await User.findOneAndUpdate(
                            { _id: user._id },
                            {
                                $set: {
                                    specialPhone: false,
                                    apartment: {},
                                    paid: { apartment_id: "", status: false }
                                }
                            },
                            { new: true }
                        );
        
                        client.sendMessage(chatId, "Ваша бронь была удалена из-за отсутствия ответа.");
                        updateLastMessages(user, "Ваша бронь была удалена из-за отсутствия ответа.", "assistant");
                    } catch (error) {
                        console.error("Ошибка в таймере:", error);
                    }
                }, 30000); // 30 секунд для теста, замените на 60000 для минуты
        
                activeTimers.set(chatId, timer);
                return;
            }
        }
    }

    if (user?.waitFIO) {
        console.log("Запуск kaspiParser с аргументом:", message);
        const phone = message?.match(/\d+/g)?.join('')
        const kaspi = await kaspiParser(phone?.slice(1));
        if (kaspi) {
            if (parseInt(kaspi) < 20) { //user?.apartment?.amount
                if (user.temporarySum + parseInt(kaspi) >= 20) { //user?.apartment?.amount
                    client.sendMessage(chatId, `Вы успешно забронировали, в день заселения мы отправим вам инструкцию`)
                    updateLastMessages(user, "Вы успешно забронировали, в день заселения мы отправим вам инструкцию", "assistant");
                    user.temporarySum = 0
                    user.paid.status = true
                    user.waitFIO = false
                    user.additionalPrompt = true
                } else {
                    user.temporarySum += parseInt(kaspi)
                    client.sendMessage(chatId, `К сожалению вы отправили не полную сумму, вы можете еще раз пройти по ссылке и оплатить оставшуюся сумму. После оплаты напишите слово 'Оплатил'`)
                    updateLastMessages(user, "К сожалению вы отправили не полную сумму, вы можете еще раз пройти по ссылке и оплатить оставшуюся сумму. После оплаты напишите слово 'Оплатил'", "assistant");
                    user.waitFIO = false
                }
            } else {
                client.sendMessage(chatId, `Вы успешно забронировали, в день заселения мы отправим вам инструкцию`)
                updateLastMessages(user, "Вы успешно забронировали, в день заселения мы отправим вам инструкцию", "assistant");
                user.temporarySum = 0
                user.paid.status = true
                user.waitFIO = false
                user.additionalPrompt = true
            }
            user.waitFIO = false
            await user.save()
            return
        } else {
            client.sendMessage(chatId, `Мы не смогли найти вашу оплату, напишите номер телефона в формате '+7 777 777 77 77' по которому провели оплату`)
            updateLastMessages(user, "Мы не смогли найти вашу оплату, напишите номер телефона в формате '+7 777 777 77 77' по которому провели оплату", "assistant");
            user.waitFIO = true
            await user.save()
            return
        }
    }

    if (user?.specialPhone) {
        const phone = message?.match(/\d/g)?.join('');
        const isBooked = await fetchBookings(phone)
        if (isBooked?.success) {
            const sum = isBooked.booked.amount
            client.sendMessage(chatId, `Стоимость проживания ${sum} + депозит`)
            updateLastMessages(user, `Стоимость проживания ${sum} + депозит`, "assistant")
            client.sendMessage(chatId, depo)
            updateLastMessages(user, depo, "assistant")
            client.sendMessage(chatId, "Можете ли провести оплату по каспи?")
            updateLastMessages(user, "Можете ли провести оплату по каспи?", "assistant")
            user.waitAgreement = {status: true, what: {name: "mayToKaspi", sum}}
    
            // Атомарное обновление первого шага
            await User.findOneAndUpdate(
                { _id: user._id },
                {
                    $set: {
                        "paid.apartment_id": isBooked.booked.apartment_id,
                        chooseApartment: isBooked.booked,
                        waitAgreement: {statsu: true, what: {name: "mayToKaspi", sum}},
                        apartments: [...user.apartments, isBooked.booked],
                        apartment: isBooked.booked
                    }
                },
                { new: true } // Возвращает обновленный документ, если нужно
            );
            return;
        } else {
            client.sendMessage(chatId, "К сожалению мы не смогли найти ваш бронь, отправьте номер в формате '+7 777 777 77 77' по которому забронировали квартиру что бы мы могли проверить");
            updateLastMessages(user, "К сожалению мы не смогли найти ваш бронь, отправьте номер в формате '+7 777 777 77 77' по которому забронировали квартиру что бы мы могли проверить", "assistant");
            user.specialPhone = true
            await user.save();
            return
        }
    }

    if (message.toLocaleLowerCase().includes("не понял")) {
        client.sendMessage("120363162509779134@g.us", `Клиенту ${clientName} с номером '${chatId.slice(0, -5)}' нужно написать wa.me//+${chatId.slice(0, -5)}`)
        return client.sendMessage(chatId, "В скором времени с вами свяжется менеджер")
    }

    // Обновляем массив lastMessages
    if (message) {
        updateLastMessages(user, message, "user");
    }

    const todayForPrompt = new Date();
    const answer = await gptResponse(message, user.lastMessages, `- Текущая дата — ${todayForPrompt.getFullYear()}-${todayForPrompt.getMonth() + 1}-${todayForPrompt.getDate()}, используй её для контекста, если даты указаны относительно (например, "на следующей неделе").` + prompt);
    const answerData = await handleMessage(answer)
    console.log("answerData = ", answerData);
    

    if (answerData?.what === 1) {
        const [year, month, day] = answerData.dateIn.split("-");
        const beginDate = `${day}.${month}.${year}`
        const [year2, month2, day2] = answerData.dateOut.split("-");
        const endDate = `${day2}.${month2}.${year2}`
        const response = await axios.get(`${process.env.vacantApartments}humans=${answerData.persons}&begin_date=${beginDate}&end_date=${endDate}`)
        // console.log("respone in getApartments = ", response);
        
        const vacantApartments = response.data.apartments
        const dataToLink = vacantApartments.map((item) => {
            return {
                apartment_id: item.id,
                apartment_title: item.title,
                amount: item.price,
                is_special_amount: false
            }
        })
        let link = await getLink(answerData.dateIn, answerData.dateOut, dataToLink)
        if (link === "sosi hui") {
            globalVar.setVar("")
            link = await getLink(answerData.dateIn, answerData.dateOut, dataToLink)
        }
        if (link === "sosi hui dvazhdy") {
            client.sendMessage(chatId, "Ошибка при получении ссылки(");
            updateLastMessages(user, "Ошибка при получении ссылки(", "assistant");
            await user.save()
            return
        }
        if (link.source.items.length === 0) {
            client.sendMessage(chatId, `С ${answerData.dateIn} по ${answerData.dateOut} нет свободных квартир`);
            updateLastMessages(user, `С ${answerData.dateIn} по ${answerData.dateOut} нет свободных квартир`, "assistant");
            await user.save()
            return
        }
        client.sendMessage(chatId, `С ${answerData.dateIn} по ${answerData.dateOut} подобрано вариантов: ${link.source.items.length}. Для просмотра перейдите по ссылке: ${link.url}`);
        updateLastMessages(user, `С ${answerData.dateIn} по ${answerData.dateOut} подобрано вариантов: ${link.source.items.length}. Для просмотра перейдите по ссылке: ${link.url}`, "assistant");
        user.chooseApartments = link.source.items
        user.bookingDate = {startDate: answerData.dateIn, endDate: answerData.dateOut, personsKol: answerData.persons || 1}
        await user.save()
        return
    }

    if (answerData?.what === 7) {
        user.bookingDate.startDate = answerData.dateIn
        if (user.bookingDate.endDate === "") {
            client.sendMessage(chatId, "Пожалуйста отправьте дату выезда");
            updateLastMessages(user, "Пожалуйста отправьте дату выезда", "assistant");
            await user.save()
            return
        }
    }

    if (answerData?.what === 8) {
        user.bookingDate.endDate = answerData.dateOut
        if (user.bookingDate.personsKol === 0) {
            client.sendMessage(chatId, "Пожалуйста отправьте количество персон");
            updateLastMessages(user, "Пожалуйста отправьте количество персон", "assistant");
            await user.save()
            return
        }
    }

    if (answerData?.what === 9) {
        user.bookingDate.personsKol = answerData.persons
        if (user.bookingDate.startDate !== "" && user.bookingDate.endDate !== "") {
            const [year, month, day] = user.bookingDate.startDate.split("-");
            const beginDate = `${day}.${month}.${year}`
            const [year2, month2, day2] = user.bookingDate.endDate.split("-");
            const endDate = `${day2}.${month2}.${year2}`
            const response = await axios.get(`${process.env.vacantApartments}humans=${user.bookingDate.personsKol}&begin_date=${beginDate}&end_date=${endDate}`)
            // console.log("respone in getApartments = ", response);
            
            const vacantApartments = response.data.apartments
            const dataToLink = vacantApartments.map((item) => {
                return {
                    apartment_id: item.id,
                    apartment_title: item.title,
                    amount: item.price,
                    is_special_amount: false
                }
            })
            let link = await getLink(user.bookingDate.startDate, user.bookingDate.endDate, dataToLink)
            if (link === "sosi hui") {
                globalVar.setVar("")
                link = await getLink(user.bookingDate.startDate, user.bookingDate.endDate, dataToLink)
            }
            if (link === "sosi hui dvazhdy") {
                client.sendMessage(chatId, "Ошибка при получении ссылки(");
                updateLastMessages(user, "Ошибка при получении ссылки(", "assistant");
                await user.save()
                return
            }
            if (link.source.items.length === 0) {
                client.sendMessage(chatId, `С ${user.bookingDate.startDate} по ${user.bookingDate.endDate} нет свободных квартир`);
                updateLastMessages(user, `С ${user.bookingDate.startDate} по ${user.bookingDate.endDate} нет свободных квартир`, "assistant");
                await user.save()
                return
            }
            client.sendMessage(chatId, `С ${user.bookingDate.startDate} по ${user.bookingDate.endDate} подобрано вариантов: ${link.source.items.length}. Для просмотра перейдите по ссылке: ${link.url}`);
            updateLastMessages(user, `С ${user.bookingDate.startDate} по ${user.bookingDate.endDate} подобрано вариантов: ${link.source.items.length}. Для просмотра перейдите по ссылке: ${link.url}`, "assistant");
            user.chooseApartments = link.source.items
            await user.save()
            return
        }
    }

    if (answerData?.what === 3) {
        if (answerData?.isAddress) {
            const [year, month, day] = user.bookingDate.startDate.split("-");
            const beginDate = `${day}.${month}.${year}`
            const [year2, month2, day2] = user.bookingDate.endDate.split("-");
            const endDate = `${day2}.${month2}.${year2}`
            const response = await axios.get(`${process.env.vacantApartments}begin_date=${beginDate}&end_date=${endDate}`)
            const vacantApartments = response.data.apartments
            const chooseApartment = vacantApartments.find((item) => item.address.includes(answerData?.address))
            if (chooseApartment) {
                client.sendMessage(chatId, `${chooseApartment.address}, вот на этот адрес, да?`)
                updateLastMessages(user, `${chooseApartment.address}, вот на этот адрес, да?`, "assistant")
                user.chooseApartment = chooseApartment
                user.waitAgreement = {status: true, what: {name: "chooseApartment", chooseApartmentNumber: answerData.chooseApartment}}
                await user.save()
                return
            } else {
                client.sendMessage("120363162509779134@g.us", `Клиенту ${clientName} с номером '${chatId.slice(0, -5)}' нужно написать, не можем понять какая квартира нужна wa.me//+${chatId.slice(0, -5)}`)
                return client.sendMessage(chatId, "В скором времени с вами свяжется менеджер")
            }
        } else {
            const response = await axios.get(`${process.env.vacantApartments}`)
            const apartments = response.data.apartments
            const userChooseApartments = user.chooseApartments
            const chooseApartment = apartments.find((item) => item.id === userChooseApartments[answerData.chooseApartment - 1].apartment_id)
            client.sendMessage(chatId, `${chooseApartment.address}, вот на этот адрес, да?`)
            updateLastMessages(user, `${chooseApartment.address}, вот на этот адрес, да?`, "assistant")
            user.chooseApartment = chooseApartment
            user.waitAgreement = {status: true, what: {name: "chooseApartment", chooseApartmentNumber: answerData.chooseApartment}}
            await user.save()
            return
        }
    }
    
    if (answerData?.what === 4) {
        if (user.dontUnderstand === 1) {
            await User.findOneAndUpdate(
                { _id: user._id },
                {
                    $set: {
                        isGandon: true,
                        dontUnderstand: 0,
                    }
                },
                { new: true } // Возвращает обновленный документ, если нужно
            );
            client.sendMessage("120363162509779134@g.us", `Клиенту ${clientName} с номером '${chatId.slice(0, -5)}' нужно написать, не можем понять что он хочет wa.me//+${chatId.slice(0, -5)}`)
            client.sendMessage(chatId, "В скором времени с вами свяжется менеджер")
            return
        }
        client.sendMessage(chatId, `Не совсем понял вас, вы могли бы уточнить?`)
        updateLastMessages(user, `Не совсем понял вас, вы могли бы уточнить?`, "assistant")
        await User.findOneAndUpdate(
            { _id: user._id },
            {
                $set: {
                    dontUnderstand: 1,
                }
            },
            { new: true } // Возвращает обновленный документ, если нужно
        );
        return
    }

    if (answer.toLocaleLowerCase().includes("оплатил")) {
        clearTimeout(activeTimers.get(chatId)); // Сбрасываем таймер, если пользователь ответил вовремя
        activeTimers.delete(chatId);
        const phone = chatId?.match(/\d+/g)?.join('')
        const kaspi = await kaspiParser(phone?.slice(1));
        if (kaspi) {
            if (parseInt(kaspi) < 20) { //user?.apartment?.amount
                if (user.temporarySum + parseInt(kaspi) >= 20) { //user?.apartment?.amount
                    client.sendMessage(chatId, `Вы успешно забронировали, в день заселения мы отправим вам инструкцию`)
                    updateLastMessages(user, "Вы успешно забронировали, в день заселения мы отправим вам инструкцию", "assistant");
                    user.temporarySum = 0
                    user.paid.status = true
                    user.waitFIO = false
                    user.additionalPrompt = true
                } else {
                    user.temporarySum += parseInt(kaspi)
                    client.sendMessage(chatId, `К сожалению вы отправили не полную сумму, вы можете еще раз пройти по ссылке и оплатить оставшуюся сумму. После оплаты напишите слово 'Оплатил'`)
                    updateLastMessages(user, "К сожалению вы отправили не полную сумму, вы можете еще раз пройти по ссылке и оплатить оставшуюся сумму. После оплаты напишите слово 'Оплатил'", "assistant");
                    user.waitFIO = false
                }
            } else {
                client.sendMessage(chatId, `Вы успешно забронировали, в день заселения мы отправим вам инструкцию`)
                updateLastMessages(user, "Вы успешно забронировали, в день заселения мы отправим вам инструкцию", "assistant");
                user.temporarySum = 0
                user.paid.status = true
                user.waitFIO = false
                user.additionalPrompt = true
            }
            user.waitFIO = false
            await user.save()
            return
        } else {
            client.sendMessage(chatId, `Мы не смогли найти вашу оплату, напишите номер телефона в формате '+7 777 777 77 77' по которому провели оплату`)
            updateLastMessages(user, "Мы не смогли найти вашу оплату, напишите номер телефона в формате '+7 777 777 77 77' по которому провели оплату", "assistant");
            user.waitFIO = true
            await user.save()
            return
        }
        return
    }

    if (answer.toLocaleLowerCase().includes("забронировал")) {
        const phone = chatId.match(/\d/g).join('');
        const isBooked = await fetchBookings(phone)
        if (isBooked?.success) {
            const sum = isBooked.booked.amount
            client.sendMessage(chatId, `Стоимость проживания ${sum} + депозит`)
            updateLastMessages(user, `Стоимость проживания ${sum} + депозит`, "assistant")
            client.sendMessage(chatId, depo)
            updateLastMessages(user, depo, "assistant")
            client.sendMessage(chatId, "Можете ли провести оплату по каспи?")
            updateLastMessages(user, "Можете ли провести оплату по каспи?", "assistant")
            user.waitAgreement = {status: true, what: {name: "mayToKaspi", sum}}
    
            // Атомарное обновление первого шага
            await User.findOneAndUpdate(
                { _id: user._id },
                {
                    $set: {
                        "paid.apartment_id": isBooked.booked.apartment_id,
                        chooseApartment: isBooked.booked,
                        waitAgreement: {statsu: true, what: {name: "mayToKaspi", sum}},
                        apartments: [...user.apartments, isBooked.booked],
                        apartment: isBooked.booked
                    }
                },
                { new: true } // Возвращает обновленный документ, если нужно
            );
            return;
        } else {
            client.sendMessage(chatId, "К сожалению мы не смогли найти ваш бронь, отправьте номер в формате '+7 777 777 77 77' по которому забронировали квартиру что бы мы могли проверить");
            updateLastMessages(user, "К сожалению мы не смогли найти ваш бронь, отправьте номер в формате '+7 777 777 77 77' по которому забронировали квартиру что бы мы могли проверить", "assistant");
            user.specialPhone = true
            await user.save();
            return
        }
    }

    if (answer.toLocaleLowerCase().includes("инструкция")) {
        const apartmentId = user?.apartment?.apartment_id
        const apartment = await Apartments.findOne({apartment_id: apartmentId})

        if (!apartment) {
            await client.sendMessage(chatId, "К сожалению мы не смогли найти инструкцию по этой квартире, с вами свяжется менеджер");
            updateLastMessages(user, "К сожалению мы не смогли найти инструкцию по этой квартире, с вами свяжется менеджер", "assistant");
            client.sendMessage("120363162509779134@g.us", `Клиенту ${clientName} с номером '${chatId.slice(0, -5)}' нужно написать wa.me//+${chatId.slice(0, -5)}`)
        } else {
            await client.sendMessage(chatId, apartment.links[0]);
            updateLastMessages(user, apartment.links[0], "assistant");
            await client.sendMessage(chatId, apartment.text);
            updateLastMessages(user, apartment.text, "assistant");
        }
        return
    }

    client.sendMessage(chatId, answer);
    updateLastMessages(user, answer, "assistant");

    // Сохраняем изменения в базе данных
    await user.save();
});

const updateLastMessages = (user, message, role) => {
    user.lastMessages.push({ role, content: message });
    if (user.lastMessages.length > 10) {
        user.lastMessages.shift();
    }
};

const gptResponse = async (text, lastMessages, prompt) => {
    // console.log(prompt);
    
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
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
        }
    );

    const answer = response.data.choices[0].message.content;
    return answer;
};

client.initialize();