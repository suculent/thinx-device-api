/*

THiNX Main Script

*/

/* Init App */
var RTM = angular.module("RTM", [
  "ui.router",
  "ui.bootstrap",
  "oc.lazyLoad",
  "ngSanitize",
  "angular-web-notification",
  "tandibar/ng-rollbar",
  "luegg.directives",
  "frapontillo.bootstrap-switch",
  "xeditable",
  "ui.codemirror",
  "angular.filter"
]);

RTM.config(['RollbarProvider', function(RollbarProvider) {
  RollbarProvider.init({
    accessToken: "<ENV::rollbarAccessToken>",
    captureUncaught: true,
    payload: {
      environment: 'development'
    }
  });
}]);

/* Configure ocLazyLoader(refer: https://github.com/ocombe/ocLazyLoad) */
RTM.config(['$ocLazyLoadProvider', function($ocLazyLoadProvider) {
  $ocLazyLoadProvider.config({
    // global configs go here
  });
}]);

//AngularJS v1.3.x workaround for old style controller declarition in HTML
RTM.config(['$controllerProvider', function($controllerProvider) {
  $controllerProvider.allowGlobals();
}]);

/* Setup global settings */
RTM.factory('settings', ['$rootScope', function($rootScope) {
  // supported languages
  var settings = {
    layout: {
      pageSidebarClosed: false, // sidebar menu state
      pageContentWhite: true, // set page content layout
      pageBodySolid: false, // solid body color state
      pageAutoScrollOnLoad: 1000 // auto scroll to top on page load
    },
    assetsPath: '../assets',
    globalPath: '../assets/global',
    layoutPath: '../assets/layouts/thinx',
  };

  $rootScope.settings = settings;

  console.log(' === ROOT === ');
  console.log($rootScope);

  // UI temporary data, might be saved to localstorage
  if (typeof($rootScope.meta) == "undefined") {
    $rootScope.meta = {};
    $rootScope.meta.version = {
      ui: '1.0.0 (beta)'
    };
    $rootScope.meta.builds = []; // builds by build_id
    $rootScope.meta.transformers = {}; // decoded transformers
    $rootScope.meta.deviceBuilds = {}; // builds by udid
    $rootScope.meta.notifications = []; // notification messages
    $rootScope.meta.apikeys = {};
    $rootScope.meta.sources = {};
    $rootScope.meta.auditlogs = {}; // flags for auditlogs
  }

  // dashboard stats defaults
  $rootScope.stats = {
    total: {
      CHANNELS: 0,
      DEVICES: 0,
      UPDATES: 0,
      APIKEY_INVALID: 0,
      ERRORS: 0,
      RANGE_CHECKINS: 0,
      RANGE_ERRORS: 0,
      DEVICE_NEW: 0
    },
    timeline: {
      MAX: null,
      MIN: null,
      COUNT: 0,
      SPAN: 0,
      VALUES: [],
      ERRORS: []
    },
    daily: {
      DEVICE_CHECKIN: [],
      DEVICE_NEW: [],
      APIKEY_INVALID: [],
      DEVICE_UPDATE_OK: [],
      DEVICE_UPDATE_FAIL: []
    }
  };

  // ID: [],
  // APIKEY_INVALID: [],
  // PASSWORD_INVALID: [],
  // APIKEY_MISUSE: [],
  // DEVICE_NEW: [5,4,3,2,1,1,2,3,4,5],
  // DEVICE_CHECKIN: [1,2,3,4,5,5,4,3,2,1],
  // DEVICE_UPDATE_OK: [],
  // DEVICE_UPDATE_FAIL: [],
  // BUILD_STARTED: [],
  // BUILD_SUCCESS: [],
  // BUILD_FAIL: []

  $rootScope.sources = [];
  $rootScope.devices = [];
  //$rootScope.rsakeys = [];
  $rootScope.deploykeys = [];
  $rootScope.apikeys = [];
  $rootScope.enviros = [];
  $rootScope.buildHistory = [];
  $rootScope.auditlog = [];

  $rootScope.logdata = {
    buffer:{},
    watchers:{}
  };

  $rootScope.platforms = {
    'arduino': {name: 'Arduino', build: true},
    'platformio': {name: 'Platform.io', build: true},
    'nodemcu': {name: 'NodeMCU', build: true},
    'micropython': {name: 'Micropython', build: true},
    'mongoose': {name: 'MongooseOS', build: true},
    'nodejs': {name: 'NodeJS', build: true},
    'unknown': {name: 'Unknown', build: true},
    'sigfox': {name: 'Sigfox', build: false}
  };

  $rootScope.categories = {
    'yellow-crusta': {name: 'yellow-crusta'},
    'red-intense': {name: 'red-intense'},
    'purple-studio': {name: 'purple-studio'},
    'blue': {name: 'blue'},
    'green': {name: 'green'},
    'green-dark': {name: 'green-dark'},
    'grey-mint': {name: 'grey-mint'},
  };

  $rootScope.thinx = {};

  $rootScope.thinx.iotIcons = [];
  for (var i = 1; i < 73; i++) {
    $rootScope.thinx.iotIcons.push(i);
  }

  $rootScope.thinx.defaults = {defaultTransformerBodyBase64: "Ly8gQ29weSAmIFBhc3RlIEphdmFzY3JpcHQgZnVuY3Rpb24gaGVyZS4uLgoKdmFyIHRyYW5zZm9ybWVyID0gZnVuY3Rpb24oc3RhdHVzLCBkZXZpY2UpIHsKICByZXR1cm4gc3RhdHVzOwp9"};

  $rootScope.profile = {
    avatar: '/assets/thinx/img/default_avatar_sm.png',
    info: {
      first_name: '',
      last_name: '',
      mobile_phone: '',
      git_webhook: '',
      slack_token: '',
      security: {
        "unique_api_keys": null,
        "global_push": null,
        "important_notifications": null
      },
      goals: [],
      username: '',
      owner: '',
      tags: [],
      transformers: [],
      timezone_abbr: "UTC",
      timezone_offset: 0,
      timezone_utc: "Etc/GMT"
    }
  };

  return settings;
}]);


