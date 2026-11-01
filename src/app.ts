import {
  Controller,
  Get,
  Injectable,
  Module,
  OnModuleDestroy,
  ServiceUnavailableException,
  Query,
  BadRequestException,
} from "@nestjs/common";
import Redis from "ioredis";
import { hostname } from "node:os";
import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Histogram,
} from "prom-client";
import { Header } from "@nestjs/common";

@Injectable()
export class Backend implements OnModuleDestroy {
  readonly redis = new Redis(
    process.env.REDIS_URL ?? "redis://localhost:6379",
    {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      retryStrategy: () => null,
    },
  );
  readonly registry = new Registry();
  readonly httpRequests = new Counter({
    name: "http_requests_total",
    help: "HTTP requests",
    labelNames: ["method", "status"],
    registers: [this.registry],
  });
  readonly requests = new Counter({
    name: "lab_requests_total",
    help: "Completed work requests",
    registers: [this.registry],
  });
  readonly latency = new Histogram({
    name: "lab_work_duration_seconds",
    help: "Work latency",
    registers: [this.registry],
    buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1],
  });
  constructor() {
    collectDefaultMetrics({ register: this.registry });
    this.redis.on("error", () => undefined);
  }
  async ready() {
    try {
      await this.redis.ping();
      return { status: "ready", redis: "up" };
    } catch {
      throw new ServiceUnavailableException("Redis unavailable");
    }
  }
  async work(iterations: number) {
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > 500000)
      throw new BadRequestException(
        "iterations must be an integer between 1 and 500000",
      );
    const stop = this.latency.startTimer();
    let checksum = 0;
    for (let i = 0; i < iterations; i++)
      checksum = (checksum + Math.sqrt(i)) % 1000000;
    try {
      const count = await this.redis.incr("lab:requests");
      this.requests.inc();
      return { instance: hostname(), count, checksum };
    } catch {
      throw new ServiceUnavailableException("Redis unavailable");
    } finally {
      stop();
    }
  }
  async onModuleDestroy() {
    this.redis.disconnect();
    this.registry.clear();
  }
}
@Controller()
export class Api {
  constructor(private readonly backend: Backend) {}
  @Get("health/live") live() {
    return { status: "alive", instance: hostname() };
  }
  @Get("health/ready") ready() {
    return this.backend.ready();
  }
  @Get("v1/work") work(@Query("iterations") iterations?: string) {
    return this.backend.work(
      iterations === undefined ? 100000 : Number(iterations),
    );
  }
  @Get("metrics")
  @Header("Content-Type", "text/plain; version=0.0.4")
  metrics() {
    return this.backend.registry.metrics();
  }
}
@Module({ controllers: [Api], providers: [Backend] })
export class AppModule {}
