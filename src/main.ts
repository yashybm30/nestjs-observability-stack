import "./telemetry";
import "reflect-metadata";
import express from "express";
import { NestFactory } from "@nestjs/core";
import { Request, Response, NextFunction } from "express";
import { Backend } from "./app";
import { AppModule } from "./app";
import { configure, port } from "./platform";
async function main() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(express.json({ limit: "32kb" }));
  configure(app);
  const metrics = app.get(Backend);
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.on("finish", () =>
      metrics.httpRequests.inc({
        method: req.method,
        status: String(res.statusCode),
      }),
    );
    next();
  });
  await app.listen(port(), "0.0.0.0");
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
