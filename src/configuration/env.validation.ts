import { plainToInstance, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUrl, Min, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: string = 'development';

  @IsInt()
  @Min(1)
  @Type(() => Number)
  PORT: number = 3000;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_URL!: string;

  @IsString()
  RABBITMQ_URL!: string;

  @IsString()
  JWT_ACCESS_SECRET!: string;

  @IsString()
  JWT_REFRESH_SECRET!: string;

  @IsInt()
  @Min(60)
  @Type(() => Number)
  JWT_ACCESS_TTL_SECONDS: number = 900;

  @IsInt()
  @Min(300)
  @Type(() => Number)
  JWT_REFRESH_TTL_SECONDS: number = 2_592_000;

  @IsOptional()
  @IsUrl({ require_tld: false })
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;

  @IsOptional()
  @IsString()
  SENTRY_DSN?: string;

  @IsOptional()
  @IsIn(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
  LOG_LEVEL?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  SKIP_EXTERNAL_CONNECTIONS?: string;
}

const secretNames = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const;

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  for (const name of secretNames) {
    const value = validated[name];
    if (typeof value === 'string' && value.length < 32) {
      errors.push({
        property: name,
        constraints: { minLength: `${name} must contain at least 32 characters` },
      } as never);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed: ${JSON.stringify(errors)}`);
  }
  return validated;
}
