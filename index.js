const express = require("express");
const app = express();
const cors = require("cors");
var jwt = require("jsonwebtoken");
require("dotenv").config();

const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const port = process.env.PORT || 3000;

//middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }

  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(403)
        .send({ error: true, message: "unauthorized access" });
    }

    req.decoded = decoded;
    next();
  });
};

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
    // await client.connect();

    const userCollection = client.db("melodyManorDB").collection("users");
    const classCollection = client.db("melodyManorDB").collection("classes");
    const eventParticipentsCollection = client
      .db("melodyManorDB")
      .collection("eventParticipents");
    const paymentCollection = client
      .db("melodyManorDB")
      .collection("paymentHistory");
    const selectedClassCollection = client
      .db("melodyManorDB")
      .collection("selectedClass");

    // jwt token generator----------

    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "10d",
      });

      res.send({ token });
    });

    const verifyAdmin = async (req, res, next) => {
      const adminEmail = req.decoded.email;
      const query = { email: adminEmail };
      const user = await userCollection.findOne(query);

      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(401).json({ error: "Unauthorized action for user" });
      }
      next();
    };

    //users APIs---------------

    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get("/popularInstructors", async (req, res) => {
      const query = { role: "instructor" };
      const result = await userCollection.find(query).toArray();

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
    app.get("/singleUser/:email", verifyJWT, async (req, res) => {
      const userEmail = req.params.email;
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

    // event apis---------
    app.post("/eventSignup", async (req, res) => {
      const eventParticipentData = req.body;
      const result = await eventParticipentsCollection.insertOne(
        eventParticipentData
      );

      const savedEventParticipent = await eventParticipentsCollection.findOne({
        _id: new ObjectId(result.insertedId),
      });
      res.send(savedEventParticipent);
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
      const objectId = new ObjectId(classId);
      const result = await classCollection.findOne({
        _id: new ObjectId(classId),
      });

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
          instructorEmail: instructorEmail,
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
    app.put("/updateClassInfo/:classId", async (req, res) => {
      const classId = req.params.classId;
      const { _id, ...updatedClass } = req.body;
      console.log(updatedClass);

      const result = await classCollection.replaceOne(
        { _id: new ObjectId(classId) },
        updatedClass,
        { upsert: true }
      );

      res.send(result);
    });

    // selected classes
    // add to selected classes API
    app.post("/addToSelected", async (req, res) => {
      const selectedClassItem = req.body;
      const query = { userEmail: selectedClassItem.userEmail };
      const userSpecificClasses = await selectedClassCollection
        .find(query)
        .toArray();
      const userSpecificEnrolledClasses = await paymentCollection
        .find(query)
        .toArray();
      const existingClass = userSpecificClasses.find(
        (singleClass) => singleClass.classId === selectedClassItem.classId
      );
      const existInEnrolledClass = userSpecificEnrolledClasses.find(
        (singleClass) => singleClass.classId === selectedClassItem.classId
      );

      if (existInEnrolledClass) {
        return res.send({ message: "already enrolled" });
      }
      if (existingClass) {
        return res.send({ message: "already added" });
      }
      const result = await selectedClassCollection.insertOne(selectedClassItem);
      res.send(result);
    });

    // get selected classes API (by students)
    app.get("/getSelectedClasses/:userEmail", verifyJWT, async (req, res) => {
      const userEmail = req.params.userEmail;
      const selectedClasses = await selectedClassCollection
        .find({
          userEmail: userEmail,
        })
        .toArray();
      res.send(selectedClasses);
    });

    // get single selected claass
    app.get("/getSingleSelectedClass/:selectedClassId", async (req, res) => {
      const id = req.params.selectedClassId;
      const singleSelectedClass = await selectedClassCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(singleSelectedClass);
    });

    // remove class from selected class list (by students)
    app.delete("/removeSelectedClass/:classId", async (req, res) => {
      const removingClassId = req.params.classId;
      const query = { _id: new ObjectId(removingClassId) };
      const result = await selectedClassCollection.deleteOne(query);
      res.send(result);
    });

    // update available seat and enrolled students after a student pays for a class
    app.patch("/updateSeatAndAvailableClass/:classId", async (req, res) => {
      const updatingClassId = req.params.classId;
      const currentInfo = await classCollection.findOne({
        _id: new ObjectId(updatingClassId),
      });
      if (currentInfo.available_seat === 0) {
        return res.send({ message: "No seat available for this class" });
      }
      const infoToUpdate = {
        $set: {
          available_seat: currentInfo.available_seat - 1,
          enrolled: currentInfo.enrolled + 1,
        },
      };

      const result = await classCollection.updateOne(
        { _id: new ObjectId(updatingClassId) },
        infoToUpdate,
        { upsert: true }
      );
      res.send(result);
    });

    // enrolled classes
    app.get("/enrolledClasses/:userEmail", async (req, res) => {
      const email = req.params.userEmail;
      const allClasses = await classCollection.find().toArray();
      const paymentsByUser = await paymentCollection
        .find({ userEmail: email })
        .toArray();
      const paidClassesId = paymentsByUser.map((item) => item.classId);

      const enrolledClass = allClasses.filter((singleClass) =>
        paidClassesId.includes(singleClass._id.toString())
      );

      res.send(enrolledClass);
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

    // save payment history
    app.post("/paymentHistory", async (req, res) => {
      try {
        const paymentInfo = req.body;
        const { classId, userEmail } = paymentInfo;
        const existsInSelectedClass = await selectedClassCollection.findOne({
          classId,
          userEmail,
        });

        if (existsInSelectedClass) {
          await selectedClassCollection.deleteOne({ userEmail, classId });
        }

        const enrolledClass = await classCollection.findOne({
          _id: new ObjectId(classId),
        });

        if (enrolledClass) {
          const infoToUpdate = {
            $set: {
              availableSeats: enrolledClass.available_seat - 1,
              enrolled: enrolledClass.enrolled + 1,
            },
          };
          await classCollection.updateOne(
            { _id: new ObjectId(classId) },
            infoToUpdate,
            { upsert: true }
          );
        }

        const result = await paymentCollection.insertOne(paymentInfo);
        res.send(result);
      } catch (error) {
        res.status(400).send({ error: error, message: "Something went wrong" });
      }
    });
    // get payment history
    app.get("/getPaymentHistory/:userEmail", verifyJWT, async (req, res) => {
      const email = req.params.userEmail;
      const result = await paymentCollection
        .find({ userEmail: email })
        .toArray();
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
