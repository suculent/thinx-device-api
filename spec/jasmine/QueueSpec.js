const expect = require('chai').expect;
const Builder = require('../../lib/thinx/builder');
const Queue = require("../../lib/thinx/queue");

const envi = require("../_envi.json");

const Globals = require("../../lib/thinx/globals.js");
const redis_client = require('redis');

describe("Queue", function () {

    let redis;

    beforeAll(async() => {
        console.log(`🚸 [chai] >>> running Queue spec`);
        // Initialize Redis
        redis = redis_client.createClient(Globals.redis_options());
        await redis.connect();
    });

    afterAll(() => {
        console.log(`🚸 [chai] <<< completed Queue spec`);
    });

    let mock_udid_1 = "<mock-udid-1>";
    let mock_udid_2 = "<mock-udid-2>";
    let mock_udid_3 = envi.udid;
    let mock_source_id = "<mock-source-id>";
    let mock_owner_id = envi.oid;
    let queue_with_cron;

    // init
    it("should not fail or hang", async (done) => {

        let builder = new Builder(redis);

        // Should initialize safely without running cron
        queue_with_cron = new Queue(redis, builder, null, null, null);
        expect(queue_with_cron).to.be.a('object');

        let workers = queue_with_cron.getWorkers();
        expect(workers).to.be.a('array');

        // Should be able to run cron when initialized
        queue_with_cron.cron();

        let done_called = false;

        // Should be able to add actions to the queue
        queue_with_cron.add(mock_udid_1, mock_source_id, mock_owner_id, () => {
            queue_with_cron.add(mock_udid_2, mock_source_id, mock_owner_id, () => {
                queue_with_cron.add(mock_udid_3, mock_source_id, mock_owner_id, async () => {

                    let next = await queue_with_cron.findNext();

                    if (next === null) {
                        if (done_called === false) {
                            done_called = true;
                            done();
                        }
                        return;
                    }

                    // Should be able run next item
                    queue_with_cron.runNext(next, workers[0]);

                    // Should not be able to find anything while queue item is running
                    next = await queue_with_cron.findNext();

                    if (next === null) {
                        if (done_called === false) {
                            done_called = true;
                            done();
                        }
                        return;
                    }

                    // Should run loop safely
                    for (let i = 0; i < 10; i++) queue_with_cron.loop();

                });
            });
        });

    }, 5000);

});