describe("Queue", function() {

    var expect = require('chai').expect;
    let Queue = require("../../lib/thinx/queue");
    
    let mock_udid_1 = "<mock-udid-1>";
    let mock_udid_2 = "<mock-udid-2>";
    let mock_udid_3 = "<mock-udid-3>";

    let mock_source_id = "<mock-source-id>";

    let queue_with_cron;

    // init
    it("Should work", function(done) {
        // Should initialize safely without running cron
        let builder = {};
        queue_with_cron = new Queue(builder);
        expect(queue_with_cron).to.be.a('object');

        // Should be able to run cron when initialized
        queue_with_cron.cron();

        // Should be able to add actions to the queue
        queue_with_cron.add(mock_udid_1, mock_source_id);
        queue_with_cron.add(mock_udid_2, mock_source_id);
        queue_with_cron.add(mock_udid_3, mock_source_id);

        // Should be able find next waiting item in queue
        queue_with_cron.findNext(function(next) {
            expect(next).to.be.an('object');

            // Should be able run next item
            queue_with_cron.runNext(action);

            // Should not be able to find anything while queue item is running
            queue_with_cron.findNext(function(action) {
                expect(action).to.be.an('object');
            });

            // Should run loop safely
            for (let i = 0; i < 10; i++) {
                queue_with_cron.loop();
            }
           
            done();
        });
    });

});