RTM.filter('lastSeen', function() {
  return function(date, suffix) {
    return moment(date).fromNow(suffix);
  };
});

RTM.filter('base64_decode', function() {
  return function(base64_string) {
    if (typeof(base64_string) == 'undefined' || base64_string.length < 1) {
      return;
    } else {
      return base64converter('decode', base64_string);
    }
  };
});

function base64converter(type, string) {
  /*! http://mths.be/base64 v0.1.0 by @mathias | MIT license */

  /*--------------------------------------------------------------------------*/
  var InvalidCharacterError = function(message) {
    this.message = message;
  };
  InvalidCharacterError.prototype = new Error;
  InvalidCharacterError.prototype.name = 'InvalidCharacterError';
  var error = function(message) {
    // Note: the error messages used throughout this file match those used by
    // the native `atob`/`btoa` implementation in Chromium.
    throw new InvalidCharacterError(message);
  };
  var TABLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  // http://whatwg.org/html/common-microsyntaxes.html#space-character
  var REGEX_SPACE_CHARACTERS = /[\t\n\f\r ]/g;
  // `decode` is designed to be fully compatible with `atob` as described in the
  // HTML Standard. http://whatwg.org/html/webappapis.html#dom-windowbase64-atob
  // The optimized base64-decoding algorithm used is based on @atk's excellent
  // implementation. https://gist.github.com/atk/1020396
  var decode = function(input) {
    input = String(input)
    .replace(REGEX_SPACE_CHARACTERS, '');
    var length = input.length;
    if (length % 4 == 0) {
      input = input.replace(/==?$/, '');
      length = input.length;
    }
    if (
      length % 4 == 1 ||
      // http://whatwg.org/C#alphanumeric-ascii-characters
      /[^+a-zA-Z0-9/]/.test(input)
    ) {
      error(
        'Invalid character: the string to be decoded is not correctly encoded.'
      );
    }
    var bitCounter = 0;
    var bitStorage;
    var buffer;
    var output = '';
    var position = -1;
    while (++position < length) {
      buffer = TABLE.indexOf(input.charAt(position));
      bitStorage = bitCounter % 4 ? bitStorage * 64 + buffer : buffer;
      // Unless this is the first of a group of 4 characters…
      if (bitCounter++ % 4) {
        // …convert the first 8 bits to a single ASCII character.
        output += String.fromCharCode(
          0xFF & bitStorage >> (-2 * bitCounter & 6)
        );
      }
    }
    return output;
  };
  // `encode` is designed to be fully compatible with `btoa` as described in the
  // HTML Standard: http://whatwg.org/html/webappapis.html#dom-windowbase64-btoa
  var encode = function(input) {
    input = String(input);
    if (/[^\0-\xFF]/.test(input)) {
      // Note: no need to special-case astral symbols here, as surrogates are
      // matched, and the input is supposed to only contain ASCII anyway.
      error(
        'The string to be encoded contains characters outside of the ' +
        'Latin1 range.'
      );
    }
    var padding = input.length % 3;
    var output = '';
    var position = -1;
    var a;
    var b;
    var c;
    var d;
    var buffer;
    // Make sure any padding is handled outside of the loop.
    var length = input.length - padding;
    while (++position < length) {
      // Read three bytes, i.e. 24 bits.
      a = input.charCodeAt(position) << 16;
      b = input.charCodeAt(++position) << 8;
      c = input.charCodeAt(++position);
      buffer = a + b + c;
      // Turn the 24 bits into four chunks of 6 bits each, and append the
      // matching character for each of them to the output.
      output += (
        TABLE.charAt(buffer >> 18 & 0x3F) +
        TABLE.charAt(buffer >> 12 & 0x3F) +
        TABLE.charAt(buffer >> 6 & 0x3F) +
        TABLE.charAt(buffer & 0x3F)
      );
    }
    if (padding == 2) {
      a = input.charCodeAt(position) << 8;
      b = input.charCodeAt(++position);
      buffer = a + b;
      output += (
        TABLE.charAt(buffer >> 10) +
        TABLE.charAt((buffer >> 4) & 0x3F) +
        TABLE.charAt((buffer << 2) & 0x3F) +
        '='
      );
    } else if (padding == 1) {
      buffer = input.charCodeAt(position);
      output += (
        TABLE.charAt(buffer >> 2) +
        TABLE.charAt((buffer << 4) & 0x3F) +
        '=='
      );
    }
    return output;
  };
  var base64 = {
    'encode': encode,
    'decode': decode,
    'version': '0.1.0'
  };


  if (type == 'encode') {
    return base64.encode(string);
  }
  if (type == 'decode') {
    return base64.decode(string);
  }

}

