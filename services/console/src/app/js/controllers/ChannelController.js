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

  $scope.createChannel = function() {

    console.log('--creating mesh channel--')

    Thinx.createChannel()
    .done(function(response) {

      response = JSON.parse(response);

      if (typeof(response) !== "undefined") {
        if (response.success) {
          console.log(response);
          toastr.success('Channel created.', '<ENV::loginPageTitle>', {timeOut: 5000});

          $scope.channelCreated = response.status.mesh_id;
          $scope.channelAlias = response.status.alias;

          Thinx.channelList()
          .done(function (data) {
            console.log('+++ updateChannels ');
            $scope.$emit("updateChannels", data);
          })
          .fail(error => $scope.$emit("xhrFailed", error));

        } else {
          console.log(response.status);
          toastr.error('Error.', '<ENV::loginPageTitle>', {timeOut: 5000});
        }
      } else {
        console.log('error');
        console.log(response);
      }
    })
    .fail(function(error) {
      $('.msg-warning').text(error);
      $('.msg-warning').show();
      $scope.$emit("xhrFailed", error)
      toastr.error('Error.', '<ENV::loginPageTitle>', {timeOut: 5000});
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
