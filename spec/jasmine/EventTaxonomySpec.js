const expect = require('chai').expect;

const EventTaxonomy = require('../../lib/thinx/event_taxonomy.js');
const Statistics = require('../../lib/thinx/statistics.js');
const InfluxConnector = require('../../lib/thinx/influx.js');

describe("EventTaxonomy", function () {

	it("(01) should expose an ordered, non-empty list of descriptors", function () {
		expect(EventTaxonomy.EVENTS).to.be.an('array');
		expect(EventTaxonomy.EVENTS.length).to.be.greaterThan(0);
	});

	it("(02) should have unique, non-empty, identifier-safe names", function () {
		const names = EventTaxonomy.names();
		const seen = new Set();
		const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
		for (const name of names) {
			expect(name).to.be.a('string');
			expect(name.length).to.be.greaterThan(0);
			expect(identifier.test(name)).to.equal(true, `name '${name}' is not a valid identifier`);
			expect(seen.has(name)).to.equal(false, `duplicate name '${name}'`);
			seen.add(name);
		}
	});

	it("(03) should carry a category and a flag for every descriptor", function () {
		for (const event of EventTaxonomy.EVENTS) {
			expect(event.name).to.be.a('string').and.not.equal('');
			expect(event.category).to.be.a('string').and.not.equal('');
			expect(event.flag).to.be.a('string').and.not.equal('');
		}
	});

	it("(04) categories() and flags() should cover exactly the taxonomy names", function () {
		const names = EventTaxonomy.names().slice().sort();
		expect(Object.keys(EventTaxonomy.categories()).sort()).to.deep.equal(names);
		expect(Object.keys(EventTaxonomy.flags()).sort()).to.deep.equal(names);
	});

	it("(05) NAMES constants should map each name to itself", function () {
		for (const name of EventTaxonomy.names()) {
			expect(EventTaxonomy.NAMES[name]).to.equal(name);
		}
	});

	it("(06) templateModel() should key exactly the taxonomy names, each a fresh [0] counter", function () {
		const model = EventTaxonomy.templateModel();
		expect(Object.keys(model)).to.deep.equal(EventTaxonomy.names());
		for (const name of EventTaxonomy.names()) {
			expect(model[name]).to.deep.equal([0]);
		}
		// fresh object each call (no shared counter references)
		const other = EventTaxonomy.templateModel();
		expect(other).to.not.equal(model);
		expect(other[EventTaxonomy.names()[0]]).to.not.equal(model[EventTaxonomy.names()[0]]);
	});

	it("(07) statistics owner_template keys should equal the taxonomy names (no drift)", function () {
		const template = Statistics.get_owner_template();
		expect(Object.keys(template)).to.deep.equal(EventTaxonomy.names());
	});

	it("(08) influx measurements() should equal the taxonomy names (no drift)", function () {
		expect(InfluxConnector.measurements()).to.deep.equal(EventTaxonomy.names());
	});

});
