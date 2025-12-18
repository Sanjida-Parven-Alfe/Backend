const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const admin = require("firebase-admin");
const formatPrivateKey = require('./serviceKeyConverter'); 

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

if (process.env.FIREBASE_PRIVATE_KEY) {
    const serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY),
    };

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

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
        const serviceCollection = client.db("styleDecorDB").collection("services");
        const bookingCollection = client.db("styleDecorDB").collection("bookings");
        const userCollection = client.db("styleDecorDB").collection("users");
        const paymentCollection = client.db("styleDecorDB").collection("payments");

        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        });

        const verifyToken = (req, res, next) => {
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

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }

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

        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        });

        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await userCollection.deleteOne(query);
            res.send(result);
        });

        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (req.decoded.email !== email) {
                return res.send({ admin: false });
            }
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const result = { admin: user?.role === 'admin' };
            res.send(result);
        });

        app.get('/users/decorator/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (req.decoded.email !== email) {
                return res.send({ decorator: false });
            }
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const result = { decorator: user?.role === 'decorator' };
            res.send(result);
        });

        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'decorator'
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result);
        });

        app.get('/services', async (req, res) => {
            const result = await serviceCollection.find().toArray();
            res.send(result);
        });

        app.get('/services/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await serviceCollection.findOne(query);
            res.send(result);
        });

        app.post('/services', verifyToken, verifyAdmin, async (req, res) => {
            const item = req.body;
            const result = await serviceCollection.insertOne(item);
            res.send(result);
        });

        app.delete('/services/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await serviceCollection.deleteOne(query);
            res.send(result);
        });

        app.get('/bookings', verifyToken, async (req, res) => {
            let query = {};
            if (req.query?.email) {
                query = { userEmail: req.query.email }
            }
            const result = await bookingCollection.find(query).toArray();
            res.send(result);
        });

        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            const result = await bookingCollection.insertOne(booking);
            res.send(result);
        });

        app.delete('/bookings/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await bookingCollection.deleteOne(query);
            res.send(result);
        });

        app.patch('/bookings/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const { decoratorName } = req.body;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    status: 'confirmed',
                    decorator: decoratorName
                }
            };
            const result = await bookingCollection.updateOne(filter, updatedDoc);
            res.send(result);
        });

        app.post('/create-payment-intent', verifyToken, async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({ clientSecret: paymentIntent.client_secret });
        });

        app.post('/payments', verifyToken, async (req, res) => {
            const payment = req.body;
            const insertResult = await paymentCollection.insertOne(payment);
            const query = { _id: new ObjectId(payment.bookingId) };
            const updatedDoc = {
                $set: {
                    paymentStatus: 'paid',
                    transactionId: payment.transactionId,
                    status: 'confirmed'
                }
            }
            const updateResult = await bookingCollection.updateOne(query, updatedDoc);
            res.send({ insertResult, updateResult });
        });

        app.get('/payments/:email', verifyToken, async (req, res) => {
            const query = { email: req.params.email };
            if (req.params.email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            const result = await paymentCollection.find(query).toArray();
            res.send(result);
        });

        app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
            const users = await userCollection.estimatedDocumentCount();
            const services = await serviceCollection.estimatedDocumentCount();
            const bookings = await bookingCollection.estimatedDocumentCount();

            const payments = await paymentCollection.find().toArray();
            const revenue = payments.reduce((total, payment) => total + payment.price, 0);

            const serviceStats = await bookingCollection.aggregate([
                {
                    $lookup: {
                        from: 'services',
                        localField: 'serviceId',
                        foreignField: '_id',
                        as: 'serviceData'
                    }
                },
                {
                    $unwind: '$serviceData'
                },
                {
                    $group: {
                        _id: '$serviceData.category',
                        count: { $sum: 1 }
                    }
                },
                {
                    $project: {
                        category: '$_id',
                        count: 1,
                        _id: 0
                    }
                }
            ]).toArray();

            res.send({
                users,
                services,
                bookings,
                revenue,
                serviceStats
            });
        });

        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Style Decor Server is Running')
})

app.listen(port, () => {
    console.log(`Style Decor is sitting on port ${port}`)
})