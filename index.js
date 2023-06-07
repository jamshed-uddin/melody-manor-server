const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 3000;

//middleware
app.use(cors());

app.use(express.json());

app.get("/", (req, res) => {
  res.send("melody manor server is running.");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
