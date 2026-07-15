import dns from "node:dns";
dns.setServers(["1.1.1.1", "1.0.0.1"]);

import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
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
    
    // 🗃️ কালেকশন সমূহ ডিক্লেয়ারেশন
    const eventsCollection = db.collection("events");
    const subscriptionCollection = db.collection("subscription");
    const userCollection = db.collection("user");
    const bookingsCollection = db.collection("bookings");
    const systemConfigCollection = db.collection("system_config"); 

    // 📁 system_config কালেকশনটি ডাটাবেজে তৈরি ও ডিফল্ট ডাটা পুশ করার ফাংশন
    async function initializeSystemConfig() {
      try {
        const configExists = await systemConfigCollection.findOne({});
        if (!configExists) {
          await systemConfigCollection.insertOne({
            siteName: "EventHive",
            maintenanceMode: false,
            commissionRate: 10,
            contactEmail: "admin@eventhive.com",
            createdAt: new Date()
          });
          console.log("📁 'system_config' collection successfully created in MongoDB with default data!");
        }
      } catch (error) {
        console.error("❌ Error initializing system_config:", error);
      }
    }

    // ডাটাবেজ কানেক্ট হওয়া মাত্রই ইনিশিয়ালাইজেশন রান হবে
    await initializeSystemConfig();

    // ==========================================
    // ১. সাবস্ক্রিপশন করার API
    // ==========================================
    app.post("/subscription", async (req, res) => {
      const { userId, priceId, sessionId } = req.body;

      const isExist = await subscriptionCollection.findOne({ sessionId });
      if (isExist) {
        return res.json({ message: "Already exists" });
      }

      await subscriptionCollection.insertOne({
        sessionId,
        userId,
        priceId
      });

      // ইউজারের প্ল্যান "pro" করা
      await userCollection.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { plan: "pro" } }
      );
      res.json({ message: "Payment Successful" });
    });

    // ==========================================
    // ২. টিকিট বুকিং করার API
    // ==========================================
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
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // ==========================================
    // ৩. নির্দিষ্ট ইউজার টিকিট কেটেছে কিনা চেক করার API
    // ==========================================
    app.get("/api/bookings/check", async (req, res) => {
      const { eventId, userEmail } = req.query;
      const booking = await bookingsCollection.findOne({ eventId, userEmail: userEmail as string });
      if (booking) {
        return res.json({ isBooked: true });
      }
      res.json({ isBooked: false });
    });

    // ==========================================
    // ৪. ইউজারের নিজস্ব বুকিং ডাটা নিয়ে আসার API
    // ==========================================
    app.get("/api/bookings", async (req, res) => {
      try {
        const { userId } = req.query;

        if (!userId) {
          return res.status(400).json({ error: "Missing userId query parameter" });
        }

        const bookings = await bookingsCollection
          .find({ userId: userId as string })
          .sort({ bookedAt: -1 })
          .toArray();

        res.json(bookings);
      } catch (error: any) {
        console.error("Error fetching user bookings:", error);
        res.status(500).json({ error: "Internal Server Error", message: error.message });
      }
    });

    // ==========================================
    // ৫. সমস্ত বুকিং নিয়ে আসার API (অ্যাডমিন প্যানেলের জন্য)
    // ==========================================
    app.get("/api/bookings/all", async (req, res) => {
      try {
        const bookings = await bookingsCollection
          .find({})
          .sort({ bookedAt: 1 }) 
          .toArray();
          
        res.status(200).json(bookings);
      } catch (error) {
        console.error("Error fetching all bookings for admin:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // ==========================================
    // ৬. সমস্ত ইউজার নিয়ে আসার API (অ্যাডমিন প্যানেলের জন্য)
    // ==========================================
    app.get("/api/users", async (req, res) => {
      try {
        const users = await userCollection
          .find({}, { projection: { password: 0 } })
          .toArray();
          
        res.status(200).json(users);
      } catch (error) {
        console.error("Error fetching users for admin:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // ==========================================
    // ৭. সমস্ত ইভেন্ট নিয়ে আসার API
    // ==========================================
    app.get("/events", async (req, res) => {
      const cursor = eventsCollection.find();
      const results = await cursor.toArray();
      res.send(results);
    });

    // ==========================================
    // ৮. নির্দিষ্ট ইভেন্টের ডিটেইলস নিয়ে আসার API
    // ==========================================
    app.get("/events/:eventsId", async (req, res) => {
      try {
        const { eventsId } = req.params;

        if (!eventsId || eventsId.length !== 24) {
          return res.status(400).send({ message: "Invalid ID format" });
        }

        const query = { _id: new ObjectId(eventsId) };
        const result = await eventsCollection.findOne(query);

        if (!result) {
          return res.status(404).send({ message: "Event not found" });
        }

        res.send(result);
      } catch (error: any) {
        console.error("Backend Error Details:", error); 
        res.status(500).send({ message: "Internal Server Error", error: error.message });
      }
    });

    // ==========================================
    // ৯. নতুন ইভেন্ট ক্রিয়েট করার API
    // ==========================================
    app.post("/events", async (req, res) => {
      try {
        const newEvent = req.body;
        const result = await eventsCollection.insertOne(newEvent);
        
        res.status(201).json({ 
          success: true, 
          message: "Event created successfully!", 
          insertedId: result.insertedId 
        });
      } catch (error: any) {
        console.error("Error creating event:", error);
        res.status(500).json({ 
          success: false, 
          message: "Internal Server Error", 
          error: error.message 
        });
      }
    });

    // ==========================================
    // ১০. ইভেন্ট ডিলিট করার API
    // ==========================================
    app.delete("/events/:eventsId", async (req, res) => {
      try {
        const { eventsId } = req.params;

        if (!eventsId || eventsId.length !== 24) {
          return res.status(400).json({ success: false, message: "Invalid ID format" });
        }

        const query = { _id: new ObjectId(eventsId) };
        const result = await eventsCollection.deleteOne(query);

        if (result.deletedCount === 0) {
          return res.status(404).json({ success: false, message: "Event not found" });
        }

        res.status(200).json({ success: true, message: "Event deleted successfully!" });
      } catch (error: any) {
        console.error("Error deleting event:", error);
        res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
      }
    });

    // ==========================================
    // ১১. ইভেন্ট আপডেট করার API
    // ==========================================
    app.put("/events/:eventsId", async (req, res) => {
      try {
        const { eventsId } = req.params;
        const updatedEvent = req.body;

        if (!eventsId || eventsId.length !== 24) {
          return res.status(400).json({ success: false, message: "Invalid ID format" });
        }

        delete updatedEvent._id;

        if (updatedEvent.price) {
          updatedEvent.price = parseFloat(updatedEvent.price);
        }

        const filter = { _id: new ObjectId(eventsId) };
        const updateDoc = {
          $set: updatedEvent,
        };

        const result = await eventsCollection.updateOne(filter, updateDoc);

        if (result.matchedCount === 0) {
          return res.status(404).json({ success: false, message: "Event not found to update" });
        }

        res.status(200).json({ 
          success: true, 
          message: "Event updated successfully!",
          modifiedCount: result.modifiedCount 
        });
      } catch (error: any) {
        console.error("Error updating event:", error);
        res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
      }
    });

    // ==========================================
    // ১২. ইউজার ডিলিট করার API
    // ==========================================
    app.delete("/api/users/:userId", async (req, res) => {
      try {
        const { userId } = req.params;

        if (!userId || userId.length !== 24) {
          return res.status(400).json({ success: false, message: "Invalid ID format" });
        }

        const query = { _id: new ObjectId(userId) };
        const result = await userCollection.deleteOne(query);

        if (result.deletedCount === 0) {
          return res.status(404).json({ success: false, message: "User not found" });
        }

        res.status(200).json({ success: true, message: "User deleted successfully!" });
      } catch (error: any) {
        console.error("Error deleting user:", error);
        res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
      }
    });

    // ==========================================
    // 🚀 ১৩. গ্লোবাল সিস্টেম কনফিগারেশন পাওয়ার API (GET)
    // ==========================================
    app.get("/api/admin/system-config", async (req, res) => {
      try {
        const config = await systemConfigCollection.findOne({});
        if (!config) {
          return res.status(200).send({
            siteName: "EventHive",
            maintenanceMode: false,
            commissionRate: 10,
            contactEmail: "admin@eventhive.com"
          });
        }
        res.status(200).send(config);
      } catch (error: any) {
        console.error("Error reading system config:", error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ==========================================
    // 🚀 ১৪. গ্লোবাল সিস্টেম কনফিগারেশন আপডেট করার API (PUT)
    // ==========================================
    app.put("/api/admin/system-config", async (req, res) => {
      try {
        const updatedConfig = req.body;
        delete updatedConfig._id;

        const result = await systemConfigCollection.updateOne(
          {}, 
          { $set: updatedConfig }, 
          { upsert: true }
        );

        res.status(200).json({ 
          success: true, 
          message: "System configuration updated successfully!" 
        });
      } catch (error: any) {
        console.error("Error saving system config:", error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ==========================================
    // 🚀 ১৫. অ্যাডমিন/ইউজার প্রোফাইল ডাটা পাওয়ার API (GET)
    // ==========================================
    app.get("/api/users/profile", async (req, res) => {
      try {
        const { email } = req.query;
        if (!email) {
          return res.status(400).json({ success: false, message: "Email is required" });
        }

        const user = await userCollection.findOne({ email: email as string });
        if (!user) {
          return res.status(404).json({ success: false, message: "User not found" });
        }

        res.status(200).json(user);
      } catch (error: any) {
        console.error("Error fetching profile:", error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ==========================================
    // 🚀 ১৬. প্রোফাইল আপডেট করার API (PUT)
    // ==========================================
    app.put("/api/users/profile/update", async (req, res) => {
      try {
        const { email, name } = req.body;
        if (!email) {
          return res.status(400).json({ success: false, message: "Email is required" });
        }

        const result = await userCollection.updateOne(
          { email: email },
          { $set: { name: name } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ success: false, message: "User not found to update" });
        }

        res.status(200).json({ success: true, message: "Profile updated successfully!" });
      } catch (error: any) {
        console.error("Error updating profile:", error);
        res.status(500).json({ success: false, error: error.message });
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

// টেস্ট রুট
app.get("/", (req: Request, res: Response) => {
  res.send("EventHive Server is Running. DB Initialized!");
});