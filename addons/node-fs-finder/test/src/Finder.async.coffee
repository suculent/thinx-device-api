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

describe 'Finder.async', ->

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

		it 'should return file names from root folder', (done) ->
			Finder.in('/').findFiles( (files) ->
				expect(files).to.have.members([
					"/0"
					"/1"
					"/five"
					"/one"
					"/three"
					"/two"
				])
				done()
			)

	describe '#findDirectories()', ->

		it 'should return directory names from root folder', (done) ->
			Finder.in('/').findDirectories( (directories) ->
				expect(directories).to.have.members([
					"/eight"
					"/seven"
					"/six"
				])
				done()
			)

	describe '#find()', ->

		it 'should return file and directory names from root folder', (done) ->
			Finder.in('/').find( (paths) ->
				expect(paths).to.have.members([
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
				done()
			)

	describe '#recursive()', ->

		it 'should return file names recursively from find* methods', (done) ->
			Finder.from('/').findFiles( (files) ->
				expect(files).to.have.members([
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
				done()
			)

	describe '#findFirst()', ->

		it 'should return file path', (done) ->
			Finder.in('/').findFirst().findFiles( (file) ->
				expect(file).to.be.equal("/0")
				done()
			)

		it 'should return null', (done) ->
			Finder.in('/').findFirst().findFiles('randomName', (file) ->
				expect(file).to.be.null
				done()
			)

		it 'should return file path for first name with two numbers in name', (done) ->
			Finder.from('/').findFirst().findFiles('<[0-9]{2}>', (file) ->
				expect(file).to.be.equal("/seven/13")
				done()
			)

		it 'should return null for recursive searching', (done) ->
			Finder.from('/').findFirst().findFiles('randomName', (file) ->
				expect(file).to.be.null
				done()
			)

		it 'should return first path to directory', (done) ->
			Finder.from('/').findFirst().findDirectories('4', (directory) ->
				expect(directory).to.be.equal("/eight/3/4")
				done()
			)

		it 'should return null when looking into parents', (done) ->
			Finder.in('/eight/3/4').lookUp(4).findFirst().findFiles('twelve', (file) ->
				expect(file).to.be.null
				done()
			)

		it 'should return first file when looking into parents recursively', (done) ->
			Finder.from("/eight/3/4").lookUp(4).findFirst().findFiles('twelve', (file) ->
				expect(file).to.equal("/seven/twelve")
				done()
			)

	describe '#exclude()', ->

		it 'should return files which has not got numbers in name', (done) ->
			Finder.in('/').exclude(['<[0-9]>']).findFiles( (files) ->
				expect(files).to.have.members([
					"/five"
					"/one"
					"/three"
					"/two"
				])
				done()
			)

	describe '#showSystemFiles()', ->

		it 'should return also system, hide and temp files', (done) ->
			Finder.in('/').showSystemFiles().findFiles( (files) ->
				expect(files).to.have.members([
					"/0"
					"/1"
					"/.cache"
					"/five"
					"/five~"
					"/one"
					"/three"
					"/two"
				])
				done()
			)

	describe '#lookUp()', ->

		it 'should return path to file in parent directory', (done) ->
			Finder.in("/eight/3/4").lookUp(4).showSystemFiles().findFiles('._.js', (files) ->
				expect(files).to.have.members([
					"/eight/._.js"
				])
				done()
			)

		it 'should return first file in parent directory with depth set by string', (done) ->
			Finder.in("/eight").lookUp('/').findFiles('package.json', (files) ->
				expect(files).to.be.eql([
					"/eight/package.json"
				])
				done()
			)

		it 'should return null when limit parent is the same like searched directory and file is not there', (done) ->
			Finder.in('/').lookUp('/').findFiles('package.json', (files) ->
				expect(files).to.be.eql([])
				done()
			)

		it 'should return path to file in parent directory recursively', (done) ->
			Finder.from("/eight/3/4").lookUp(4).findFiles('twelve', (files) ->
				expect(files).to.be.eql([
					"/seven/twelve"
				])
				done()
			)

		it 'should return first file in parent directories with depth set by string', (done) ->
			Finder.from("/eight/3/4").lookUp('/').findFiles('twelve', (files) ->
				expect(files).to.be.eql([
					"/seven/twelve"
				])
				done()
			)

	describe '#size()', ->

		it 'should return files with size between 2000B and 3000B', (done) ->
			Finder.in('/').size('>=', 9).size('<=', 11).findFiles( (files) ->
				expect(files).to.have.members([
					"/five"
				])
				done()
			)

	describe '#date()', ->

		it 'should return files which were changed in less than 1 second ago', (done) ->
			setTimeout( ->
				fs.writeFileSync("/two", 'just some changes')
				Finder.in('/').date('>', milliseconds: 100).findFiles( (files) ->
					expect(files).to.have.members([
						"/two"
					])
					done()
				)
			, 200)

	describe '#filter()', ->

		it 'should return files which names are 3 chars length', (done) ->
			filter = (stat, file) ->
				name = path.basename file, path.extname(file)
				return name.length == 3

			Finder.in('/').filter(filter).findFiles( (files) ->
				expect(files).to.have.members([
					"/one"
					"/two"
				])
				done()
			)