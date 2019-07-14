escape = require 'escape-regexp'
path = require 'path'

class Helpers


	@ASTERISK_PATTERN = '<[0-9a-zA-Z/.-_ ]+>'


	@parseDirectory: (_path) ->
		mask = null
		asterisk = _path.indexOf('*')
		regexp = _path.indexOf('<')

		if asterisk != -1 || regexp != -1
			if asterisk == -1 || (asterisk != -1 && regexp != -1 && asterisk > regexp)
				splitter = regexp
			else if regexp == -1 || (regexp != -1 && asterisk != -1 && asterisk <= regexp)
				splitter = asterisk

			mask = _path.substr(splitter)
			_path = _path.substr(0, splitter)

		return {
			directory: _path
			mask: mask
		}


	@normalizePattern: (pattern) ->
		if pattern == null
			return null

		if pattern == '*'
			return null

		pattern = pattern.replace(/\*/g, Helpers.ASTERISK_PATTERN)
		parts = pattern.match(/<((?!(<|>)).)*>/g)
		if parts != null
			partsResult = {}
			for part, i in parts
				partsResult['__<<' + i + '>>__'] = part.replace(/^<(.*)>$/, '$1')
				pattern = pattern.replace(part, '__<<' + i + '>>__')

			pattern = escape(pattern)

			for replacement, part of partsResult
				pattern = pattern.replace(replacement, part)
		else
			pattern = escape(pattern)

		return pattern


	@expandPath: (_path, isFile = false) ->
		if isFile
			_path = path.dirname(_path)

		current = _path
		result = [current]
		while current != '/'
			result.push(path.dirname(current))
			current = path.dirname(current)

		return result


module.exports = Helpers