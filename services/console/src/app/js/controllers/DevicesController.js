angular.module('RTM').controller('DevicesController', ['$rootScope', '$scope', '$http', '$timeout', function($rootScope, $scope, $http, $timeout) {
  $scope.$on('$viewContentLoaded', function() {
    // initialize core components
    App.initAjax();

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

    Thinx.deviceList()
    .done(function(data) {
      $scope.$emit("updateDevices", data);
    })
    .fail(error => $scope.$emit("xhrFailed", error));

    $scope.searchText = '';
    $scope.selectedItems = [];

    $("#transferModal").on('shown.bs.modal', function(){
      angular.element('input[name=transferEmail]').focus();
    });
  });

  // end of onload function

  $scope.deviceForm = {};
  $scope.deviceForm.udid = null;
  $scope.deviceForm.alias = null;
  $scope.deviceForm.platform = null;
  $scope.deviceForm.base_platform = null;
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

  if (typeof($scope.list) == 'undefined') {
    $scope.list = {};
    $scope.list.grid = true;
    $scope.list.searchText = '';
    $scope.list.filterPlatform = '';
    $scope.list.filterCategory = '';
    $scope.list.orderOptions = [
      {prop: 'lastupdate', alias: 'Last Update', icon: 'clock-o'},
      {prop: 'platform', alias: 'Platform', icon: 'lightbulb-o'},
      {prop: 'alias', alias: 'Alias', icon: 'sort-alpha-asc'}
    ];
    $scope.list.orderBy = $scope.list.orderOptions[0];
    $scope.list.reverse = true;
  }

  Thinx.init($rootScope, $scope);

  // set sidebar closed and body solid layout mode
  $rootScope.settings.layout.pageContentWhite = true;
  $rootScope.settings.layout.pageBodySolid = false;
  $rootScope.settings.layout.pageSidebarClosed = false;

  $scope.build = function(deviceUdid, sourceId) {
    console.log('-- building firmware for ' + deviceUdid + '/' + $rootScope.getSourceById(sourceId).alias + ' --');

    Thinx.build(deviceUdid, sourceId)
    .done(function(response) {

      console.log(' --- response ---');
      console.log(response);

      if (typeof(response) !== "undefined") {
        if (response.success) {
          console.log(' --- save last build id: ' + response.build_id + ' ---');

          // prepare user metadata for particular device
          if (typeof($rootScope.meta.builds[response.build_id]) == 'undefined') {
              $rootScope.meta.builds[response.build_id] = [];
          }
          $rootScope.meta.builds[response.build_id].push(response);

          Thinx.getBuildHistory()
          .done(function(data) {
            $scope.$emit("updateBuildHistory", data);
          })
          .fail(error => $scope.$emit("xhrFailed", error));

          // save user-spcific goal achievement
          if ($rootScope.profile.info.goals.length > 0) {
            if (!$rootScope.profile.info.goals.includes('build')) {
              $rootScope.profile.info.goals.push('build');
              $scope.$emit("saveProfileChanges", ["goals"]);
            }
          }

          toastr.info(
            response.status + '<br><br>Click to show build log...',
            'THiNX Builder',
            {
              timeOut:3000,
              extendedTimeOut:5000,
              tapToDismiss: false,
              closeButton: false,
              progressBar: true,
              onclick: function () {
                  $scope.$emit('showLogOverlay', response.build_id);
              }
            }
          );

          $scope.$apply();
        } else {
          console.log(response);
          toastr.error(response.status, '<ENV::loginPageTitle>', {timeOut: 5000});
        }
      } else {
        console.log('error');
        console.log(response);
      }

    })
    .fail(function(error) {
      console.error('Error:', error);
      toastr.error('Build Failed Badly.', '<ENV::loginPageTitle>', {timeOut: 5000});
    });
  };

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

  $scope.revokeSelected = function() {
    console.log('-- processing selected items --');
    console.log($scope.selectedItems);

    var selectedToRevoke = $scope.selectedItems.slice();
    if (selectedToRevoke.length > 0) {
      revokeDevices(selectedToRevoke);
    } else {
      toastr.warning('Nothing selected.', '<ENV::loginPageTitle>', {timeOut: 1000});
    }
  };

  function revokeDevices(deviceUdids) {
    console.log('--revoking ' + deviceUdids.length + ' devices --')

    Thinx.revokeDevices(deviceUdids)
    .done(function(revokeDeviceResponse) {
      if (revokeDeviceResponse.success) {
        console.log('Success:', revokeDeviceResponse);

        Thinx.deviceList()
        .done(function(revokeDoneDevicesList) {
          $scope.selectedItems = [];
          $scope.$emit("updateDevices", revokeDoneDevicesList);
          $scope.$apply();
          toastr.success('Devices Revoked.', '<ENV::loginPageTitle>', {timeOut: 5000});
        })
        .fail(error =>  $scope.$emit("xhrFailed", error));

      } else {
        toastr.error('Revocation failed.', '<ENV::loginPageTitle>', {timeOut: 5000});
      }
    })
    .fail(error => $scope.$emit("xhrFailed", error));
  }


  function transferDevices(transferForm, deviceUdids) {
    console.log('--transferring devices ' + deviceUdids.length +'--')

    $scope.transferForm.submitDisabled = true;

    Thinx.transferDevices(transferForm, deviceUdids)
    .done(function(transferDeviceResponse) {
      if (transferDeviceResponse.success) {
        console.log('Success:', transferDeviceResponse);
        toastr.info('Transfer pending.', '<ENV::loginPageTitle>', {timeOut: 5000});

        $scope.selectedItems = [];
        $scope.transferForm.email = null;
        $scope.transferForm.mig_sources = false;
        $scope.transferForm.mig_apikeys = true;

        $scope.transferForm.submitDisabled = false;
        $('#transferModal').modal('hide');

        Thinx.deviceList()
        .done(function(transferDoneDeviceList) {
          $scope.$emit("updateDevices", transferDoneDeviceList);
        })
        .fail(error =>  $scope.$emit("xhrFailed", error));

      } else {
        toastr.error('Transfer failed.', '<ENV::loginPageTitle>', {timeOut: 5000});
        $scope.transferForm.submitDisabled = false;
      }
    })
    .fail(error => $scope.$emit("xhrFailed", error));
  }

  $scope.transferDevices = function() {
    console.log('-- processing selected items (transfer) --');
    console.log($scope.selectedItems);

    var selectedToTransfer = $scope.selectedItems.slice();
    if (selectedToTransfer.length > 0) {
      transferDevices($scope.transferForm, selectedToTransfer);
    } else {
      toastr.warning('Nothing selected.', '<ENV::loginPageTitle>', {timeOut: 1000});
    }
  };

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

  $scope.openConfigModal = function() {
    console.log('Resetting config form values...');
    // $scope.deviceForm.index = index;

    Thinx.enviroList()
    .done( function(data) {

      var enviros = JSON.parse(data);
      $rootScope.enviros = enviros.env_vars;

      var defVal = false;
      if ($rootScope.enviros.length < 3) {
          defVal = true;
      }
      for (var index in enviros.env_vars) {
          $scope.configForm.enviros[enviros.env_vars[index]] = defVal;
      }

      $scope.configForm.resetDevices = false;
      $scope.configForm.devices = $scope.selectedItems;
      $scope.$apply()

      console.log("config form vars", $scope.configForm);
      $('#configModal').modal('show');

    })
    .fail(error => console.log('Error:', error));

  }


  function pushConfig(configForm, deviceUdids) {
    console.log('--pushing config to devices ' + deviceUdids.length +'--')

    Thinx.pushConfig(configForm, deviceUdids)
    .done(function(data) {
      if (data.success) {
        console.log('Success:', data);
        toastr.success('Configuration Pushed.', '<ENV::loginPageTitle>', {timeOut: 5000});

        $('#configModal').modal('hide');

        $scope.selectedItems = [];
        $scope.configForm.devices = [];
        $scope.configForm.enviros = {};
        $scope.configForm.resetDevices = false;

      } else {
        toastr.error('Push Configuration failed.', '<ENV::loginPageTitle>', {timeOut: 5000});
      }
    })
    .fail(error => $scope.$emit("xhrFailed", error));
  }

  $scope.submitPushConfig = function() {
    console.log('-- processing selected items (pushconfig) --');
    console.log($scope.selectedItems);

    var selectedToProcess = $scope.selectedItems.slice();
    if (selectedToProcess.length > 0) {
      pushConfig($scope.configForm, selectedToProcess);
    } else {
      toastr.warning('Nothing selected.', '<ENV::loginPageTitle>', {timeOut: 1000});
    }
  };

  $scope.openTransferModal = function() {
    console.log('Resetting transfer modal form values...');

    $scope.transferForm.email = null;
    $scope.transferForm.mig_sources = false;
    $scope.transferForm.mig_apikeys = true;

    $('#transferModal').modal('show');
  }

  $scope.isSharedKey = function() {

    // check if some of selected devices using shared apikeys
    var deviceKeyhashes = [];
    var transferDeviceKeyhashes = [];
    for (var index in $rootScope.devices) {
      if ($scope.selectedItems.indexOf($rootScope.devices[index].udid) > -1) {
        // this is selected device
        transferDeviceKeyhashes.push($rootScope.devices[index].udid);
      } else {
        // this is non selected
      }
      deviceKeyhashes.push($rootScope.devices[index].udid);
    }
    console.log('deviceKeyhashes', deviceKeyhashes);
    console.log('transferDeviceKeyhashes', transferDeviceKeyhashes);

    // TODO: find duplicated items in deviceKeyhashes and find if some of them are in transferDeviceKeyhashes
    // if so, return true

    return true;

    // var uniqueArray = deviceKeyhashes.filter(function(item, pos) {
      // return deviceKeyhashes.indexOf(item) == pos;
    // });
    // console.log('uniqueArray', uniqueArray);

  }

}]);
