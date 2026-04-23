import { plainToInstance } from "class-transformer";
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  validateSync,
} from "class-validator";

enum Environment {
  Development = "development",
  Production = "production",
  Test = "test",
}

enum StellarNetwork {
  Testnet = "testnet",
  Mainnet = "mainnet",
  Futurenet = "futurenet",
}

class EnvironmentVariables {
  @IsString()
  DB_HOST: string;

  @IsNumber()
  DB_PORT: number;

  @IsString()
  DB_USERNAME: string;

  @IsString()
  DB_PASSWORD: string;

  @IsString()
  DB_NAME: string;

  @IsOptional()
  @IsNumber()
  PORT: number = 3001;

  @IsOptional()
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsOptional()
  @IsString()
  REDIS_HOST: string = "localhost";

  @IsOptional()
  @IsNumber()
  REDIS_PORT: number = 6379;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  @IsOptional()
  @IsNumber()
  REDIS_DB?: number;

  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  @IsOptional()
  @IsEnum(StellarNetwork)
  STELLAR_NETWORK: StellarNetwork = StellarNetwork.Testnet;

  @IsOptional()
  @IsString()
  STELLAR_HORIZON_URL?: string;

  @IsOptional()
  @IsString()
  APP_VERSION?: string;

  @IsOptional()
  @IsString()
  FRONTEND_URL?: string;

  @IsOptional()
  @IsString()
  API_VERSION?: string;
}

export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors.map((err) => {
      const constraints = Object.values(err.constraints || {}).join(", ");
      return `  ${err.property}: ${constraints}`;
    });
    throw new Error(
      `Configuration validation failed:\n${messages.join("\n")}`,
    );
  }

  return validatedConfig;
}
