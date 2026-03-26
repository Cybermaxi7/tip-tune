import "reflect-metadata";
import { validate } from "./env.validation";

describe("env.validation", () => {
  const validConfig: Record<string, unknown> = {
    DB_HOST: "localhost",
    DB_PORT: "5432",
    DB_USERNAME: "postgres",
    DB_PASSWORD: "password",
    DB_NAME: "tiptune",
  };

  it("should pass with all required vars", () => {
    const result = validate(validConfig);
    expect(result.DB_HOST).toBe("localhost");
    expect(result.DB_PORT).toBe(5432);
    expect(result.DB_USERNAME).toBe("postgres");
    expect(result.DB_PASSWORD).toBe("password");
    expect(result.DB_NAME).toBe("tiptune");
  });

  it("should apply defaults for optional vars", () => {
    const result = validate(validConfig);
    expect(result.PORT).toBe(3001);
    expect(result.NODE_ENV).toBe("development");
    expect(result.REDIS_HOST).toBe("localhost");
    expect(result.REDIS_PORT).toBe(6379);
    expect(result.STELLAR_NETWORK).toBe("testnet");
  });

  it("should fail when DB_HOST is missing", () => {
    const { DB_HOST, ...config } = validConfig;
    expect(() => validate(config)).toThrow("DB_HOST");
  });

  it("should fail when DB_PORT is not a number", () => {
    const config = { ...validConfig, DB_PORT: "not-a-number" };
    expect(() => validate(config)).toThrow("DB_PORT");
  });

  it("should fail when NODE_ENV is invalid", () => {
    const config = { ...validConfig, NODE_ENV: "staging" };
    expect(() => validate(config)).toThrow("NODE_ENV");
  });

  it("should fail when STELLAR_NETWORK is invalid", () => {
    const config = { ...validConfig, STELLAR_NETWORK: "devnet" };
    expect(() => validate(config)).toThrow("STELLAR_NETWORK");
  });

  it("should accept valid optional overrides", () => {
    const config = {
      ...validConfig,
      PORT: "8080",
      NODE_ENV: "production",
      REDIS_HOST: "redis.example.com",
      REDIS_PORT: "6380",
      STELLAR_NETWORK: "mainnet",
      FRONTEND_URL: "https://example.com",
    };
    const result = validate(config);
    expect(result.PORT).toBe(8080);
    expect(result.NODE_ENV).toBe("production");
    expect(result.REDIS_HOST).toBe("redis.example.com");
    expect(result.REDIS_PORT).toBe(6380);
    expect(result.STELLAR_NETWORK).toBe("mainnet");
    expect(result.FRONTEND_URL).toBe("https://example.com");
  });
});
