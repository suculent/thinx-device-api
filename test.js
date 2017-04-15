/*
BASED ON:
curl -H "Origin: rtm.thinx.cloud" \
-H "Content-Type: application/json" \
-H "User-Agent: THiNX-Client" \
-X POST -d '{ "registration" : { "mac" : "00:00:00:00:00:00", "firmware" : "EAV-App-0.4.0-beta:2017/04/08", "hash" : "e58fa9bf7f478442c9d34593f0defc78718c8732", "push" : "registration-token-optional", "alias" : "test", "owner": "admin" } }' \
http://thinx.cloud:7442/device/register
*/

// ran by `npm test` while included in package.json

console.log(
  "/ test expects 200 OK");

var request = require("request");

var base_url = "http://localhost:7442/";
var expect = require('expect');

describe("7442_localhost_root_spec", function() {
  describe("GET /", function() {
    it("returns status code 200", function(done) {
      console.log("Checking status code...");
      request.get(base_url, function(error, response, body) {
        console.log("200 OK");
        expect(response.statusCode).toBe(200);
        done();
      });
    });

    it("returns This is API ROOT.", function(done) {
      console.log("Checking response...");
      request.get(base_url, function(error, response, body) {
        console.log(body.toString());
        expect(body).toBe("This is API ROOT.");
        done();
      });
    });
  });
});
