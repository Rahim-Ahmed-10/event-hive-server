import dns from "node:dns";
dns.setServers(["1.1.1.1", "1.0.0.1"]);

import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { MongoClient, ServerApiVersion, Collection, Db, ObjectId } from "mongodb";
import cors from "cors";

dotenv.config();

const app = express();


app.use(cors());
app.use(express.json()); 

const port = process.env.PORT || 8085;
const uri = process.env.MONGO_DB_URI;

if (!uri) {
  console.error("❌ Error: MONGO_DB_URI is not defined in .env file");
  process.exit(1);
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    const db = client.db("event-hive_db");
    const eventsCollection = db.collection("events");
    const subscriptionCollection= db.collection("subscription");
    const userCollection = db.collection("user");
    const bookingsCollection = db.collection("bookings");


    app.post("/subscription", async (req, res) => {
      const {userId, priceId, sessionId} = req.body;

      const isExist=await subscriptionCollection.findOne({sessionId})
      if(isExist){
        return res.json({massage:"Already isExist"})
      }

       await subscriptionCollection.insertOne({
        sessionId,
        userId,
        priceId
      });
      // update user role

      await userCollection.updateOne(
        {_id:new ObjectId(userId)},
        {$set: {plan:"pro"}}
      );
      res.json({massage:"payment Success Full"})
    });


    // ১. টিকিট বুকিং করার API
app.post("/api/bookings", async (req, res) => {
  try {
    const { eventId, eventTitle, userId, userEmail, userName, ticketCount, totalPrice } = req.body;

    if (!eventId || !userEmail) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const newBooking = {
      eventId,
      eventTitle,
      userId,
      userEmail,
      userName,
      ticketCount: parseInt(ticketCount),
      totalPrice: parseFloat(totalPrice),
      bookedAt: new Date()
    };

    await bookingsCollection.insertOne(newBooking);
    res.status(201).json({ success: true, message: "Ticket booked successfully!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ২. কোনো নির্দিষ্ট ইউজার এই ইভেন্টের টিকিট কেটেছে কিনা তা চেক করার API
app.get("/api/bookings/check", async (req, res) => {
  const { eventId, userEmail } = req.query;
  const booking = await bookingsCollection.findOne({ eventId, userEmail });
  if (booking) {
    return res.json({ isBooked: true });
  }
  res.json({ isBooked: false });
});

// ৩. কোনো নির্দিষ্ট ইউজারের করা সমস্ত বুকিং ডাটা নিয়ে আসার API
app.get("/api/bookings", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId query parameter" });
    }

    // ডাটাবেজ থেকে ওই নির্দিষ্ট userId-এর সব বুকিং খোঁজা হচ্ছে
    // বুকিংগুলোকে নতুন থেকে পুরাতন হিসেবে দেখানোর জন্য bookedAt অনুযায়ী সর্ট (-1) করা হয়েছে
    const bookings = await bookingsCollection
      .find({ userId: userId })
      .sort({ bookedAt: -1 })
      .toArray();

    res.json(bookings);
  } catch (error) {
    console.error("Error fetching user bookings:", error);
    res.status(500).json({ error: "Internal Server Error", message: error.message });
  }
});

    app.get("/events", async (req, res) => {

      const cursor = eventsCollection.find();
      const results = await cursor.toArray();
      // console.log("Retrieved events:", results);
      res.send(results);
    })

    // আপনার এক্সপ্রেস অ্যাপের ফাইলটিতে এটি আপডেট করুন
app.get("/events/:eventsId", async (req, res) => {
    try {
        const { eventsId } = req.params;

        // ১. আইডিটি মঙ্গোডিবির ObjectId ফরম্যাটের সাথে মিলছে কিনা চেক (২৪ ক্যারেক্টার)
        if (!eventsId || eventsId.length !== 24) {
            return res.status(400).send({ message: "Invalid ID format" });
        }

        // ২. কুয়েরি তৈরি এবং ডাটা খোঁজা
        const query = { _id: new ObjectId(eventsId) };
        const result = await eventsCollection.findOne(query);

        // ৩. ডাটা না পাওয়া গেলে ৪MD৪ পাঠানো
        if (!result) {
            return res.status(404).send({ message: "Event not found" });
        }

        // ৪. সফল হলে ডাটা পাঠানো
        res.send(result);
        
    } catch (error) {
        // ব্যাকএন্ড টার্মিনালে আসল সমস্যাটি দেখতে এটি সাহায্য করবে
        console.error("Backend Error Details:", error); 
        res.status(500).send({ message: "Internal Server Error", error: error.message });
    }
});
  
    console.log("⚡️ [database]: Pinged your deployment. You successfully connected to MongoDB!");
    
    app.listen(port, () => {
      console.log(`⚡️ [server]: Server is running at http://localhost:${port}`);
    });

  } catch (error) {
    console.error("❌ Database connection error:", error);
  }
}

run().catch(console.dir);

// 🏠 টেস্ট রুট
app.get("/", (req: Request, res: Response) => {
  res.send("Medicare Connect Server is Running. DB Initialized!");
});