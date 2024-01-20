require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Listing = require("./models/listing.js");
const User = require("./models/user.js");
const Booking = require("./models/booking.js");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const wrapAsync = require("./utils/wrapAsync.js");
const ExpressError = require("./utils/ExpressError.js");

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

function getUserFromToken(req) {
  return new Promise((resolve, reject) => {
    jwt.verify(req.cookies.token, jwtSecret, {}, (err, userData) => {
      if (err) {
        const errorMessage = "Invalid or missing token";
        reject(new Error(errorMessage));
        return;
      }
      resolve(userData);
    });
  });
}

// login route:
app.post(
  "/login",
  wrapAsync(async (req, res) => {
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
        throw new ExpressError(
          422,
          "Incorrect email or password. Please try again."
        );
      }
    } else {
      throw new ExpressError(404, "User not found");
    }
  })
);

// register route:
app.post(
  "/register",
  wrapAsync(async (req, res) => {
    const { name, email, password } = req.body;
    const userDoc = await User.create({
      name,
      email,
      password: bcrypt.hashSync(password, bcryptSalt),
    });
    res.json(userDoc);
  })
);

// logout route:
app.post("/logout", (req, res) => {
  res.cookie("token", "").json(true);
});

app.get(
  "/profile",
  wrapAsync(async (req, res) => {
    const { token } = req.cookies;
    if (!token) {
      return res.json(null);
    }
    jwt.verify(token, jwtSecret, {}, async (err, userData) => {
      if (err) {
        throw new ExpressError(401, "Unauthorized user");
      }
      const { name, email, _id } = await User.findById(userData.id);
      res.json({ name, email, _id });
    });
  })
);

// index route: renders all listings on homepage.
app.get(
  "/listings",
  wrapAsync(async (req, res) => {
    const allListings = await Listing.find({});
    res.json(allListings);
  })
);

// new route: creates a new listing.
app.post(
  "/listings",
  wrapAsync(async (req, res) => {
    const { token } = req.cookies;
    if(!token){
      throw new ExpressError(401 , "User not logged In");
    }
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
    if (
      !title ||
      !address ||
      !addedPhotos ||
      !description ||
      !perks ||
      !extraInfo ||
      !checkIn ||
      !checkOut ||
      !maxGuests ||
      !price
    ) {
      throw new ExpressError(400, "All fields are required");
    }

    jwt.verify(token, jwtSecret, {}, async (err, userData) => {
      if (err) {
        throw new ExpressError(403, "Unauthorized user");
      };
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
    });
  })
);

// edit route: to edit a listing
app.put(
  "/listings",
  wrapAsync(async (req, res) => {
    const { token } = req.cookies;
    if(!token){
      throw new ExpressError(401 , "User not logged In");
    }
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
    if (
      !id ||
      !title ||
      !address ||
      !addedPhotos ||
      !description ||
      !perks ||
      !extraInfo ||
      !checkIn ||
      !checkOut ||
      !maxGuests ||
      !price
    ) {
      throw new ExpressError(400, "All fields are required");
    }
    jwt.verify(token, jwtSecret, {}, async (err, userData) => {
      if (err) {
        throw new ExpressError(403, "Unauthorized user");
      }
      const listing = await Listing.findById(id);
      if (!listing) {
        throw new ExpressError(404, "Listing not found");
      }
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
      } else {
        throw new ExpressError(403, "Unauthorized user");
      }
      await listing.save();
      res.json("updated successfully");
    });
  })
);

// show route: renders all data of a particular listing.
app.get(
  "/listings/:id",
  wrapAsync(async (req, res) => {
    let { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ExpressError(400, "Invalid Listing Id");
    }
    const listing = await Listing.findById(id);
    if (!listing) {
      throw new ExpressError(404, "Listing not found");
    }
    res.json(listing);
  })
);

app.get(
  "/userlistings",
  wrapAsync(async (req, res) => {
    const { token } = req.cookies;
    if (!token) {
      throw new ExpressError(401, "User not logged In");
    }
    jwt.verify(token, jwtSecret, {}, async (err, userData) => {
      if (err) {
        throw new ExpressError(403, "Unauthorized User");
      }
      const { id } = userData;
      const userlistings = await Listing.find({ owner: id });
      res.json(userlistings);
    });
  })
);

app.get(
  "/userlistings/:id",
  wrapAsync(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ExpressError(400, "Invalid Listing Id");
    }
    const listing = await Listing.findById(id);
    if (!listing) {
      throw new ExpressError(404, "Listing not found");
    }
    res.json(listing);
  })
);

app.post(
  "/uploadbylink",
  wrapAsync(async (req, res) => {
    const { link } = req.body;
    if (!link) {
      throw new ExpressError(400, "link is required");
    }
    const newName = "photo" + Date.now() + ".jpg";
    await imageDownloader.image({
      url: link,
      dest: __dirname + "/uploads/" + newName,
    });
    res.json(newName);
  })
);

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

app.get(
  "/booking",
  wrapAsync(async (req, res) => {
    const userData = await getUserFromToken(req);
    if (!userData || !userData.id) {
      throw new ExpressError(401, "Unauthorized User");
    }
    res.json(await Booking.find({ user: userData.id }).populate("listing"));
  })
);

app.get(
  "/booking/:id",
  wrapAsync(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ExpressError(400, "Invalid Booking Id");
    }
    const bookings = await Booking.findById(id).populate("listing");
    if (!bookings) {
      throw new ExpressError(404, "Booking not found");
    }
    res.json(bookings);
  })
);

app.post(
  "/booking",
  wrapAsync(async (req, res) => {
    const userData = await getUserFromToken(req);
    if (!userData || !userData.id) {
      throw new ExpressError(401, "Unauthorized User");
    }
    const { listing, checkIn, checkOut, guests, name, phone, price } = req.body;
    if (
      !listing ||
      !checkIn ||
      !checkOut ||
      !guests ||
      !name ||
      !phone ||
      !price
    ) {
      throw new ExpressError(400, "All fields are required");
    }
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
  })
);

app.all("*", (req, res, next) => {
  next(new ExpressError(404, "Page not found!"));
});

app.use((err, req, res, next) => {
  let { statusCode = 500, message = "Something went wrong!" } = err;
  // res.status(statusCode).json({ error: message });
  res.status(statusCode).send(message);
});

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
