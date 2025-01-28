const mongoose = require("mongoose")

const UserSchema = new mongoose.Schema(
    {
        phone: {
            type: String,
            required: true
        },
        status: {
            type: Boolean,
            default: false
        },
        apartment: {
            type: Object,
            default: {}
        },
        specialPhone: {
            type: Boolean,
            default: false
        },
        lastMessages: {
            type: [
                {
                    role: {
                        type: String,
                        enum: ["user", "assistant"],
                        required: true,
                    },
                    content: {
                        type: String,
                        required: true,
                    },
                },
            ], // Массив строк для хранения сообщений
            default: []
        },
        apartments: [
            {
                apartment_id: {
                    type: String,
                },
                start_date: {
                    type: String
                },
                end_date: {
                    type: String
                }
            }
        ],
        isGandon: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("User", UserSchema);