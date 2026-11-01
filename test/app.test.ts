import "reflect-metadata";
import { describe, it, expect, vi, afterEach } from "vitest";
import { Backend, AppModule } from "../dist/app";
import { NestFactory } from "@nestjs/core";
import request from "supertest";
import { configure } from "../dist/platform";
describe("reliability API", () => {
  const backends: Backend[] = [];
  afterEach(async () => {
    for (const b of backends.splice(0)) await b.onModuleDestroy();
  });
  function backend() {
    const b = new Backend();
    backends.push(b);
    return b;
  }
  it("rejects unbounded CPU requests", async () => {
    const b = backend();
    await expect(b.work(500001)).rejects.toThrow("iterations");
    await expect(b.work(NaN)).rejects.toThrow("iterations");
  });
  it("reports shared counters and records metrics", async () => {
    const b = backend();
    vi.spyOn(b.redis, "incr").mockResolvedValue(42);
    expect((await b.work(10)).count).toBe(42);
    expect(await b.registry.metrics()).toContain("lab_requests_total 1");
  });
  it("fails readiness when Redis fails", async () => {
    const b = backend();
    vi.spyOn(b.redis, "ping").mockRejectedValue(new Error("offline"));
    await expect(b.ready()).rejects.toThrow("Redis unavailable");
  });
  it("keeps liveness independent of dependencies", async () => {
    const app = await NestFactory.create(AppModule, { logger: false });
    configure(app);
    await app.init();
    try {
      const res = await request(app.getHttpServer())
        .get("/health/live")
        .expect(200);
      expect(res.body.status).toBe("alive");
      expect(res.headers["x-request-id"]).toBeTruthy();
      await request(app.getHttpServer())
        .get("/v1/work?iterations=-1")
        .expect(400);
    } finally {
      await app.close();
    }
  });
});
