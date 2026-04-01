/*
 * Shared Winston logger instance.
 *
 * Console transport: all levels (colorized in development).
 * File transport: warn+ only, plain-text format for statistics.js line parser.
 *
 * Stats event lines (e.g. "[OID:xxx] [BUILD_STARTED]") must be logged at
 * logger.warn(), not logger.info(), because statistics.js:parse_oid() skips
 * lines containing "[info]".
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs-extra');

const Globals = require('./globals.js');
const DATA_ROOT = Globals.app_config().data_root;
const STATS_DIR = path.join(DATA_ROOT, 'statistics');
const LOG_FILE = path.join(STATS_DIR, 'latest.log');

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Plain-text format for the file transport — must match what statistics.js parses
const fileFormat = printf(({ level, message, timestamp: ts }) => {
  return `[${ts}] [${level.toUpperCase()}] ${message}`;
});

// Human-readable format for the console
const consoleFormat = process.env.ENVIRONMENT === 'development'
  ? combine(colorize(), timestamp(), printf(({ level, message, timestamp: ts }) => `[${ts}] ${level}: ${message}`))
  : combine(timestamp(), printf(({ level, message, timestamp: ts }) => `[${ts}] [${level.toUpperCase()}] ${message}`));

// Ensure the statistics directory exists before creating the File transport.
// Falls back to a temp directory if the configured path is not writable
// (e.g. on a development machine where /mnt/data does not exist).
let resolvedLogFile = LOG_FILE;
try {
  fs.mkdirpSync(STATS_DIR);
} catch (e) {
  const os = require('os');
  resolvedLogFile = path.join(os.tmpdir(), 'thinx-latest.log');
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(errors({ stack: true }), timestamp()),
  transports: [
    new winston.transports.Console({
      format: consoleFormat
    }),
    new winston.transports.File({
      filename: resolvedLogFile,
      level: 'warn',
      format: fileFormat
    })
  ]
});

module.exports = logger;
