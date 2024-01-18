const express = require("express");
require("dotenv").config();
const app = express();
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Listing = require("./models/listing.js");
const User = require("./models/user.js");
const Booking = require("./models/booking.js");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const imageDownloader = require("image-downloader");
const multer = require("multer");
const fs = require("fs");

const bcryptSalt = bcrypt.genSaltSync(10);
const jwtSecret = process.env.JWT_SECRET;
const PORT = process.env.PORT;
const corsOrigin = process.env.CORS_ORIGIN;

const DB_URL = process.env.DATABASE;

main()
  .then(() => {
    console.log("Connected to DB");
  })
  .catch((err) => {
    console.log(err);
  });

async function main() {
  await mongoose.connect(DB_URL);
}

app.use(
  cors({
    credentials: true,
    origin: corsOrigin,
  })
);
app.use("/uploads", express.static(__dirname + "/uploads"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// login route:
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const userDoc = await User.findOne({ email });
  if (userDoc) {
    const passOk = bcrypt.compareSync(password, userDoc.password);
    if (passOk) {
      jwt.sign(
        {
          email: userDoc.email,
          id: userDoc._id,
        },
        jwtSecret,
        {},
        (err, token) => {
          if (err) throw err;
          res.cookie("token", token).json(userDoc);
        }
      );
    } else {
      res.status(422).json("pass not ok");
    }
  } else {
    res.json("not found");
  }
});

// register route:
app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  const userDoc = await User.create({
    name,
    email,
    password: bcrypt.hashSync(password, bcryptSalt),
  });
  res.json(userDoc);
});

app.get("/profile", (req, res) => {
  const { token } = req.cookies;
  // res.json({token});
  if (token) {
    jwt.verify(token, jwtSecret, {}, async (err, userData) => {
      if (err) throw err;
      const { name, email, _id } = await User.findById(userData.id);
      res.json({ name, email, _id });
    });
  } else {
    res.json(null);
  }
});

// logout route:
app.post("/logout", (req, res) => {
  res.cookie("token", "").json(true);
});

function getUserFromToken(req) {
  return new Promise((resolve, reject) => {
    jwt.verify(req.cookies.token, jwtSecret, {}, async (err, userData) => {
      if (err) {
        throw err;
      }
      resolve(userData);
    });
  });
}

// index route: renders all listings on homepage.
app.get("/listings", async (req, res) => {
  const allListings = await Listing.find({});
  res.send(allListings);
});

// new route: creates a new listing.
app.post("/listings", async (req, res) => {
  try {
    const { token } = req.cookies;
    const {
      title,
      address,
      addedPhotos,
      description,
      perks,
      extraInfo,
      checkIn,
      checkOut,
      maxGuests,
      price,
    } = req.body;

    if (token) {
      try {
        const userData = jwt.verify(token, jwtSecret);
        const listing = await Listing.create({
          owner: userData.id,
          title,
          address,
          photos: addedPhotos,
          description,
          perks,
          extraInfo,
          checkIn,
          checkOut,
          maxGuests,
          price,
        });
        res.json(listing);
      } catch (err) {
        // Handle JWT verification error
        res.status(401).json({ error: "Invalid token" });
      }
    } else {
      // Handle missing token
      res.status(401).json({ error: "Token missing" });
    }
  } catch (error) {
    // Handle unexpected errors
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// edit route: to edit a listing
app.put("/listings", async (req, res) => {
  const { token } = req.cookies;
  const {
    id,
    title,
    address,
    addedPhotos,
    description,
    perks,
    extraInfo,
    checkIn,
    checkOut,
    maxGuests,
    price,
  } = req.body;
  jwt.verify(token, jwtSecret, {}, async (err, userData) => {
    if (err) throw err;
    const listing = await Listing.findById(id);
    if (userData.id === listing.owner.toString()) {
      listing.set({
        title,
        address,
        photos: addedPhotos,
        description,
        perks,
        extraInfo,
        checkIn,
        checkOut,
        maxGuests,
        price,
      });
    }
    await listing.save();
    res.json("updated successfully");
  });
});

// show route: renders all data of a particular listing.
app.get("/listings/:id", async (req, res) => {
  let { id } = req.params;
  const listing = await Listing.findById(id);
  res.send(listing);
  // console.log(listing)
});

// userlistings: gets all the listings listed by user.
app.get("/userlistings", async (req, res) => {
  const { token } = req.cookies;
  jwt.verify(token, jwtSecret, {}, async (err, userData) => {
    const { id } = userData;
    res.json(await Listing.find({ owner: id }));
  });
});

app.get("/userlistings/:id", async (req, res) => {
  const { id } = req.params;
  res.json(await Listing.findById(id));
});

app.post("/uploadbylink", async (req, res) => {
  const { link } = req.body;
  const newName = "photo" + Date.now() + ".jpg";
  await imageDownloader.image({
    url: link,
    dest: __dirname + "/uploads/" + newName,
  });
  res.json(newName);
});

const photosMiddleware = multer({ dest: "uploads/" });
app.post(
  "/uploadfromdevice",
  photosMiddleware.array("photos", 100),
  (req, res) => {
    const uploadedFiles = [];
    for (let i = 0; i < req.files.length; i++) {
      const { path, originalname } = req.files[i];
      const parts = originalname.split(".");
      const ext = parts[parts.length - 1];
      const newPath = path + "." + ext;
      fs.renameSync(path, newPath);
      uploadedFiles.push(newPath.replace("uploads/", ""));
    }
    res.json(uploadedFiles);
  }
);

app.get("/booking", async (req, res) => {
  // const { token } = req.cookies;
  // jwt.verify(token, jwtSecret, {}, async (err, userData) => {
  //   const { id } = userData;
  //   res.json(await Booking.find({ user: id }));
  // });
  const userData = await getUserFromToken(req);
  res.json(await Booking.find({ user: userData.id }).populate("listing"));
});

app.get("/booking/:id", async (req, res) => {
  const { id } = req.params;

  const booking = await Booking.findById(id).populate("listing");
  res.send(booking);
});

app.post("/booking", async (req, res) => {
  const userData = await getUserFromToken(req);
  const { listing, checkIn, checkOut, guests, name, phone, price } = req.body;
  const booking = await Booking.create({
    listing,
    user: userData.id,
    checkIn,
    checkOut,
    guests,
    name,
    phone,
    price,
  });
  res.json(booking);
});

app.listen(PORT, () => {
  console.log("Server is listening on port 3000");
});
