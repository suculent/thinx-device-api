const logger = require('../../lib/thinx/logger');

describe("Logger", function () {

  it("(01) should export a logger object", function () {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it("(02) should not throw when logging at each level", function () {
    expect(() => logger.info("test info")).not.toThrow();
    expect(() => logger.warn("test warn")).not.toThrow();
    expect(() => logger.error("test error")).not.toThrow();
  });

  it("(03) should have at least two transports (console + file)", function () {
    expect(logger.transports.length).toBeGreaterThanOrEqual(2);
  });

});
