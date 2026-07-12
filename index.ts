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

    app.get("/events", async (req, res) => {

      const cursor = eventsCollection.find();
      const results = await cursor.toArray();
      // console.log("Retrieved events:", results);
      res.send(results);
    })

    app.get("/events/:eventsId", async (req, res) => {

      // const eventsId = req.params.eventsId;
      const { eventsId } = req.params;
      const query = {_id: new ObjectId(eventsId)};
      const result = await eventsCollection.findOne(query);

      res.send(result);

    })
  
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