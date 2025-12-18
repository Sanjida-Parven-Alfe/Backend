const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config(); 

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json()); 

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.5scl4km.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Collections 
    const serviceCollection = client.db("styleDecorDB").collection("services");
    const bookingCollection = client.db("styleDecorDB").collection("bookings");
    const userCollection = client.db("styleDecorDB").collection("users");

    // JWT Generation
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    });

    // Verify Token Middleware 
    const verifyToken = (req, res, next) => {
      // console.log('inside verify token', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' });
        }
        req.decoded = decoded;
        next();
      })
    }

    // SERVICES 

    // 1. Get All Services (with Search & Filter options needed later)
    app.get('/services', async (req, res) => {
        const result = await serviceCollection.find().toArray();
        res.send(result);
    });

    // 2. Get Single Service Details
    app.get('/services/:id', async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await serviceCollection.findOne(query);
        res.send(result);
    });

    // 3. Add New Service (Admin Only - Verify Token later)
    app.post('/services', async (req, res) => {
        const item = req.body;
        const result = await serviceCollection.insertOne(item);
        res.send(result);
    });

    // USERS 

    // 1. Save User to DB (Google Login / Register)
    app.post('/users', async (req, res) => {
        const user = req.body;
        const query = { email: user.email };
        const existingUser = await userCollection.findOne(query);
        if (existingUser) {
            return res.send({ message: 'user already exists', insertedId: null });
        }
        const result = await userCollection.insertOne(user);
        res.send(result);
    });

    // 2. Get All Users (Admin Dashboard)
    app.get('/users', async(req, res) =>{
        const result = await userCollection.find().toArray();
        res.send(result);
    });

    // 3. Make Admin/Decorator (Update Role)
    app.patch('/users/admin/:id', async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
            $set: {
                role: 'decorator' // or 'admin' based on logic
            }
        }
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
    });

    // BOOKINGS 

    // 1. Post a Booking
    app.post('/bookings', async (req, res) => {
        const booking = req.body;
        const result = await bookingCollection.insertOne(booking);
        res.send(result);
    });

    // 2. Get User Specific Bookings
    app.get('/bookings', async (req, res) => {
        let query = {};
        if (req.query?.email) {
            query = { userEmail: req.query.email }
        }
        const result = await bookingCollection.find(query).toArray();
        res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Style Decor Server is Running')
})

app.listen(port, () => {
  console.log(`Style Decor is sitting on port ${port}`)
})