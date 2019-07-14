expect = require('chai').expect

Helpers = require '../../lib/Helpers'

describe 'Helpers', ->

	describe '#parseDirectory()', ->

		it 'should return object with directory and mask from path to find* methods', ->
			expect(Helpers.parseDirectory("/one")).to.be.eql(
				directory: "/one"
				mask: null
			)

			expect(Helpers.parseDirectory("<(five|three)*>")).to.be.eql(
				directory: ''
				mask: '<(five|three)*>'
			)

			expect(Helpers.parseDirectory("*<e$>")).to.be.eql(
				directory: ''
				mask: '*<e$>'
			)

	describe '#expandPath()', ->

		it 'should return array with expanded paths', ->
			expect(Helpers.expandPath('/var/www/web/project/about-me/www/index.php', true)).to.be.eql([
				'/var/www/web/project/about-me/www'
				'/var/www/web/project/about-me'
				'/var/www/web/project'
				'/var/www/web'
				'/var/www'
				'/var'
				'/'
			])