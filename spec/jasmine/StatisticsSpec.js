describe("Statistics", function() {

  var s = require('../../lib/thinx/statistics');

  it("should be able to initialize", function() {
    expect(s).toBeDefined();
  });

  it("should be able to store results", function() {
    s.write_stats(false, s.todayPathElement() + ".json", s
      .todayPathElement(), {});
  });

  it("should be able to return today results for owner", function(done) {
    var result = s.today(
      "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f",
      function(result) {
        console.log(result);
        expect(result).toBeDefined();
        done();
      });
  }, 10000);

  it("should be able to aggregate statistics", function(done) {
    var result = s.aggregate();
    expect(result).toBe(true);
    done();
  }, 10000);

  it("should be able to parse statistics per owner", function() {
    s.parse(
      "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f",
      function(err, body) {
        console.log(err, body);
        expect(body).toBe(true);
      });
  });

  it("should return today path element", function() {
    var s = require('../../lib/thinx/statistics');
    var result = s.todayPathElement();
    console.log(result);
    expect(result).toBeDefined();
  });

});
