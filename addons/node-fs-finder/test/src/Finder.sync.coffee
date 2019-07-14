expect = require('chai').expect
path = require 'path'

Finder = require '../../lib/Finder'

fs = null
tree =
	eight:
		3:
			4:
				'file.json': ''
		'._.js': ''
		'other.js': ''
		'package.json': ''
	seven:
		13: ''
		14: ''
		twelve: ''
	six:
		eleven: ''
		nine: ''
		ten: ''
	'.cache': ''
	0: ''
	1: ''
	five: 'hello word'
	'five~': ''
	one: ''
	three: ''
	two: ''

describe 'Finder.sync', ->

	beforeEach( ->
		fs = Finder.mock(tree)
	)

	afterEach( ->
		Finder.restore()
	)

	describe '#constructor()', ->

		it 'should throw an error if path is not directory', ->
			expect( -> new Finder("/two") ).to.throw(Error, "Path /two is not directory")

	describe '#findFiles()', ->

		it 'should return file names from root folder', ->
			expect(Finder.in('/').findFiles()).to.have.members([
				"/0"
				"/1"
				"/five"
				"/one"
				"/three"
				"/two"
			])

	describe '#findDirectories()', ->

		it 'should return directory names from root folder', ->
			expect(Finder.in('/').findDirectories()).to.have.members([
				"/eight"
				"/seven"
				"/six"
			])

	describe '#find()', ->

		it 'should return file and directory names from root folder', ->
			expect(Finder.in('/').find()).to.have.members([
				"/0"
				"/1"
				"/eight"
				"/seven"
				"/six"
				"/five"
				"/one"
				"/three"
				"/two"
			])

	describe '#recursive()', ->

		it 'should return file names recursively from find* methods', ->
			expect(Finder.from('/').findFiles()).to.have.members([
				"/0"
				"/1"
				"/eight/3/4/file.json"
				"/eight/other.js"
				"/eight/package.json"
				"/seven/13"
				"/seven/14"
				"/seven/twelve"
				"/six/eleven"
				"/six/nine"
				"/six/ten"
				"/five"
				"/one"
				"/three"
				"/two"
			])

	describe '#findFirst()', ->

		it 'should return file path', ->
			expect(Finder.in('/').findFirst().findFiles()).to.be.equal("/0")

		it 'should return null', ->
			expect(Finder.in('/').findFirst().findFiles('randomName')).to.be.null

		it 'should return file path for first name with two numbers in name', ->
			expect(Finder.from('/').findFirst().findFiles('<[0-9]{2}>')).to.be.equal("/seven/13")

		it 'should return null for recursive searching', ->
			expect(Finder.from('/').findFirst().findFiles('randomName')).to.be.null

		it 'should return first path to directory', ->
			expect(Finder.from('/').findFirst().findDirectories('4')).to.be.equal("/eight/3/4")

		it 'should return null when looking into parents', ->
			expect(Finder.in("/eight/3/4").lookUp(4).findFirst().findFiles('twelve')).to.be.null

		it 'should return first file when looking into parents recursively', ->
			expect(Finder.from("/eight/3/4").lookUp(4).findFirst().findFiles('twelve')).to.equal("/seven/twelve")

	describe '#exclude()', ->

		it 'should return files which has not got numbers in name', ->
			expect(Finder.in('/').exclude(['<[0-9]>']).findFiles()).to.have.members([
				"/five"
				"/one"
				"/three"
				"/two"
			])

	describe '#showSystemFiles()', ->

		it 'should return also system, hide and temp files', ->
			expect(Finder.in('/').showSystemFiles().findFiles()).to.have.members([
				"/0"
				"/1"
				"/.cache"
				"/five"
				"/five~"
				"/one"
				"/three"
				"/two"
			])

	describe '#lookUp()', ->

		it 'should return path to file in parent directory', ->
			expect(Finder.in("/eight/3/4").lookUp(4).showSystemFiles().findFiles('._.js')).to.have.members([
				"/eight/._.js"
			])

		it 'should return first file in parent directory with depth set by string', ->
			expect(Finder.in("/eight").lookUp('/').findFiles('package.json')).to.have.members([
				"/eight/package.json"
			])

		it 'should return null when limit parent is the same like searched directory and file is not there', ->
			expect(Finder.in('/').lookUp('/').findFiles('package.json')).to.be.eql([])

		it 'should return path to file in parent directory recursively', ->
			expect(Finder.from("/eight/3/4").lookUp(4).findFiles('twelve')).to.have.members([
				"/seven/twelve"
			])

		it 'should return first file in parent directories with depth set by string', ->
			expect(Finder.from("/eight/3/4").lookUp('/').findFiles('twelve')).to.have.members([
				"/seven/twelve"
			])

	describe '#size()', ->

		it 'should return files with size between 2000B and 3000B', ->
			expect(Finder.in('/').size('>=', 9).size('<=', 11).findFiles()).to.have.members([
				"/five"
			])

	describe '#date()', ->

		it 'should return files which were changed in less than 1 second ago', (done) ->
			setTimeout( ->
				fs.writeFileSync("/two", 'just some changes')
				expect(Finder.in('/').date('>', milliseconds: 100).findFiles()).to.have.members([
					"/two"
				])
				done()
			, 200)

	describe '#filter()', ->

		it 'should return files which names are 3 chars length', ->
			filter = (stat, file) ->
				name = path.basename file, path.extname(file)
				return name.length == 3
			expect(Finder.in('/').filter(filter).findFiles()).to.have.members([
				"/one"
				"/two"
			])