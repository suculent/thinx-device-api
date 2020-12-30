/* Setup blank page controller */
angular.module('RTM').controller('ApikeyController', ['$rootScope', '$scope', 'settings', function($rootScope, $scope, settings) {
  $scope.$on('$viewContentLoaded', function() {
    // initialize core components
    App.initAjax();

    // set default layout mode
    $rootScope.settings.layout.pageContentWhite = true;
    $rootScope.settings.layout.pageBodySolid = false;
    $rootScope.settings.layout.pageSidebarClosed = false;

    Thinx.init($rootScope, $scope);

    Thinx.apikeyList()
    .done( function(data) {
      $scope.$emit("updateApikeys", data);
    })
    .fail(error => console.log('Error:', error));


    Thinx.deviceList()
    .done(function(data) {
      $scope.$emit("updateDevices", data);
    })
    .fail(error => $scope.$emit("xhrFailed", error));

    $scope.resetModal();
    $scope.searchText = '';

    $("#pageModal").on('shown.bs.modal', function(){
      angular.element('input[name=apikeyAlias]').focus();
    });
  });

  $scope.searchText = '';

  $scope.createApikey = function(apikeyAlias) {

    console.log('-- testing for duplicates --');
    for (var apikeyId in $rootScope.apikeys) {
      console.log("Looping apikeys: alias ", $rootScope.apikeys[apikeyId].alias);

      if ($rootScope.apikeys[apikeyId].alias == apikeyAlias) {
        toastr.error('Alias must be unique.', '<ENV::loginPageTitle>', {timeOut: 5000});
        return;
      }
    }

    console.log('-- asking for new apikey with alias: ' + apikeyAlias + ' --');

    Thinx.createApikey(apikeyAlias)
    .done(function(response) {
      if (typeof(response) !== "undefined") {
        if (response.success) {
          console.log(response.api_key);
          $scope.createButtonVisible = false;
          $scope.newApikey = response.api_key;
          $('#pageModal .msg-warning').show();

          Thinx.apikeyList()
          .done( function(data) {
            $scope.$emit("updateApikeys", data);

            // save user-spcific goal achievement
            if (typeof($rootScope.profile.info.goals) !== 'undefined') {
              if (!$rootScope.profile.info.goals.includes('apikey')) {
                $rootScope.profile.info.goals.push('apikey');
                $scope.$emit("saveProfileChanges", ["goals"]);
              }
            }
          })
          .fail(error => console.log('Error:', error));

          $scope.$apply();
        } else {
          console.log(response);
          $('.msg-warning').text(response.status);
          $('.msg-warning').show();
        }
      } else {
        console.log('error');
        console.log(response);
        toastr.error('Apikey creation failed.', '<ENV::loginPageTitle>', {timeOut: 5000});
      }
    })
    .fail(function(error) {
      console.log('Error:', error);
    });

  };

  function revokeApikeys(fingerprints) {
    console.log('--deleting selected api keys ' + fingerprints.length +'--')

    Thinx.revokeApikeys(fingerprints)
    .done(function(data) {
      if (data.success) {
        console.log('Success:', data);

        $scope.selectedItems = [];
        Thinx.apikeyList()
        .done( function(data) {

          toastr.success('Deleted.', '<ENV::loginPageTitle>', {timeOut: 5000});
          $scope.$emit("updateApikeys", data);
        })
        .fail(error => console.log('Error:', error));

      } else {
        toastr.error('Revocation failed.', '<ENV::loginPageTitle>', {timeOut: 5000});
      }

    })
    .fail(function (error) {
      // TODO throw error message
      console.log('Error:', error)
    });
  }

  $scope.revokeApikeys = function() {
    console.log('-- processing selected items --');
    console.log($scope.selectedItems);

    var selectedToRevoke = $scope.selectedItems.slice();
    if (selectedToRevoke.length > 0) {
      revokeApikeys(selectedToRevoke);
    } else {
      toastr.info('Nothing selected.', '<ENV::loginPageTitle>', {timeOut: 1000})
    }
  };

  $scope.checkItem = function(hash) {
    console.log('### toggle item in selectedItems');
    var index = $scope.selectedItems.indexOf(hash);
    if (index > -1) {
      console.log('splicing on ', index, ' value ', $scope.selectedItems[index]);
      $scope.selectedItems.splice(index, 1);
    } else {
      $scope.selectedItems.push(hash);
    }
  }

  $scope.resetModal = function() {
    $scope.newApikey = null;
    $scope.apikeyAlias = null;
    $scope.createButtonVisible = true;
    $scope.selectedItems = [];
  }

}]);
