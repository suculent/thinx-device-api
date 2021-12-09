describe("Queue", function() {

    var expect = require('chai').expect;
    let Queue = require("../../lib/thinx/queue");
    
    let mock_udid_1 = "<mock-udid-1>";
    let mock_udid_2 = "<mock-udid-2>";
    let mock_udid_3 = "<mock-udid-3>";

    let mock_source_id = "<mock-source-id>";

    let queue_with_cron;

    // init
    it("(00) should not fail or hang", function(done) {
        // Should initialize safely without running cron
        queue_with_cron = new Queue(null);
        expect(queue_with_cron).to.be.a('object');

        // Should be able to run cron when initialized
        queue_with_cron.cron();

        // Should be able to add actions to the queue
        queue_with_cron.add(mock_udid_1, mock_source_id);
        queue_with_cron.add(mock_udid_2, mock_source_id);
        queue_with_cron.add(mock_udid_3, mock_source_id);

        console.log("(00) Queue calling findNext...");

        // Should be able find next waiting item in queue
        queue_with_cron.findNext((next) => {

            console.log("(00) queue_with_cron.findNext exited with", next);

            // Should be able run next item
            queue_with_cron.runNext(next);

            console.log("(00) Queue calling findNext again async...");

            // Should not be able to find anything while queue item is running
            queue_with_cron.findNext((nextAction) => {
                console.log("(00) nextAction", nextAction.action);
            });
                
            console.log("(00) Queue test calling loop...");

            // Should run loop safely
            for (let i = 0; i < 10; i++) {
                queue_with_cron.loop();
            }

            console.log("(00) Queue test done.");
           
            done();
        
        });    
    });
});