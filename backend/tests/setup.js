const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongod;
module.exports = {
  async setup() {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);
  },
  async teardown() {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  },
};
