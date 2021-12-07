describe("Queue", function() {

    var expect = require('chai').expect;
    let Queue = require("../../lib/thinx/queue");
    
    let mock_udid_1 = "<mock-udid-1>";
    let mock_udid_2 = "<mock-udid-2>";
    let mock_udid_3 = "<mock-udid-3>";

    let mock_source_id = "<mock-source-id>";

    let queue_with_cron;

    // init
    it("Should initialize safely without running cron", function() {
        let builder = {};
        queue_with_cron = new Queue(builder);
        expect(queue_with_cron).to.be.a('object');
    });

    // cron
    it("Should be able to run cron when initialized", function() {
        queue_with_cron.cron();
    });

    // add (multiple)
    it("Should be able to add actions to the queue", function() {
        queue_with_cron.add(mock_udid_1, mock_source_id);
        queue_with_cron.add(mock_udid_2, mock_source_id);
        queue_with_cron.add(mock_udid_3, mock_source_id);
    });

    // cron
    it("Should be able to run cron when initialized", function() {
        queue_with_cron.cron();
    });

    // findNext (A)
    it("Should be able find next waiting item in queue", function(done) {
        queue_with_cron.findNext(function(next) {
            expect(next).to.be.an('object');
            done();
        });
    });

    // runNext
    it("Should be able run next item", function(done) {
        queue_with_cron.findNext(function(action) {
            queue_with_cron.runNext(action);
            done();
        });
        
    });

    // findNext (B)
    it("Should not be able to find anything while queue item is running", function() {
        queue_with_cron.findNext(function(action) {
            expect(action).to.be.an('object');;
        });
    });

    it("Should run loop safely", function() {
        for (let i = 0; i < 10; i++) {
            queue_with_cron.loop();
        }
    });

});