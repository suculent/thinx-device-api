Helpers = require './Helpers'

path = require 'path'
fs = require 'fs'
Q = require 'q'
async = require 'async'

class Base


	directory: null

	recursive: false

	excludes: null

	filters: null

	systemFiles: false

	up: false

	_findFirst: false


	constructor: (directory) ->
		directory = path.resolve(directory)
		if !fs.statSync(directory).isDirectory()
			throw new Error "Path #{directory} is not directory"

		@directory = directory
		@excludes = []
		@filters = []


	#*******************************************************************************************************************
	#										TESTING
	#*******************************************************************************************************************


	@mock: (tree = {}, info = {}) ->
		FS = require 'fs-mock'
		fs = new FS(tree, info)
		return fs


	@restore: ->
		fs = require 'fs'


	#*******************************************************************************************************************
	#										SETUP
	#*******************************************************************************************************************


	recursively: (@recursive = true) ->
		return @


	exclude: (excludes, exactly = false) ->
		if typeof excludes == 'string' then excludes = [excludes]

		result = []
		for exclude in excludes
			if exactly
				exclude = "<^>#{exclude}<$>"

			result.push(Helpers.normalizePattern(exclude))

		@excludes = @excludes.concat(result)
		return @


	showSystemFiles: (@systemFiles = true) ->
		return @


	lookUp: (@up = true) ->
		return @


	findFirst: (@_findFirst = true) ->
		return @


	filter: (fn) ->
		@filters.push(fn)
		return @


	#*******************************************************************************************************************
	#										SEARCHING
	#*******************************************************************************************************************


	getPathsSync: (type = 'all', mask = null, dir = @directory) ->
		paths = []

		try
			read = fs.readdirSync(dir)
		catch err
			if @_findFirst == true
				return null

			return paths

		for _path in read
			_path = path.join(dir, _path)

			if !@checkExcludes(_path) || !@checkSystemFiles(_path)
				continue

			try
				stats = fs.statSync(_path)
			catch err
				continue

			switch @checkFile(_path, stats, mask, type)
				when 0
					continue

				when 1
					if @_findFirst == true
						return _path

					paths.push(_path)

			if stats.isDirectory() && @recursive == true
				result = @getPathsSync(type, mask, _path)
				if @_findFirst == true && typeof result == 'string'
					return result
				else if @_findFirst == true && result == null
					continue
				else
					paths = paths.concat(result)

		if @_findFirst == true
			return null
		else
			return paths


	getPathsAsync: (fn, type = 'all', mask = null, dir = @directory) ->
		paths = []

		fs.readdir(dir, (err, read) =>
			if err
				fn(if @_findFirst == true then null else paths)
			else
				nextPaths = []

				for _path in read
					_path = path.join(dir, _path)

					continue if !@checkExcludes(_path) || !@checkSystemFiles(_path)

					nextPaths.push(_path)

				files = {}
				async.eachSeries(nextPaths, (item, cb) ->
					fs.stat(item, (err, stats) ->
						if !err
							files[item] = stats

						cb()
					)
				, =>
					subDirectories = []
					for file, stats of files
						switch @checkFile(file, stats, mask, type)
							when 0
								continue

							when 1
								if @_findFirst == true
									fn(file)
									return null

								paths.push(file)

						if stats.isDirectory() && @recursive == true
							subDirectories.push(file)

					if subDirectories.length == 0
						fn(if @_findFirst == true then null else paths)
					else
						async.eachSeries(subDirectories, (item, cb) =>
							@getPathsAsync( (result) =>
								if @_findFirst == true && typeof result == 'string'
									fn(result)
									cb(new Error 'Fake error')
								else if @_findFirst == true && result == null
									cb()
								else
									paths = paths.concat(result)
									cb()
							, type, mask, item)
						, (err) ->
							if !err
								fn(paths)
						)
				)
		)


	#*******************************************************************************************************************
	#										CHECKS
	#*******************************************************************************************************************


	checkExcludes: (_path) ->
		for exclude in @excludes
			if (new RegExp(exclude)).test(_path)
				return false

		return true


	checkSystemFiles: (_path) ->
		if @systemFiles == false
			if path.basename(_path)[0] == '.' || _path.match(/~$/) != null
				return false

		return true


	checkFilters: (_path, stats) ->
		for filter in @filters
			if !filter(stats, _path)
				return false

		return true


	checkFile: (_path, stats, mask, type) ->
		if type == 'all' || (type == 'files' && stats.isFile()) || (type == 'directories' && stats.isDirectory())
			if mask == null || (mask != null && (new RegExp(mask, 'g')).test(_path))
				if !@checkFilters(_path, stats)
					return 0

				return 1

		return 2


	#*******************************************************************************************************************
	#										PARENTS
	#*******************************************************************************************************************


	getPathsFromParentsSync: (mask = null, type = 'all') ->
		Finder = require './Finder'

		parentPaths = Helpers.expandPath(@directory)
		result = []

		previous = null
		breakAtEnd = false
		for parentPath, i in parentPaths
			if @up == true
				# continue
			else if typeof @up == 'string' && @up == parentPath
				breakAtEnd = true
			else if typeof @up == 'number' && @up <= i
				break

			finder = new Finder(parentPath)

			finder.recursive = @recursive
			finder.excludes = @excludes
			finder.filters = @filters
			finder.systemFiles = @systemFiles
			finder._findFirst = @_findFirst == true

			if previous != null
				finder.exclude(previous, true)

			found = finder.getPathsSync(type, mask)
			if @_findFirst == true && typeof found == 'string'
				return found
			else if @_findFirst == true && found == null
				# continue
			else if found.length > 0
				result = result.concat(found)

			if breakAtEnd
				break

			previous = parentPath

		return if @_findFirst == true then null else result


	getPathsFromParentsAsync: (fn, mask = null, type = 'all') ->
		Finder = require './Finder'

		parentPaths = Helpers.expandPath(@directory)
		result = []

		previous = null
		breakAtEnd = false
		finders = []
		for parentPath, i in parentPaths
			if @up == true
				# continue
			else if typeof @up == 'string' && @up == parentPath
				breakAtEnd = true
			else if typeof @up == 'number' && @up <= i
				break

			finder = new Finder(parentPath)

			finder.recursive = @recursive
			finder.excludes = @excludes
			finder.filters = @filters
			finder.systemFiles = @systemFiles
			finder._findFirst = @_findFirst == true

			if previous != null
				finder.exclude(previous, true)

			finders.push(finder)

			if breakAtEnd
				break

			previous = parentPath

		async.eachSeries(finders, (finder, cb) =>
			finder.getPathsAsync( (found) =>
				if @_findFirst == true && typeof found == 'string'
					fn(found)
					cb(new Error 'Fake error')
				else if @_findFirst == true && found == null
					cb()
				else
					result = result.concat(found)
					cb()
			, type, mask)
		, (err) =>
			if !err
				fn(if @_findFirst == true then null else result)
		)


module.exports = Base