RTM.filter('split', function() {
  return function(input, splitChar, splitIndex) {
    // do some bounds checking here to ensure it has that index
    return input.split(splitChar)[splitIndex];
  }
});

RTM.filter('objFilter', function() {
  return function(input, search) {
    if (!input) return input;
    if (!search) return input;
    var expected = ('' + search).toLowerCase();
    var result = {};
    angular.forEach(input, function(value, key) {
      var actual = ('' + value).toLowerCase();
      if (actual.indexOf(expected) !== -1) {
        result[key] = value;
      }
    });
    return result;
  }
});

/**
* AngularJS default filter with the following expression:
* "person in people | filter: {name: $select.search, age: $select.search}"
* performs a AND between 'name: $select.search' and 'age: $select.search'.
* We want to perform a OR.
*/
angular.module('RTM').filter('propsFilter', function() {
  return function(items, props) {
    var out = [];
    if (angular.isArray(items)) {
      var keys = Object.keys(props);
      items.forEach(function(item) {
        var itemMatches = false;
        for (var i = 0; i < keys.length; i++) {
          var prop = keys[i];
          var text = props[prop].toLowerCase();
          if (item[prop].toString().toLowerCase().indexOf(text) !== -1) {
            itemMatches = true;
            break;
          }
        }
        if (itemMatches) {
          out.push(item);
        }
      });
    } else {
      // Let the output be the input untouched
      out = items;
    }
    return out;
  };
});

