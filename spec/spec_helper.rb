require 'coveralls'
Coveralls.wear!

config.expect_with :rspec do |c|
    c.syntax = [:should, :expect]
end
