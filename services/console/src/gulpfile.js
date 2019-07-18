'use strict';

// sass compile
var gulp = require('gulp');
var prettify = require('gulp-prettify');
var minifyCss = require("gulp-minify-css");
var rename = require("gulp-rename");
let uglify = require('gulp-uglify-es').default;
var noop = require('gulp-noop');

var injectEnvs = require('gulp-inject-envs');
var removeCode = require('gulp-remove-code');
var debug = require('gulp-debug');
var merge = require('merge-stream');
var concat = require('gulp-concat');

console.log('----------- gulp process.env ------------');
console.log(JSON.stringify(process.env, null, 4));
console.log('----------- ---------------- ------------');

var isProduction = typeof(process.env.ENVIRONMENT) == 'undefined' || process.env.ENVIRONMENT !== 'production' ? false : true;
var isEnterprise = typeof(process.env.ENTERPRISE) == 'undefined' || process.env.ENTERPRISE !== 'true' ? false : true;
var makeBundle = false;

var env = {
  environment: isProduction ? 'production' : 'development',
  enterprise: isEnterprise,
  projectName: process.env.COMPOSE_PROJECT_NAME,
  loginPageTitle: 'Keyguru Console',
  hostName: process.env.API_HOSTNAME,
  apiBaseUrl: process.env.API_BASEURL + '/api',
  apiDirectUrl: 'https://' + process.env.API_HOSTNAME,
  slackClientId: '233115403974.233317554391',
  wssUrl: 'wss://' + process.env.API_HOSTNAME +  ':7444',
  baseUrl: 'https://' + process.env.WEB_HOSTNAME + ':7443',
  googleTrackingCode: process.env.GOOGLE_ANALYTICS_ID,
  rollbarAccessToken: process.env.ROLLBAR_ACCESS_TOKEN,
  crispWebsiteId: process.env.CRISP_WEBSITE_ID,
  projectDescription: isEnterprise ? '' : 'Manage IoT devices (for MCUs eg. ESP32, ESP8266 or any systems running Node.js, Micropython, NodeMCU, Arduino...), build and update firmwares remotely (FOTA/firmware-over-the-air), transform and route sensor data (MQTT)'
};

console.log('----------- gulp env ------------');
console.log('isProduction: ' + isProduction);
console.log('isEnterprise: ' + isEnterprise);
console.log('makeBundle: ' + makeBundle);
console.log('env: ' + JSON.stringify(env, null, 4));
console.log('----------- -------- ------------');

//*** Localhost server tast
gulp.task('build', function() {

  /* TODO: debug */
  isProduction = false; // production enables: minification, google analytics  NOT READY
  //isEnterprise = true; // removes OSS blocks
  makeBundle = false; // bundles all css and js NOT READY
  /* TODO: debug */

  var target = './html';

  var compiled_all_js,
      compiled_all_css;

  var removeCodeVars = { enterprise: isEnterprise, production: isProduction, bundle: makeBundle };

  // JS
  compiled_all_js = merge(
    gulp.src([
          'assets/**/*.js',
          'assets/**/*.min.js',
          '!assets/thinx/js/plugins/codemirror/**/*.js'
        ], {base: '.'}),
      gulp.src(['public/**/*.js', '!public/**/*.min.js'], {base: '.'}),
      gulp.src(['app/**/*.js','!app/**/*.min.js'], {base: '.'})
    )
    .pipe(debug({minimal: true}))
    .pipe(removeCode(removeCodeVars))
    .pipe(injectEnvs(env))
    .pipe( isProduction ? uglify().on('error',function(e){console.log(e);}) : noop() )
    .pipe( isProduction ? rename({suffix: '.min'}) : noop() );

  compiled_all_js.pipe( makeBundle ? concat('bundle.js') : noop() )
    .pipe(gulp.dest(target));

  // CSS
  compiled_all_css = merge(
      gulp.src([
          'assets/**/*.css',
          'assets/**/*.min.css',
          '!assets/global/**/*.css'
        ], {base: '.'}),
      gulp.src(['public/**/*.css', '!public/**/*.min.css'], {base: '.'}),
      gulp.src(['app/**/*.css', '!app/**/*.min.css'], {base: '.'})
    )
    .pipe(debug({minimal: true}))
    .pipe(removeCode(removeCodeVars))
    .pipe(injectEnvs(env))
    .pipe( isProduction ? minifyCss() : noop() )
    .pipe( isProduction ? rename({suffix: '.min'}) : noop() );

  compiled_all_css.pipe( makeBundle ? concat('bundle.css') : noop() )
    .pipe(gulp.dest(target));

  // HTML
  merge(
    gulp.src('*.html', {base: '.'}),
    gulp.src([
      'assets/**/*.html',
      '!assets/global/**/*.html'
    ], {base: '.'}),
    gulp.src('public/**/*.html', {base: '.'}),
    gulp.src('app/**/*.html', {base: '.'})
  )
  .pipe(debug({minimal: true}))
  .pipe(removeCode(removeCodeVars))
  .pipe(injectEnvs(env))
  .pipe(prettify({
    indent_size: 4,
    indent_inner_html: true,
    unformatted: ['pre', 'code']
  }))
  .pipe(gulp.dest(target));

  if (!isProduction) {
    merge(
      gulp.src('assets/**/*.js', {base: '.'}),
      gulp.src('app/**/*.js', {base: '.'}),
      gulp.src('assets/**/*.css', {base: '.'}),
      gulp.src('app/**/*.css', {base: '.'})
    )
    .pipe(injectEnvs(env))
    .pipe(debug({minimal: true}))
    .pipe(gulp.dest(target));
  }

  // IMAGES
  gulp.src('assets/**/*.{gif,jpg,png,svg,ico}', {base: '.'})
    .pipe(debug({minimal: true}))
    .pipe(gulp.dest(target));

  // FONTS
  gulp.src('assets/**/*.{eot,ttf,woff,woff2}', {base: '.'})
    .pipe(debug({minimal: true}))
    .pipe(gulp.dest(target));

  // copy global plugins and scripts without processing [must be excluded in build]
  merge(
    gulp.src('manifest.json', {base: '.'}),
    gulp.src('assets/global/**/*.{html,js,css}', {base: '.'}),
    gulp.src('assets/thinx/js/plugins/codemirror/**/*.js', {base: '.'})
  )
  .pipe(debug({minimal: true}))
  .pipe(gulp.dest(target));



});

