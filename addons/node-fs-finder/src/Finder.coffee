Base = require './Base'
Helpers = require './Helpers'

moment = require 'moment'
compare = require 'operator-compare'

isFunction = (obj) -> return Object.prototype.toString.call(obj) == '[object Function]'

class Finder extends Base


	@TIME_FORMAT = 'YYYY-MM-DD HH:mm'


	#*******************************************************************************************************************
	#										CREATING INSTANCE
	#*******************************************************************************************************************


	@in: (path) ->
		return new Finder(path)


	@from: (path) ->
		return (new Finder(path)).recursively()


	@find: (path, fn = null, type = 'all') ->
		path = Helpers.parseDirectory(path)
		return (new Finder(path.directory)).recursively().find(path.mask, fn, type)


	@findFiles: (path = null, fn = null) ->
		if isFunction(path)
			fn = path
			path = null

		return Finder.find(path, fn, 'files')


	@findDirectories: (path = null, fn = null) ->
		if isFunction(path)
			fn = path
			path = null

		return Finder.find(path, fn, 'directories')


	@findFile: (path = null, fn = null) ->
		if isFunction(path)
			fn = path
			path = null

		return Finder.findFirst().find(path, fn, 'files')


	@findDirectory: (path = null, fn = null) ->
		if isFunction(path)
			fn = path
			path = null

		return Finder.findFirst().find(path, fn, 'directories')


	#*******************************************************************************************************************
	#										FIND METHODS
	#*******************************************************************************************************************


	find: (mask = null, fn = null, type = 'all') ->
		if isFunction(mask)
			type = fn
			fn = mask
			mask = null

		mask = Helpers.normalizePattern(mask)

		if @up is on or typeof @up in ['number', 'string']
			if fn == null
				return @getPathsFromParentsSync(mask, type)
			else
				return @getPathsFromParentsAsync(fn, mask, type)
		else
			if fn == null
				return @getPathsSync(type, mask)
			else
				return @getPathsAsync(fn, type, mask)


	findFiles: (mask = null, fn = null) ->
		if isFunction(mask)
			fn = mask
			mask = null

		return @find(mask, fn, 'files')


	findDirectories: (mask = null, fn = null) ->
		if isFunction(mask)
			fn = mask
			mask = null

		return @find(mask, fn, 'directories')


	findFile: (mask = null, fn = null) ->
		if isFunction(mask)
			fn = mask
			mask = null

		return @findFirst().find(mask, fn, 'files')


	findDirectory: (mask = null, fn = null) ->
		if isFunction(mask)
			fn = mask
			mask = null

		return @findFirst().find(mask, fn, 'directories')


	#*******************************************************************************************************************
	#										FILTERS
	#*******************************************************************************************************************


	size: (operation, value) ->
		@filter( (stat) ->
			return compare(stat.size, operation, value)
		)

		return @


	date: (operation, value) ->
		@filter( (stat) ->
			switch Object.prototype.toString.call(value)
				when '[object String]' then date = moment(value, Finder.TIME_FORMAT)
				when '[object Object]' then date = moment().subtract(value)
				else throw new Error 'Date format is not valid.'

			return compare((new Date(stat.mtime)).getTime(), operation, date.valueOf())
		)

		return @


module.exports = Finder