import { TSType } from "../src";
import { createInstance } from "../src";
import { Field } from "../src/decorators/schemaDecorator";

class Address {
  @Field(TSType.Value)
  street!: string;

  @Field(TSType.Value)
  city!: string;
}

class User {
  @Field(TSType.Value)
  name!: string;

  @Field(TSType.Value)
  email!: string;

  @Field(TSType.Object, Address)
  address!: Address;
}

const input = {
  name: "Liam",
  email: "liam@riftcs.com",
  address: { street: "100 Rift Lane", city: "Sydney" }
};

const instance = createInstance(input, User);
console.log("Decorator-based instance:", instance);
