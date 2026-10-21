const mongoose = require("mongoose");

let connectionPromise;

module.exports = async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not set");

  if (mongoose.connection.readyState === 1) return mongoose;
  if (mongoose.connection.readyState === 2) return mongoose.connection.asPromise();
  if (mongoose.connection.readyState === 0) connectionPromise = null;

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(uri)
      .then(() => {
        console.log("MongoDB connected");
        return mongoose;
      })
      .catch((error) => {
        connectionPromise = null;
        throw error;
      });
  }

  return connectionPromise;
};
