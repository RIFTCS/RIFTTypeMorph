import {TSField, TSType} from "../src";
import {validateInstance} from "../src/core/validateInstance";


class Product {
  id = new TSField(TSType.Value) as any;
  name = new TSField(TSType.Value) as any;
  price = new TSField(TSType.Value) as any;
}

const validData = { id: "SKU-123", name: "Widget", price: 9.99 };
const invalidData = { id: "SKU-123", name: "Widget" };

const good = validateInstance(validData, Product);
const bad = validateInstance(invalidData, Product);

console.log("Good:", good);
/*
Good: {
  valid: true,
  instance: Product { id: "SKU-123", name: "Widget", price: 9.99 },
  errors: []
}
*/

console.log("Bad:", bad);
/*
Bad: {
  valid: false,
  instance: null,
  errors: [
    {
      message: "[root] Missing required property: price",
      context: "root"
    }
  ]
}
*/
