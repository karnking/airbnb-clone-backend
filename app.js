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
// const wrapAsync = require("./utils/wrapAsync.js");
const ExpressError = require("./utils/ExpressError.js");

const imageDownloader = require("image-downloader");
const multer = require("multer");
const fs = require("fs");

const bcryptSalt = bcrypt.genSaltSync(10);
const jwtSecret = process.env.JWT_SECRET;
const PORT = process.env.PORT || 3000;
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
app.post("/login", async (req, res, next) => {
  try {
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
      res.json("user not found");
    }
  } catch (err) {
    next(err);
  }
});

// register route:
app.post("/register", async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const userDoc = await User.create({
      name,
      email,
      password: bcrypt.hashSync(password, bcryptSalt),
    });
    res.json(userDoc);
  } catch (err) {
    next(err);
  }
});

// logout route:
app.post("/logout", (req, res) => {
  res.cookie("token", "").json(true);
});

// *****

app.get("/profile", async (req, res) => {
  try {
    const { token } = req.cookies;
    if (!token) {
      return res.json(null); // No token provided, respond with null
    }
    jwt.verify(token, jwtSecret, {}, async (err, userData) => {
      if (err) {
        console.error("JWT verification error:", err);
        return res.status(401).json({ error: "Unauthorized - Invalid token" });
      }
      const { name, email, _id } = await User.findById(userData.id);
      res.json({ name, email, _id });
    });
  } catch (err) {
    console.error("Error in /profile endpoint:", err);
    res.status(500).json({ err: "Internal Server Error" });
  }
  // const { token } = req.cookies;
  // if (token) {
  //   jwt.verify(token, jwtSecret, {}, async (err, userData) => {
  //     if (err) throw err;
  //     const { name, email, _id } = await User.findById(userData.id);
  //     res.json({ name, email, _id });
  //   });
  // } else {
  //   res.json(null);
  // }
});

// index route: renders all listings on homepage.
app.get("/listings", async (req, res, next) => {
  try {
    const allListings = await Listing.find({});
    if (!allListings || allListings.length === 0) {
      return res.json({ error: "No listings found" });
    }
    res.json(allListings);
  } catch (err) {
    next(err);
  }
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
  try {
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
  } catch (err) {
    console.error("Error in put listing", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// show route: renders all data of a particular listing.
app.get("/listings/:id", async (req, res) => {
  try {
    let { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid listing ID" });
    }
    const listing = await Listing.findById(id);
    if (!listing) {
      return res.status(404).json({ error: "Listing not found" });
    }
    res.json(listing);
  } catch (err) {
    console.error("Error in /listings/:id GET endpoint:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// userlistings: gets all the listings listed by user.
// app.get("/userlistings", async (req, res) => {
//   const { token } = req.cookies;
//   jwt.verify(token, jwtSecret, {}, async (err, userData) => {
//     // const { id } = userData;
//     res.json(await Listing.find({ owner: userData.id }));
//   });
// });

app.get("/userlistings", async (req, res) => {
  try {
    const { token } = req.cookies;

    if (!token) {
      return res.status(401).json({ error: "Unauthorized - Missing token" });
    }

    jwt.verify(token, jwtSecret, {}, async (err, userData) => {
      if (err) {
        return res.status(401).json({ error: "Unauthorized - Invalid token" });
      }

      const { id } = userData;
      const userlistings = await Listing.find({ owner: id });

      res.json(userlistings);
    });
  } catch (error) {
    console.error("Error in /userlistings endpoint:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/userlistings/:id", async (req, res) => {
  // const { id } = req.params;
  // res.json(await Listing.findById(id));

  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid listing ID" });
    }
    const listing = await Listing.findById(id);
    if (!listing) {
      return res.status(404).json({ error: "Listing not found" });
    }
    res.json(listing);
  } catch (error) {
    console.error("Error in /userlistings/:id GET endpoint:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/uploadbylink", async (req, res) => {
  try {
    const { link } = req.body;
    if (!link) {
      return res
        .status(400)
        .json({ error: "Link is required in the request body" });
    }
    const newName = "photo" + Date.now() + ".jpg";
    await imageDownloader.image({
      url: link,
      dest: __dirname + "/uploads/" + newName,
    });
    res.json(newName);
  } catch (err) {
    console.error("Error in /uploadbylink endpoint:", err);
    res.status(500).json({ err: "Internal Server Error" });
  }
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
  try {
    const userData = await getUserFromToken(req);
    if (!userData || !userData.id) {
      return res
        .status(401)
        .json({ error: "Unauthorized - Invalid token or user not found" });
    }
    res.json(await Booking.find({ user: userData.id }).populate("listing"));
  } catch (err) {
    console.error("Error in /booking endpoint:", err);
    res.status(500).json({ err: "Internal Server Error" });
  }
});

app.get("/booking/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid booking ID" });
    }

    const bookings = await Booking.findById(id).populate("listing");
    if (!bookings) {
      return res.status(404).json({ error: "Booking not found" });
    }
    res.json(bookings);
  } catch (err) {
    console.error("Error in /booking/:id endpoint:", err);
    res.status(500).json({ err: "Internal Server Error" });
  }
});

app.post("/booking", async (req, res) => {
  try {
    const userData = await getUserFromToken(req);
    if (!userData || !userData.id) {
      return res
        .status(401)
        .json({ error: "Unauthorized - Invalid token or user not found" });
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
      return res
        .status(400)
        .json({ error: "Invalid booking data. All fields are required." });
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
  } catch (err) {
    console.error("Error in /booking POST endpoint:", err);
    res.status(500).json({ err: "Internal Server Error" });
  }
});

app.all("*", (req, res, next) => {
  next(new ExpressError(404, "Page not found!"));
});

// app.use((err, req, res, next) => {
//   let { statusCode = 500, message = "Something went wrong!" } = err;
//   res.status(statusCode).render("error.ejs", { message });
// });

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
