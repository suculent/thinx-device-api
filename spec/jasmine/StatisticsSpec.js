describe("Statistics", function() {

  var s = require('../../lib/thinx/statistics');

  beforeEach(function() {
    //stats = new Statistics();
  });

  xit("should be able to return today results for owner", function() {
    var result = s.today(
      "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f",
      function(result) {
        console.log(result);
        expect(result).toBeDefined();
      });
  });

  xit("should be able to aggregate statistics", function() {
    var result = s.aggregate();
    expect(true).toBe(true);
  });

});
