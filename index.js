const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();

const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const port = process.env.PORT || 3000;

//middleware
app.use(cors());
app.use(express.json());

// database
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.phenf1e.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const userCollection = client.db("melodyManorDB").collection("users");
    const classCollection = client.db("melodyManorDB").collection("classes");
    const paymentCollection = client
      .db("melodyManorDB")
      .collection("paymentHistory");
    const selectedClassCollection = client
      .db("melodyManorDB")
      .collection("selectedClass");

    //users APIs

    app.get("/users", async (req, res) => {
      const cursor = userCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/instructors", async (req, res) => {
      const query = { role: "instructor" };
      const cursor = userCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    // add a new user
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user exists" });
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // single user
    app.get("/singleUser/:email", async (req, res) => {
      const userEmail = req.params.email;
      console.log(userEmail);
      if (!userEmail) return;
      const query = { email: userEmail };
      const singleUser = await userCollection.findOne(query);
      res.send(singleUser);
    });
    // change role by admin
    app.patch("/changeRole/:id", async (req, res) => {
      const id = req.params.id;
      const newRole = req.body;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const changedRole = {
        $set: {
          role: newRole.role,
        },
      };

      const result = await userCollection.updateOne(
        filter,
        changedRole,
        options
      );
      res.send(result);
    });

    //classes APIs-----------------------------

    //aproved classes
    app.get("/classes", async (req, res) => {
      const query = { status: "approved" };
      const cursor = classCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    //all classes
    app.get("/all-classes", async (req, res) => {
      const cursor = classCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // single class----------
    app.get("/singleClass/:classId", async (req, res) => {
      const classId = req.params.classId;
      const query = {
        _id: new ObjectId(classId),
      };
      const result = await classCollection.findOne(query);
      res.send(result);
    });

    // add new class by instructor
    app.post("/addNewClass", async (req, res) => {
      const newClass = req.body;
      const result = await classCollection.insertOne(newClass);
      res.send(result);
    });
    // delete a class by instructor
    app.delete("/deleteClass/:classId", async (req, res) => {
      const classId = req.params.classId;
      const result = await classCollection.deleteOne({
        _id: new ObjectId(classId),
      });
      res.send(result);
    });

    // Instructor specific classes
    app.get("/instructorsClasses/:instructorEmail", async (req, res) => {
      const instructorEmail = req.params.instructorEmail;
      const result = await classCollection
        .find({
          instructor_email: instructorEmail,
        })
        .toArray();
      res.send(result);
    });

    //update class status(pending/approved/denied) by admin
    app.patch("/updateStatus/:classId", async (req, res) => {
      const id = req.params.classId;
      const updatedData = req.body;

      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updatedStatusAndFeedback = {
        $set: {
          status: updatedData.status,
          feedback: updatedData.feedback,
        },
      };
      const result = await classCollection.updateOne(
        filter,
        updatedStatusAndFeedback,
        options
      );
      res.send(result);
    });

    // update class info by instructors
    app.patch("/updateClassInfo/:classId", async (req, res) => {
      const classId = req.params.classId;
      const updates = req.body;
      const infoToUpdate = {
        $set: {
          price: updates.price,
          available_seat: updates.available_seat,
          description: updates.description,
        },
      };

      const result = await classCollection.updateOne(
        { _id: new ObjectId(classId) },
        infoToUpdate,
        { upsert: true }
      );

      res.send(result);
    });

    // add to selected classes API
    app.post("/addToSelected", async (req, res) => {
      const selectedClassItem = req.body;
      const query = { classId: selectedClassItem.classId };
      const existingSelectedClass = await selectedClassCollection.findOne(
        query
      );
      if (existingSelectedClass) {
        return res.send({ message: "You have already added this class." });
      }
      const result = await selectedClassCollection.insertOne(selectedClassItem);
      res.send(result);
    });

    // get selected classes API (by students)
    app.get("/getSelectedClasses/:userEmail", async (req, res) => {
      const userEmail = req.params.userEmail;
      const selectedClasses = await selectedClassCollection
        .find({
          userEmail: userEmail,
        })
        .toArray();
      res.send(selectedClasses);
    });
    // remove class from selected class list (by students)
    app.delete("/removeSelectedClass/:classId", async (req, res) => {
      const removingClassId = req.params.classId;
      console.log(removingClassId);
      const query = { classId: removingClassId };
      const result = await selectedClassCollection.deleteOne(query);
      res.send(result);
    });

    // create payment intent-------------------
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // save payment history api
    app.post("/paymentHistory", async (req, res) => {
      const paymentInfo = req.body;
      const result = await paymentCollection.insertOne(paymentInfo);
      res.send(result);
    });

    //-------------------
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("melody manor server is running.");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
