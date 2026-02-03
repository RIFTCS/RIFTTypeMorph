import { createInstance, TSField, TSType } from "../src";

class Entry {
  id = new TSField(TSType.Value) as any;
  value = new TSField(TSType.Value) as any;
}

class Form {
  id = new TSField(TSType.Value) as any;
  name = new TSField(TSType.Value) as any;
  entries = new TSField(TSType.Array, (obj: any) => new Entry()) as any;
}

const data = {
  id: 1,
  name: "Customer Survey",
  entries: [
    { id: "q1", value: "Yes" },
    { id: "q2", value: "No" }
  ]
};

const form = createInstance(data, Form);
console.log("Form instance:", form);