/* Filtering out control characters for status transformer icons */
RTM.filter('removeControlChars', function() {
  return function(str) {
    var output = "";
    if (typeof(str) !== "undefined" && str.length > 0) {
      str = str.replace("#e", "");
      str = str.replace("#w", "");
      output = str;
    }
    return output;
  };
});

/* Main Controller */
RTM.controller('AppController', ['$scope', '$rootScope', 'webNotification', 'Rollbar', function($scope, $rootScope, $webNotification, Rollbar) {
  $scope.$on('$viewContentLoaded', function() {
    console.log('checking user credentials...');
    console.log(
      document.cookie
    );
  });
}]);

function getCookie(name) {
  var dc = document.cookie;
  var prefix = name + "=";
  var begin = dc.indexOf("; " + prefix);
  if (begin == -1) {
    begin = dc.indexOf(prefix);
    if (begin != 0) return null;
  }
  else
  {
    begin += 2;
    var end = document.cookie.indexOf(";", begin);
    if (end == -1) {
      end = dc.length;
    }
  }
  return decodeURI(dc.substring(begin + prefix.length, end));
}

/* Header */
RTM.controller('HeaderController', ['$scope', '$rootScope', function($scope, $rootScope) {
  $scope.$on('$includeContentLoaded', function() {
    Layout.initHeader();
  });

  $rootScope.getDeviceByUdid = function(deviceUdid) {
    for (var index in $rootScope.devices) {
      if ($rootScope.devices[index].udid == deviceUdid) {
        return $rootScope.devices[index];
      }
    }
    return false;
  }

  $rootScope.getApikeyByHash = function(keyhash) {
    for (var index in $rootScope.apikeys) {
      if ($rootScope.apikeys[index].hash == keyhash) {
        return $rootScope.apikeys[index];
      }
    }
    return false;
  }

  $rootScope.getSourceById = function(sourceId) {
    for (var index in $rootScope.sources) {
      if ($rootScope.sources[index].sourceId == sourceId) {
        return $rootScope.sources[index];
      }
    }
    return false;
  }

  $rootScope.getTransformerByUtid = function(transformerUtid) {
    for (var index in $rootScope.profile.info.transformers) {
      if ($rootScope.profile.info.transformers[index].utid == transformerUtid) {
        return $rootScope.profile.info.transformers[index];
      }
    }
    return false;
  }

  $rootScope.getRawTransformerByUtid = function(transformerUtid) {
    for (var index in $rootScope.meta.transformers) {
      if ($rootScope.meta.transformers[index].utid == transformerUtid) {
        return $rootScope.meta.transformers[index];
      }
    }
    return false;
  }

}]);

/* Setup Layout Part - Sidebar */
RTM.controller('SidebarController', ['$state', '$scope', function($state, $scope) {
  $scope.$on('$includeContentLoaded', function() {
    Layout.initSidebar($state); // init sidebar
  });
}]);

/* Setup Layout Part - Sidebar */
RTM.controller('PageHeadController', ['$scope', function($scope) {
  $scope.$on('$includeContentLoaded', function() {
    Theme.init(); // init theme panel
    $scope.socketStatus = null;
  });

  $scope.displaySocketStatus = function(status) {
    if (status == 1) {
      $scope.socketStatus = 'WebSocket Connected';
    } else if (status == 0) {
      $scope.socketStatus = 'WebSocket Connecting...';
    }
    $('.websocket-badge').fadeIn();
    setTimeout(function(){
      console.log("timeout");
      $('.websocket-badge').fadeOut();
    }, 2000)
  }

}]);

