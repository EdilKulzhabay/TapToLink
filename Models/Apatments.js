const mongoose = require("mongoose")

const ApartmentsSchema = new mongoose.Schema(
    {
        apartment_id: {
            type: String,
            required: true
        },
        instructions: [],
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