// const { assertions } = require("expect");

let Queue = require("../../lib/thinx/queue");

describe("Queue", function() {

    let mock_udid_1 = "<mock-udid-1>";
    let mock_udid_2 = "<mock-udid-2>";
    let mock_udid_3 = "<mock-udid-3>";

    let mock_source_id = "<mock-source-id>";

    let queue_with_cron;

    // init
    it("Should initialize safely without running cron", function() {
        queue_with_cron = new Queue();
        expect(queue_with_cron).toBeDefined();
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

    // findNext (A)
    it("Should be able find next waiting item in queue", function() {
        let next = queue_with_cron.findNext();
        expect(next).toBeDefined();
    });

    // runNext
    it("Should be able run next item", function() {
        let next = queue_with_cron.findNext();
        expect(next).toBeDefined();
    });

    // findNext (B)
    it("Should not be able to find anything while queue item is running", function() {
        let next = queue_with_cron.findNext();
        expect(next).not.toBeDefined();
    });

    it("Should run loop safely", function() {
        for (let i = 0; i < 10; i++) {
            queue_with_cron.loop();
        }
    });

});