gulp.task('noop', function() {


});




//*** Localhost server tast
gulp.task('buildPublic', function() {

  /* TODO: debug */
  isProduction = true;
  //isEnterprise = true;
  makeBundle = true;
  /* TODO: debug */

  var removeCodeVars = { enterprise: isEnterprise, production: isProduction, bundle: makeBundle };
  var target = './html';

  /*
  * PUBLIC (login, error, etc... page dependencies)
  */

  var compiled_public_js,
      compiled_public_css;

 /*
  var compiled_app_js,
      compiled_app_css;
  */

  // JS
  compiled_public_js = merge(
    gulp.src([
          'assets/global/plugins/jquery.js',
          'assets/global/plugins/bootstrap/js/bootstrap.js',
          'assets/global/plugins/bootstrap-switch/js/bootstrap-switch.js',
          'assets/global/plugins/jquery-slimscroll/jquery.slimscroll.js',
          'assets/global/plugins/jquery.blockui.js',
          'assets/global/plugins/jquery-validation/js/jquery.validate.js',
          'assets/global/plugins/jquery-validation/js/additional-methods.js',
          'assets/global/scripts/app.js', // this is shared with Private
          'assets/thinx/login.js'
        ], {base: '.'})
    )
    .pipe(debug({minimal: true}))
    .pipe(removeCode(removeCodeVars))
    .pipe(injectEnvs(env));

  compiled_public_js.pipe( makeBundle ? concat('bundle.js') : noop() )
    .pipe( isProduction ? uglify().on('error',function(e){console.log(e);}) : noop() )
    .pipe( isProduction ? rename({suffix: '.min'}) : noop() )
    .pipe(gulp.dest(target + '/public'));

  // CSS
  compiled_public_css = merge(
      gulp.src([
          'assets/global/plugins/font-awesome/css/font-awesome.css',
          'assets/global/plugins/simple-line-icons/css/simple-line-icons.css',
          'assets/global/plugins/bootstrap/css/bootstrap.css',
          'assets/global/plugins/bootstrap-switch/css/bootstrap-switch.css',
          'assets/global/plugins/select2/css/select2.css',
          'assets/global/plugins/select2/css/select2-bootstrap.css',
          'assets/global/css/components.css',
          'assets/global/css/plugins.css',
          'assets/thinx/css/login.css',
          'assets/thinx/css/custom.css'
        ], {base: '.'})
    )
    .pipe(debug({minimal: true}))
    .pipe(removeCode(removeCodeVars))
    .pipe(injectEnvs(env));

  compiled_public_css.pipe( makeBundle ? concat('bundle.css') : noop() )
    .pipe( isProduction ? minifyCss() : noop() )
    .pipe( isProduction ? rename({suffix: '.min'}) : noop() )
    .pipe(gulp.dest(target + '/public'));

  // HTML
  merge(
    gulp.src('*.html', {base: '.'}),
  )
  .pipe(debug({minimal: true}))
  .pipe(removeCode(removeCodeVars))
  .pipe(injectEnvs(env))
  .pipe(prettify({
    indent_size: 4,
    indent_inner_html: true,
    unformatted: ['pre', 'code']
  }))
  .pipe(gulp.dest(target));

  // IMAGES, FONTS
  gulp.src([
    'assets/thinx/**/*.{gif,jpg,png,svg,ico}',
    'assets/thinx/**/*.{eot,ttf,woff,woff2}',
    'manifest.json'
  ], {base: '.'})
    .pipe(debug({minimal: true}))
    .pipe(gulp.dest(target));

});




//*** Localhost server tast
gulp.task('buildApp', function() {

    /*
    * APP (angular index page dependencies)
    */

    // App is dependent on bootstrap/jquery components and app.js, which is used in public build

});
