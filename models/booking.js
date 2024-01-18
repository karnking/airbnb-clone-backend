const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const bookingSchema = new Schema({
  listing: {type: mongoose.Schema.Types.ObjectId , required: true , ref:'Listing'},
  user: {type: mongoose.Schema.Types.ObjectId , required:true},
  checkIn: {type: Date , required: true},
  checkOut: {type: Date , required: true},
  guests: {type:Number , required: true},
  name:{type:String , required: true},
  phone:{type:String , required:true},
  price: Number,
}); 

const Booking = mongoose.model("Booking", bookingSchema);
module.exports = Booking;