/* Setup blank page controller */
angular.module('RTM').controller('ChannelController', ['$rootScope', '$scope', 'settings', function($rootScope, $scope, settings) {
  $scope.$on('$viewContentLoaded', function() {
    // initialize core components
    App.initAjax();

    // set default layout mode
    $rootScope.settings.layout.pageContentWhite = true;
    $rootScope.settings.layout.pageBodySolid = false;
    $rootScope.settings.layout.pageSidebarClosed = false;

    Thinx.init($rootScope, $scope);

    Thinx.channelList()
    .done(function (data) {
      console.log('+++ updateChannels ');
      $scope.$emit("updateChannels", data);
    })
    .fail(error => $scope.$emit("xhrFailed", error));

    $scope.resetModal();
    $scope.searchText = '';
  });

  $scope.searchText = '';

  $scope.createChannel = function (mesh_id, alias, owner_id) {

    /*
    console.log('-- testing for duplicates --');
    for (var apikeyId in $rootScope.apikeys) {
      console.log("Looping apikeys: alias ", $rootScope.apikeys[apikeyId].alias);

      if ($rootScope.apikeys[apikeyId].alias == apikeyAlias) {
        toastr.error('Alias must be unique.', '<ENV::loginPageTitle>', { timeOut: 5000 });
        return;
      }
    }
    */

    Thinx.createChannel(mesh_id, alias, owner_id)
      .done(function (response) {
        if (typeof (response) !== "undefined") {
          if (response.success) {
            console.log(response);
            Thinx.channelList()
              .done(function (data) {
                console.log('+++ updateChannels ');
                $scope.$emit("updateChannels", data);
              })
              .fail(error => $scope.$emit("xhrFailed", error));              
            $scope.$apply();
          } else {
            console.log(response);
            $('.msg-warning').text(response.status);
            $('.msg-warning').show();
          }
        } else {
          console.log('error');
          console.log(response);
          toastr.error('Channel creation failed.', '<ENV::loginPageTitle>', { timeOut: 5000 });
        }
      })
      .fail(function (error) {
        console.log('Error:', error);
      });
  };


  function revokeChannels(mesh_ids) {
    console.log('--revoking channals ' + mesh_ids.length +'--')

    Thinx.revokeChannels(mesh_ids)
    .done(function(data) {
      if (data.success) {
        console.log('Success:', data);
        toastr.success('Channels revoked.', '<ENV::loginPageTitle>', {timeOut: 5000});

        $scope.selectedItems = [];

        Thinx.channelList()
        .done(function (data) {
          console.log('+++ updateChannels ');
          $scope.$emit("updateChannels", data);
        })
        .fail(error => $scope.$emit("xhrFailed", error));

      } else {
        toastr.error('Revocation failed.', '<ENV::loginPageTitle>', {timeOut: 5000});
      }
    })
    .fail(error => $scope.$emit("xhrFailed", error));
  }

  $scope.revokeChannels = function() {
    console.log('-- processing selected items --');
    console.log($scope.selectedItems);

    var selectedToRevoke = $scope.selectedItems.slice();
    if (selectedToRevoke.length > 0) {
      revokeChannels(selectedToRevoke);
    } else {
      toastr.warning('Nothing selected.', '<ENV::loginPageTitle>', {timeOut: 1000});
    }
  };

  $scope.checkItem = function(filename) {
    console.log('### toggle item in selectedItems');
    var index = $scope.selectedItems.indexOf(filename);
    if (index > -1) {
      console.log('splicing on ', index, ' value ', $scope.selectedItems[index]);
      $scope.selectedItems.splice(index, 1);
    } else {
      $scope.selectedItems.push(filename);
    }
  }

  $scope.resetModal = function() {
    $scope.deploykeyCreated = null;
    $scope.deploykeyValue = null;
    $scope.selectedItems = [];
  }

}]);
