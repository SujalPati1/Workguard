const jwt = require("jsonwebtoken");

const token = jwt.sign(
  { id: "65f123456789123456789123" },
  "mysecretkey",
  { expiresIn: "1d" }
);

console.log(token);