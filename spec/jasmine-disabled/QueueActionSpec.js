describe("Queue Action", function() {

    var expect = require('chai').expect;
    var Action = require("../../lib/thinx/queue_action");

    //let mock_udid_1 = "<mock-udid-1>";
    //let mock_udid_2 = "<mock-udid-2>";
    //let mock_udid_3 = "<mock-udid-3>";
    let mock_udid_4 = "<mock-udid-4>";
    let mock_source_id = "<mock-source-id>";
    let action;
    let string_temp;

    // constructor(udid), starts redis client...
    it("should be able to Init with UDID", function() {
        action = new Action(mock_udid_4);
        expect(action).toBeDefined;
    });

    // queueWithSource
    it("should be able start queue with source", function() {
        action.queueWithSource(mock_source_id);
    });

    // setStarted
    it("should be able change action state", function() {
        action.setStarted();
        let status = action.getStatus();
        expect(status).to.equal("running");
    });

    // toString can be called only after queueWithSource
    it("should be able return action as string", function() {
        string_temp = action.toString();        
        expect(string_temp).toBeDefined;
    });

    // withString
    it("should be able recreate action from string", function() {
        let action2 = new Action();
        action2.withString(string_temp);
        let string_temp2 = action.toString();
        expect(string_temp).to.equal(string_temp2);
        expect(action.action).to.equal(action2.action);
    });

    // isRunning
    it("should be able tell whether action is running", function() {
        action.queueWithSource(mock_source_id);
    });

    // isWaiting
    it("should be able tell whether action is waiting", function() {
        action.queueWithSource(mock_source_id);
    });

    // save
    it("should be able to save action", function() {
        action.save();
    });

    // delete
    it("should be able to delete the action", function() {
        action.delete();
    });

});