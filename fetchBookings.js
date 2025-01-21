const { default: axios } = require("axios");
const crypto = require("crypto");
require("dotenv").config();

const begin_date = '2024-12-01';
const end_date = '2024-12-30';

// Формируем параметры запроса
const params = {
    begin_date,
    end_date
};

function generateSign(params) {
    const sortedParams = Object.keys(params).sort().map(key => `${key}=${params[key]}`).join('');
    const dataToHash = sortedParams + process.env.PRIVATE_KEY;
    const sign = crypto.createHash('md5').update(dataToHash).digest('hex');
    return sign;
}

// Функция для получения броней
const fetchBookings = async (phone) => {
    const url = `https://realtycalendar.ru/api/v1/bookings/${process.env.PUBLIC_KEY}`;
    console.log("url", url);

    // Добавляем подпись к параметрам запроса
    const requestBody = {
        ...params,
        sign: generateSign(params)
    };

    try {
        const response = await axios.post(url, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });

        if (response.status === 200) {
            const bookings = response.data.bookings
            console.log(bookings);
            
            const booked = bookings.find((item) => {
                return item.client && item.client.phone && item.client.phone.match(/\d/g).join('') === phone.join('');
            });

            if (booked) {
                return true
            } else {
                return false
            }
        }
    } catch (error) {
        if (error.response) {
            console.error('Error Response:', error.response.data);
            console.error('Status Code:', error.response.status);
        } else {
            console.error('Error Message:', error.message);
        }
    }
}

module.exports = { fetchBookings };
