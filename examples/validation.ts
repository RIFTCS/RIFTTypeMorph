import {TSField, TSType} from "../src/core";
import {validateInstance} from "../src/core/validateInstance";

class Product {
  id = new TSField(TSType.Value) as any;
  name = new TSField(TSType.Value) as any;
  price = new TSField(TSType.Value) as any;
}

const invalid = {
  id: "P1",
  // missing name, price
};

const result = validateInstance(invalid, Product);

console.log(result);
/*
{
  valid: false,
  instance: Product { id: "P1", name: null, price: null },
  errors: [
    { message: "[root] Missing required property: name", context: "root" },
    { message: "[root] Missing required property: price", context: "root" }
  ]
}
*/
