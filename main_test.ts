import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { Application } from "oak";
import { router } from "./main.ts";

Deno.test("hello endpoint returns correct message", async () => {
  const app = new Application();
  app.use(router.routes());
  
  const response = await fetch("http://localhost:8000/api/hello");
  const data = await response.json();
  
  assertEquals(data.message, "Hello from Deno!");
});
