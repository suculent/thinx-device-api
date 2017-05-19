describe("Statistics", function() {

  it("should be able to initialize", function() {
    var s = require('../../lib/thinx/statistics');
    expect(s).toBeDefined();
  });

  it("should be able to return today results for owner", function() {
      var s = require('../../lib/thinx/statistics');
      var result = s.today(
        "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f",
        function(result, function() {
          console.log(result);
          expect(result).toBeDefined();
        });
      });
  });

it("should be able to aggregate statistics", function() {
  var s = require('../../lib/thinx/statistics');
  var result = s.aggregate();
  expect(result).toBe(true);
});

it("should return today path element", function() {
  var s = require('../../lib/thinx/statistics');
  var result = s.todayPathElement();
  console.log(result);
  expect(result).toBeDefined();
});

});
