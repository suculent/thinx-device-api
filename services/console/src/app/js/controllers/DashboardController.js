angular.module('RTM').controller('DashboardController', ['$rootScope', '$scope', '$http', '$timeout', function($rootScope, $scope, $http, $timeout) {
  $scope.$on('$viewContentLoaded', function() {
    // initialize core components
    App.initAjax();

    Thinx.getStats()
    .done(function(data) {
      $scope.$emit("updateStats", data);
      updateCharts();
    })
    .fail(error => $scope.$emit("xhrFailed", error));

    Thinx.getAuditHistory()
    .done(function(data) {
      $scope.$emit("updateAuditHistory", data);
    })
    .fail(error => $scope.$emit("xhrFailed", error));

    Thinx.sourceList()
    .done(function(data) {
      console.log('+++ updateSources ');
      $scope.$emit("updateSources", data);
    })
    .fail(error => $scope.$emit("xhrFailed", error));

    Thinx.apikeyList()
    .done( function(data) {
      console.log('+++ updateApikeys ');
      $scope.$emit("updateApikeys", data);
    })
    .fail(error => $scope.$emit("xhrFailed", error));

    Thinx.deploykeyList()
    .done( function(data) {
      console.log('+++ updateDeploykeys ');
      $scope.$emit("updateDeploykeys", data);
    })
    .fail(error => $scope.$emit("xhrFailed", error));

    Thinx.deviceList()
    .done(function(data) {
      $scope.$emit("updateDevices", data);
      // updateDashboardChart();
    })
    .fail(error => $scope.$emit("xhrFailed", error));

    $scope.searchText = '';
    $scope.selectedItems = [];

  });

  // end of onload function

  $scope.deviceForm = {};
  $scope.deviceForm.udid = null;
  $scope.deviceForm.alias = null;
  $scope.deviceForm.platform = null;
  $scope.deviceForm.keyhash = null;
  $scope.deviceForm.source = null;
  $scope.deviceForm.auto_update = null;
  $scope.deviceForm.description = null;
  $scope.deviceForm.category = null;
  $scope.deviceForm.tags = [];

  $scope.configForm = {};
  $scope.configForm.devices = [];
  $scope.configForm.enviros = {};
  $scope.configForm.resetDevices = false;

  $scope.transferForm = {};
  $scope.transferForm.email = null;
  $scope.transferForm.mig_sources = false;
  $scope.transferForm.mig_apikeys = true;
  $scope.transferForm.submitDisabled = false;

  $scope.list = {};
  $scope.list.searchText = '';
  $scope.list.filterPlatform = '';
  $scope.list.orderOptions = [
    {prop: 'lastupdate', alias: 'Last Update', icon: 'clock-o'},
    {prop: 'platform', alias: 'Platform', icon: 'lightbulb-o'},
    {prop: 'alias', alias: 'Alias', icon: 'sort-alpha-asc'}
  ];
  $scope.list.orderBy = $scope.list.orderOptions[0];
  $scope.list.reverse = true;

  $scope.list.groupOptions = [
    {prop: 'lastseen', alias: 'Last Update', icon: 'clock-o'},
    {prop: 'platform', alias: 'Platform', icon: 'lightbulb-o'},
    {prop: 'category', alias: 'Category', icon: 'sort-alpha-asc'},
    {prop: 'icon', alias: 'Icon', icon: 'sort-alpha-asc'}
  ];
  $scope.list.groupBy = $scope.list.groupOptions[0];

  $scope.chart = {};
  $scope.chart.range = 7;
  $scope.chart.init = false;
  $scope.chart.computing = false;

  Thinx.init($rootScope, $scope);

  // set sidebar closed and body solid layout mode
  $rootScope.settings.layout.pageContentWhite = true;
  $rootScope.settings.layout.pageBodySolid = false;
  $rootScope.settings.layout.pageSidebarClosed = false;

  $scope.chartRange = function(range) {
    console.log('updating charts');
    $scope.chart.range = range;
    $scope.chart.computing = true;
    updateDashboardChart();
  }

  function updateDashboardChart() {
    console.log("/////// timeline");
    //console.log($rootScope.stats.timeline);
    var checkins = {};
    for (var index in $rootScope.stats.timeline.CHECKINS) {
      if (typeof(checkins[$rootScope.stats.timeline.CHECKINS[index].date]) == 'undefined') {
        checkins[$rootScope.stats.timeline.CHECKINS[index].date] = 1;
      } else {
        checkins[$rootScope.stats.timeline.CHECKINS[index].date]++;
      }
    }

    console.log('//////// checkins');
    //console.log(checkins);
    var checkinsByDate = {};
    for (var checkinDate in checkins) {
      checkinsByDate[checkinDate] = checkins[checkinDate];
    }
    console.log('//////// checkinsByDate');
    //console.log(checkinsByDate);

    console.log('//////// errorsByDate');
    var errorsByDate = $rootScope.stats.timeline.ERRORS;
    //console.log(errorsByDate);

    $rootScope.stats.total.RANGE_CHECKINS = 0;
    $rootScope.stats.total.RANGE_ERRORS = 0;
    var chartData = [];
    var dateArr = dateRangeArray($scope.chart.range);
    for (var day in dateArr) {
      if (typeof(dateArr[day]) !== "undefined") {
        var totalCheckins = 0;
        var totalErrors = 0;
        if (typeof(checkinsByDate[dateArr[day]]) !== "undefined") {
          totalCheckins = checkinsByDate[dateArr[day]];
          $rootScope.stats.total.RANGE_CHECKINS += totalCheckins;
        }
        if (typeof(errorsByDate[dateArr[day]]) !== "undefined") {
          totalErrors = errorsByDate[dateArr[day]];
          $rootScope.stats.total.RANGE_ERRORS += totalErrors;
        }
        chartData.push({
          date: dateArr[day],
          checkins: totalCheckins,
          errors: totalErrors,
        });
      }
    }

    console.log('//////// updating chart');
    //console.log(chartData);
    Dashboard.init(chartData);
    $scope.chart.init = true;
    $scope.chart.computing = false;
  }

  function dateRangeArray(days) {
    var dateArr = []; //Array where rest of the dates will be stored
    var prevDate = moment().subtract(days, 'days');//15 days back date from today(This is the from date)
    var nextDate = moment().add(1, 'days');//Date after 15 days from today (This is the end date)

    //extracting date from objects in YYYY-MM-DD format
    prevDate = moment(prevDate._d).format('YYYY-MM-DD');
    nextDate = moment(nextDate._d).format('YYYY-MM-DD');

    //creating JS date objects
    var start = new Date(prevDate);
    var end = new Date(nextDate);

    //Logic for getting rest of the dates between two dates("FromDate" to "EndDate")
    while(start < end){
      dateArr.push(moment(start).format('YYYY-MM-DD'));
      var newDate = start.setDate(start.getDate() + 1);
      start = new Date(newDate);
    }

    console.log('Last ' + days + ' Days: ');
    //console.log(dateArr);

    return dateArr;
  }

  function updateCharts() {

    $("#sparkline_bar").sparkline($rootScope.stats.daily.DEVICE_CHECKIN, {
      type: 'bar',
      width: '80',
      barWidth: 8,
      height: '55',
      barColor: '#29b4b6',
      negBarColor: '#29b4b6'
    });

    console.log('dailystats', $rootScope.stats.daily.DEVICE_NEW);
    $("#sparkline_bar2").sparkline($rootScope.stats.daily.DEVICE_NEW, {
      type: 'bar',
      width: '80',
      barWidth: 8,
      height: '55',
      barColor: '#1ba39c',
      negBarColor: '#1ba39c'
    });

    $("#sparkline_inchart_active").sparkline($rootScope.stats.daily.DEVICE_ACTIVE, {
      type: 'bar',
      width: '190',
      barWidth: 26,
      height: '55',
      barColor: '#ffffff',
      negBarColor: '#ffffff'
    });

    $("#sparkline_inchart_checkin").sparkline($rootScope.stats.daily.DEVICE_CHECKIN, {
      type: 'bar',
      width: '190',
      barWidth: 26,
      height: '55',
      barColor: '#ffffff',
      negBarColor: '#ffffff',
      zeroAxis: false,
      tooltipFormat: 'Daily - {{value}}',
    });

    /*
    tooltipFormat: '{{value:levels}} - {{value}}',
    tooltipValueLookups: {
    levels: $.range_map({ ':2': 'Daily', '3:6': 'Medium', '7:': 'High' })
    */

    $("#sparkline_inchart_error").sparkline($rootScope.stats.daily.DEVICE_ERROR, {
      type: 'bar',
      width: '80',
      barWidth: 8,
      height: '55',
      barColor: '#ffffff',
      negBarColor: '#ffffff'
    });

    $("#sparkline_inchart_update").sparkline($rootScope.stats.daily.DEVICE_UPDATE, {
      type: 'bar',
      width: '80',
      barWidth: 8,
      height: '55',
      barColor: '#ffffff',
      negBarColor: '#ffffff'
    });

    $scope.$apply();

    console.log('stats:');
    console.log($rootScope.stats);
  }


  $scope.showDeviceLastBuild = function(deviceUdid, event) {
    event.stopPropagation();
    console.log('--- trying to show last build log for ' + deviceUdid);
    $rootScope.modalBuildId = $rootScope.meta.deviceBuilds[deviceUdid][0].build_id;
    $rootScope.showLog($rootScope.modalBuildId);
  }

  $scope.hasBuildId = function(deviceUdid) {
    if (typeof($rootScope.meta.deviceBuilds[deviceUdid]) !== "undefined") {
      if ($rootScope.meta.deviceBuilds[deviceUdid].length == 0) {
        return null;
      } else {
        return true;
      }
    }
    return false;
  }

  $scope.hasSource = function(device) {
    if (typeof(device.source) !== "undefined" && device.source !== null) {
      return true;
    }
    return false;
  }

  $scope.delimitByDate = function(date, interval) {
    // subtract interval from now and return true if date is earlier
  }

  $scope.checkItem = function(udid) {
    console.log('### toggle item in selectedItems');
    var index = $scope.selectedItems.indexOf(udid);
    if (index > -1) {
      console.log('splicing on ', index, ' value ', $scope.selectedItems[index]);
      $scope.selectedItems.splice(index, 1);
    } else {
      $scope.selectedItems.push(udid);
    }
  }

  $scope.journeyClass = function(goal) {
    if ($rootScope.profile.info.goals.includes(goal)) {
      return 'journey-success';
    } else if ((goal == 'apikey') && (!$rootScope.profile.info.goals.includes('deploykey')) ) {
      return 'journey-active';
    } else if ((goal == 'enroll') && ($rootScope.profile.info.goals.includes('apikey') && (!$rootScope.profile.info.goals.includes('build'))) ) {
      return 'journey-active';
    } else if ((goal == 'build')  && ($rootScope.profile.info.goals.includes('enroll') && (!$rootScope.profile.info.goals.includes('update'))) ) {
      return 'journey-active';
    } else if ((goal == 'update') && ($rootScope.profile.info.goals.includes('build') && (!$rootScope.profile.info.goals.includes('update'))) ) {
      return 'journey-active';
    } else {
      return 'journey-default';
    }
  };

}]);
