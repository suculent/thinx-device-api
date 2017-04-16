var gulp = require('gulp');
var repoWatch = require('gulp-repository-watch');

gulp.task("repo-watch", function() {
	repoWatch({
			repository: "git@github.com:suculent/thinx-device-api.git"
		})
		.on("check", function() {
			console.log("No changes in " + repo_url);
		})
		.on("change", function(newHash, oldHash) {
			console.log(repo_url + "changed from ", oldHash, " to ", newHash);
		});
});

//var repo = require("./lib/thinx/repository");

//repo.watchRepository("git@github.com/suculent/thinx-device-api.git");

while (true) {

}