/* Setup Layout Part - Quick Sidebar */
RTM.controller('QuickSidebarController', ['$scope', function($scope) {
  $scope.$on('$includeContentLoaded', function() {
    setTimeout(function(){
      QuickSidebar.init(); // init quick sidebar
    }, 2000)
  });
}]);

/* Setup Layout Part - Footer */
RTM.controller('FooterController', ['$scope', function($scope) {
  $scope.$on('$includeContentLoaded', function() {
    Layout.initFooter(); // init footer
  });
}]);


/* Router */
RTM.config(['$stateProvider', '$urlRouterProvider', function($stateProvider, $urlRouterProvider) {
  // Redirect any unmatched url
  $urlRouterProvider.otherwise("/dashboard");

  $stateProvider

  // Dashboard
  .state('dashboard', {
    url: "/dashboard",
    templateUrl: "views/dashboard.html",
    data: {pageTitle: 'Dashboard'},
    controller: "DashboardController",
    resolve: {
      deps: ['$ocLazyLoad', function($ocLazyLoad) {
        return $ocLazyLoad.load({
          name: 'RTM',
          insertBefore: '#ng_load_plugins_before',
          files: [
            '../assets/global/plugins/morris/morris.css',
            '../assets/global/plugins/morris/morris.min.js',
            '../assets/global/plugins/raphael.min.js',
            '../assets/global/plugins/jquery.sparkline.min.js',

            '../assets/thinx/js/plugins/ui-select/select.min.css',
            '../assets/thinx/js/plugins/ui-select/select.min.js',
            '../assets/global/plugins/clipboardjs/clipboard.min.js',

            '../assets/global/plugins/typeahead/typeahead.css',
            '../assets/global/plugins/typeahead/typeahead.bundle.min.js',

            '../assets/thinx/js/dashboard.js',

            'js/thinx-api.js',
            'js/controllers/DashboardController.js',
            'js/controllers/LogviewController.js'
          ]
        });
      }]
    }
  })

  // Devices
  .state('devices', {
    url: "/devices",
    templateUrl: "views/devices.html",
    data: {pageTitle: 'Devices'},
    controller: "DevicesController",
    resolve: {
      deps: ['$ocLazyLoad', function($ocLazyLoad) {
        return $ocLazyLoad.load({
          name: 'RTM',
          insertBefore: '#ng_load_plugins_before',
          files: [
            '../assets/thinx/js/plugins/ui-select/select.min.css',
            '../assets/thinx/js/plugins/ui-select/select.min.js',
            '../assets/global/plugins/clipboardjs/clipboard.min.js',

            '../assets/global/plugins/typeahead/typeahead.css',
            '../assets/global/plugins/typeahead/typeahead.bundle.min.js',

            'js/thinx-api.js',
            'js/controllers/DevicesController.js',
            'js/controllers/LogviewController.js'
          ]
        });
      }]
    }
  })

  // Device Detail
  .state('device', {
    url: "/device/:udid",
    params: {
      udid: null
    },
    templateUrl: "views/device.html",
    data: {pageTitle: 'Device'},
    controller: "DeviceController",
    resolve: {
      deps: ['$ocLazyLoad', function($ocLazyLoad) {
        return $ocLazyLoad.load({
          name: 'RTM',
          insertBefore: '#ng_load_plugins_before',
          files: [
            '../assets/thinx/js/plugins/ui-select/select.min.css',
            '../assets/thinx/js/plugins/ui-select/select.min.js',
            '../assets/global/plugins/clipboardjs/clipboard.min.js',

            // tags input dependency
            '../assets/global/plugins/typeahead/typeahead.css',
            '../assets/global/plugins/typeahead/typeahead.bundle.min.js',

            '../assets/thinx/js/plugins/timezones/timezones.min.js',

            'js/thinx-api.js',

            'js/controllers/DeviceController.js',
            'js/controllers/EditorController.js',
            'js/controllers/LogviewController.js',
            '../assets/thinx/js/plugins/crypto-js/sha256.js',
          ]
        });
      }]
    }
  })

  // Apikey Page
  .state('apikey', {
    url: "/apikey",
    templateUrl: "views/apikey.html",
    data: {pageTitle: 'API Key Management'},
    controller: "ApikeyController",
    resolve: {
      deps: ['$ocLazyLoad', function($ocLazyLoad) {
        return $ocLazyLoad.load({
          name: 'RTM',
          insertBefore: '#ng_load_plugins_before',
          files: [
            '../assets/global/plugins/clipboardjs/clipboard.min.js',
            'js/thinx-api.js',
            'js/controllers/ApikeyController.js',
            'js/controllers/LogviewController.js'
          ]
        });
      }]
    }
  })

  // Source Page
  .state('source', {
    url: "/source",
    templateUrl: "views/source.html",
    data: {pageTitle: 'Application Management'},
    controller: "SourceController",
    resolve: {
      deps: ['$ocLazyLoad', function($ocLazyLoad) {
        return $ocLazyLoad.load({
          name: 'RTM',
          insertBefore: '#ng_load_plugins_before',
          files: [
            'js/thinx-api.js',
            'js/controllers/SourceController.js',
            'js/controllers/LogviewController.js'
          ]
        });
      }]
    }
  })

  // Rsakey Page
  /*
  .state('rsakey', {
    url: "/rsakey",
    templateUrl: "views/rsakey.html",
    data: {pageTitle: 'RSA Key Management'},
    controller: "RsakeyController",
    resolve: {
      deps: ['$ocLazyLoad', function($ocLazyLoad) {
        return $ocLazyLoad.load({
          name: 'RTM',
          insertBefore: '#ng_load_plugins_before',
          files: [
            'js/thinx-api.js',
            'js/controllers/RsakeyController.js',
            'js/controllers/LogviewController.js'
          ]
        });
      }]
    }
  })
  */

  // Deploy key Page
  .state('deploykey', {
    url: "/deploykey",
    templateUrl: "views/deploykey.html",
    data: {pageTitle: 'Deploy Key Management'},
    controller: "DeploykeyController",
    resolve: {
      deps: ['$ocLazyLoad', function($ocLazyLoad) {
        return $ocLazyLoad.load({
          name: 'RTM',
          insertBefore: '#ng_load_plugins_before',
          files: [
            '../assets/global/plugins/clipboardjs/clipboard.min.js',
            'js/thinx-api.js',
            'js/controllers/DeploykeyController.js',
            'js/controllers/LogviewController.js'
          ]
        });
      }]
    }
  })

  // Enviro Page
  .state('enviro', {
    url: "/enviro",
    templateUrl: "views/enviro.html",
    data: {pageTitle: 'Environment Variables'},
    controller: "EnviroController",
    resolve: {
      deps: ['$ocLazyLoad', function($ocLazyLoad) {
        return $ocLazyLoad.load({
          name: 'RTM',
          insertBefore: '#ng_load_plugins_before',
          files: [
            'js/thinx-api.js',
            'js/controllers/EnviroController.js',
            'js/controllers/LogviewController.js'
          ]
        });
      }]
    }
  })

  // Transformer Page
  .state('transformer', {
    url: "/transformer",
    templateUrl: "views/transformer.html",
    data: {pageTitle: 'Status Transformers'},
    controller: "TransformerController",
    resolve: {
      deps: ['$ocLazyLoad', function($ocLazyLoad) {
        return $ocLazyLoad.load({
          name: 'RTM',
          insertBefore: '#ng_load_plugins_before',
          files: [
            'js/thinx-api.js',
            'js/controllers/TransformerController.js',
            'js/controllers/EditorController.js',
            'js/controllers/LogviewController.js',
            '../assets/thinx/js/plugins/crypto-js/sha256.js'
          ]
        });
      }]
    }
  })

  // History Page
  .state('history', {
    url: "/history/:tab",
    params: {
      tab: {
        value: 'auditlog'
      }
    },
    templateUrl: "views/history.html",
    data: {pageTitle: 'History'},
    controller: "HistoryController",
    resolve: {
      deps: ['$ocLazyLoad', function($ocLazyLoad) {
        return $ocLazyLoad.load({
          name: 'RTM',
          insertBefore: '#ng_load_plugins_before',
          files: [
            '../assets/global/plugins/component-todo/css/todo.min.css',
            '../assets/global/plugins/component-todo/scripts/todo.min.js',
            'js/thinx-api.js',
            'js/controllers/HistoryController.js',
            'js/controllers/LogviewController.js'
          ]
        });
      }]
    }
  })

  // User Profile
  .state("profile", {
    url: "/profile",
    templateUrl: "views/profile/main.html",
    data: {pageTitle: 'User Profile'},
    controller: "UserProfileController",
    resolve: {
      deps: ['$ocLazyLoad', function($ocLazyLoad) {
        return $ocLazyLoad.load({
          name: 'RTM',
          insertBefore: '#ng_load_plugins_before',
          files: [
            '../assets/global/plugins/bootstrap-fileinput/bootstrap-fileinput.css',
            '../assets/global/plugins/bootstrap-switch/css/bootstrap-switch.min.css',

            '../assets/thinx/css/profile.css',

            '../assets/global/plugins/jquery.sparkline.min.js',
            '../assets/global/plugins/bootstrap-fileinput/bootstrap-fileinput.js',
            '../assets/global/plugins/bootstrap-switch/js/bootstrap-switch.min.js',
            '../assets/global/plugins/clipboardjs/clipboard.min.js',

            '../assets/thinx/js/plugins/ui-select/select.min.css',
            '../assets/thinx/js/plugins/ui-select/select.min.js',
            '../assets/thinx/js/plugins/timezones/timezones.min.js',

            '../assets/thinx/js/profile.js',

            'js/thinx-api.js',
            'js/controllers/UserProfileController.js',
            'js/controllers/LogviewController.js'
          ]
        });
      }]
    }
  })

  // User Profile Dashboard
  .state("profile.dashboard", {
    url: "/dashboard",
    templateUrl: "views/profile/dashboard.html",
    data: {pageTitle: 'User Profile'}
  })

  // User Profile Account
  .state("profile.account", {
    url: "/account",
    templateUrl: "views/profile/account.html",
    data: {pageTitle: 'Settings'}
  })

  // User Profile Help
  .state("profile.help", {
    url: "/help",
    templateUrl: "views/profile/help.html",
    data: {pageTitle: 'User Help'}
  })

  // User Delete Profile
  .state("profile.delete", {
    url: "/delete",
    templateUrl: "views/profile/delete.html",
    data: {pageTitle: 'Delete Profile'}
  })

  // Blank Page
  .state('blank', {
    url: "/blank",
    templateUrl: "views/blank.html",
    data: {pageTitle: 'Blank Page Template'},
    controller: "BlankController",
    resolve: {
      deps: ['$ocLazyLoad', function($ocLazyLoad) {
        return $ocLazyLoad.load({
          name: 'RTM',
          insertBefore: '#ng_load_plugins_before',
          files: [
            'js/controllers/BlankController.js'
          ]
        });
      }]
    }
  })

}]);

/* Init global settings and run the app */
RTM.run(["$rootScope", "settings", "$state", function($rootScope, settings, $state) {
  $rootScope.$state = $state;
  $rootScope.$settings = settings;
}]);

RTM.run(function(editableOptions,editableThemes) {
  editableOptions.theme = 'default';
  editableThemes['default'].submitTpl = '<button class="btn grey-mint btn-outline btn-circle btn-sm" type="submit"><i class="fa fa-check"></i></button>';
  editableThemes['default'].cancelTpl = '<button class="btn grey-mint btn-outline btn-circle btn-sm" ng-click="$form.$cancel()"><i class="fa fa-times"></i></button>';
  // editableOptions.buttons = 'right';
});
