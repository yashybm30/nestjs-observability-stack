import "reflect-metadata";
import { it, expect } from "vitest";
import { Backend } from "../dist/app";
it("shares a counter across replicas using actual Redis", async () => {
  const a = new Backend(),
    b = new Backend();
  try {
    expect((await a.ready()).status).toBe("ready");
    const first = await a.work(10),
      second = await b.work(10);
    expect(second.count).toBe(first.count + 1);
  } finally {
    await a.onModuleDestroy();
    await b.onModuleDestroy();
  }
});
