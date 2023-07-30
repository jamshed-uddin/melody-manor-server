const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
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
    app.get("/users/:email", async (req, res) => {
      const userEmail = req.params.email;
      const query = { email: userEmail };
      const singleUser = await userCollection.findOne(query);
      console.log(singleUser);
      res.send(singleUser);
    });

    // change role route
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

    // add new class
    app.post("/addNewClass", async (req, res) => {
      const newClass = req.body;
      const result = await classCollection.insertOne(newClass);
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
    app.patch("/selectedClasses/:userEmail", async (req, res) => {
      const email = req.params.userEmail;
      const bookmarkedClassId = req.body;
      const selectedClassesByUser = [];
      const filter = { email: email };
      const options = { upsert: true };
      //To check if the selected class id already exists
      const user = await userCollection.findOne(filter);
      if (user.selectedClasses) {
        if (user.selectedClasses.includes(bookmarkedClassId.classId)) {
          return res.send({ message: "This class already selected" });
        } else {
          const result = await userCollection.updateOne(
            filter,
            {
              $push: { selectedClasses: bookmarkedClassId.classId },
            },
            options
          );

          return res.send(result);
        }
      } else {
        selectedClassesByUser.push(bookmarkedClassId.classId);
        const addSelectedClass = {
          $set: {
            selectedClasses: selectedClassesByUser,
          },
        };
        const result = await userCollection.updateOne(
          filter,
          addSelectedClass,
          options
        );
        return res.send(result);
      }
    });

    // get selected classes API
    app.get("/getSelectedClasses/:userEmail", async (req, res) => {
      const userEmail = req.params.userEmail;
      const allClasses = await classCollection.find().toArray();
      const user = await userCollection.findOne({ email: userEmail });
      const selectedClassesIds = user?.selectedClasses;
      const selectedClasses = allClasses.filter((singleClass) =>
        selectedClassesIds.includes(singleClass._id.toString())
      );
      res.send(selectedClasses);
    });
    // remove class from selected class list
    app.patch("/removeClass/:userEmail", async (req, res) => {
      const userEmail = req.params.userEmail;
      const classId = req.body.classId;
      const options = { upsert: true };
      const user = await userCollection.findOne({ email: userEmail });

      const selectedClassesIds = user?.selectedClasses;
      console.log(selectedClassesIds);
      const existingClassesIds = selectedClassesIds.filter(
        (id) => id !== classId
      );
      console.log(existingClassesIds);
      const result = await userCollection.updateOne(
        { email: userEmail },
        { $set: { selectedClasses: existingClassesIds } },
        options
      );
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
