import {
  type DestinationStream,
  type LevelWithSilent,
  type Logger,
  pino,
  stdTimeFunctions,
} from "pino";

export type { Logger };

export const LOG_LEVELS = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const satisfies readonly LevelWithSilent[];

// Nothing logs these on purpose. Redaction is the safety net for the day one slips in.
const SECRET_KEYS = ["authorization", "cookie", "token", "password", "secret"];

export function createLogger(level: LevelWithSilent, destination?: DestinationStream): Logger {
  return pino(
    {
      level,
      timestamp: stdTimeFunctions.isoTime,
      // Log platforms read level names; pino writes numbers by default.
      formatters: { level: (label) => ({ level: label }) },
      redact: {
        paths: SECRET_KEYS.flatMap((key) => [key, `*.${key}`]),
        censor: "[redacted]",
      },
    },
    destination,
  );
}
