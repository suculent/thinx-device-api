/* Setup blank page controller */
angular.module('RTM').controller('EnviroController', ['$rootScope', '$scope', 'settings', function($rootScope, $scope, settings) {
  $scope.$on('$viewContentLoaded', function() {
    // initialize core components
    App.initAjax();

    // set default layout mode
    $rootScope.settings.layout.pageContentWhite = true;
    $rootScope.settings.layout.pageBodySolid = false;
    $rootScope.settings.layout.pageSidebarClosed = false;

    Thinx.init($rootScope, $scope);

    Thinx.enviroList()
    .done( function(data) {
      updateEnviros(data)
    })
    .fail(error => console.log('Error:', error));

    $scope.resetModal();
    $scope.searchText = '';

    $("#pageModal").on('shown.bs.modal', function(){
      angular.element('input[name=enviroName]').focus();
    });
  });

  $scope.searchText = '';

  function updateEnviros(data) {
    var keys = JSON.parse(data);

    $rootScope.enviros = keys.env_vars;
    $scope.$apply();

    console.log('enviros:');
    console.log($rootScope.enviros);

  }

  $scope.addEnviro = function() {

    console.log('-- testing for duplicates --');
    for (var enviroId in $rootScope.enviros) {
      console.log("Looping enviros: alias/name", $rootScope.enviros[enviroId]);

      if ($rootScope.enviros[enviroId] == $scope.enviroName) {
        toastr.error('Name must be unique.', '<ENV::loginPageTitle>', {timeOut: 5000});
        return;
      }
    }

    console.log('--adding enviro variable ' + $scope.enviroName +'--')

    Thinx.addEnviro($scope.enviroName, $scope.enviroValue)
    .done(function(response) {

      if (typeof(response) !== "undefined") {
        if (response.success) {
          console.log(response);
          toastr.success('Variable saved.', '<ENV::loginPageTitle>', {timeOut: 5000});

          Thinx.enviroList()
          .done( function(data) {
            updateEnviros(data)
          })
          .fail(error => console.log('Error:', error));

          $('#pageModal').modal('hide');

        } else {
          console.log(response.status);
          if (response.status == "already_exists") {
            toastr.error('Variable already exists.', '<ENV::loginPageTitle>', {timeOut: 5000});
          } else {
            toastr.error('Error.', '<ENV::loginPageTitle>', {timeOut: 5000});
          }
        }
      } else {
        console.log('error');
        console.log(response);
      }
    })
    .fail(function(error) {
      $('.msg-warning').text(error);
      $('.msg-warning').show();
      console.log('Error:', error);
      toastr.error('Error.', '<ENV::loginPageTitle>', {timeOut: 5000});
    });

  };

  function revokeEnviros(fingerprints) {
    console.log('--deleting enviro variables ' + fingerprints.length +'--')

    Thinx.revokeEnviros(fingerprints)
    .done(function(data) {
      if (data.success) {
        console.log('Success:', data);

        $scope.selectedItems = [];
        Thinx.enviroList()
        .done( function(data) {
          toastr.success('Deleted.', '<ENV::loginPageTitle>', {timeOut: 5000});
          updateEnviros(data);
        })
        .fail(error => console.log('Error:', error));

      } else {
        toastr.error('Delete failed.', '<ENV::loginPageTitle>', {timeOut: 5000});
      }
    })
    .fail(function (error) {
      // TODO throw error message
      console.log('Error:', error)
    });
  }

  $scope.revokeEnviros = function() {
    console.log('-- processing selected items --');
    console.log($scope.selectedItems);

    var selectedToRevoke = $scope.selectedItems.slice();
    if (selectedToRevoke.length > 0) {
      revokeEnviros(selectedToRevoke);
    } else {
      toastr.warning('Nothing selected.', '<ENV::loginPageTitle>', {timeOut: 1000});
    }
  };

  $scope.checkItem = function(fingerprint) {
    console.log('### toggle item in selectedItems');
    var index = $scope.selectedItems.indexOf(fingerprint);
    if (index > -1) {
      console.log('splicing on ', index, ' value ', $scope.selectedItems[index]);
      $scope.selectedItems.splice(index, 1);
    } else {
      $scope.selectedItems.push(fingerprint);
    }
  }

  $scope.resetModal = function() {
    $scope.enviroName = null;
    $scope.enviroValue = null;
    $scope.selectedItems = [];
  }

}]);
