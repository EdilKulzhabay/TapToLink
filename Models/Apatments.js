const mongoose = require("mongoose")

const ApartmentsSchema = new mongoose.Schema(
    {
        apartment_id: {
            type: String,
            required: true
        },
        instructions: {
            type: String,
            default: ""
        },
        address: {
            type: String,
            default: ""
        }
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("Apartments", ApartmentsSchema);