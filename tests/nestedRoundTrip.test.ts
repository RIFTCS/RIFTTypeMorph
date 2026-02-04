import { describe, it, expect } from "vitest";
import { createInstance } from "../src";
import { TSType } from "../src";
import { TSField } from "../src";

/**
 * Test classes used to verify deep JSON → instance → JSON equivalence
 */

class Comment {
  id = new TSField(TSType.Value) as any;
  text = new TSField(TSType.Value) as any;
}

class Post {
  id = new TSField(TSType.Value) as any;
  title = new TSField(TSType.Value) as any;
  comments = new TSField(TSType.Array, Comment) as any;
}

class User {
  id = new TSField(TSType.Value) as any;
  name = new TSField(TSType.Value) as any;
  posts = new TSField(TSType.Array, Post) as any;
}

class Blog {
  name = new TSField(TSType.Value) as any;
  owner = new TSField(TSType.Object, User) as any;
}

/**
 * Round-trip JSON verification
 */
describe("createInstance - deep nested round-trip JSON test", () => {
  it("should recreate identical structure after serialization", () => {
    const original = {
      name: "Rift Dev Blog",
      owner: {
        id: "user-1",
        name: "Liam",
        posts: [
          {
            id: "post-1",
            title: "Welcome to rifttypemorph",
            comments: [
              { id: "c1", text: "Fantastic work!" },
              { id: "c2", text: "Excited to try this!" }
            ]
          },
          {
            id: "post-2",
            title: "Deep Type Reflection",
            comments: []
          }
        ]
      }
    };

    // Step 1: Create a typed instance
    const blog = createInstance(original, Blog);

    // Step 2: Verify types
    expect(blog).toBeInstanceOf(Blog);
    expect(blog.owner).toBeInstanceOf(User);
    expect(blog.owner.posts[0]).toBeInstanceOf(Post);
    expect(blog.owner.posts[0].comments[0]).toBeInstanceOf(Comment);

    // Step 3: Serialize back to JSON
    const serialized = JSON.parse(JSON.stringify(blog));

    // Step 4: Compare
    expect(serialized).toStrictEqual(original);
  });
});
