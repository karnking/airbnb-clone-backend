const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const listingSchema = new Schema({
  owner: {type: Schema.Types.ObjectId , ref: 'User'},
  title: {
    type: String,
    required: true,
  },
  address: String,
  photos: [String],
  description: String,
  
  perks: [String],
  extraInfo: String,
  checkIn: Number,
  checkOut: Number,
  maxGuests: Number,
  price: Number,
});

const Listing = mongoose.model("Listing", listingSchema);
module.exports = Listing;