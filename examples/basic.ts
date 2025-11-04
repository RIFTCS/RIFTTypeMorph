import { createInstance, TSField, TSType } from "../src/core";

class User {
  name = new TSField(TSType.Value) as any;
  email = new TSField(TSType.Value) as any;
  age = new TSField(TSType.Value) as any;
}

const json = {
  name: "Liam",
  email: "liam@riftcs.com",
  age: 29
};

const user = createInstance(json, User);

console.log("User instance:", user);
