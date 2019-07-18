/* Setup blank page controller */
angular.module('RTM').controller('SourceController', ['$rootScope', '$scope', 'settings', function($rootScope, $scope, settings) {
  $scope.$on('$viewContentLoaded', function() {
    // initialize core components
    App.initAjax();

    // set default layout mode
    $rootScope.settings.layout.pageContentWhite = true;
    $rootScope.settings.layout.pageBodySolid = false;
    $rootScope.settings.layout.pageSidebarClosed = false;

    Thinx.init($rootScope, $scope);

    Thinx.sourceList()
    .done( function(data) {
      console.log('+++ updateSources ');
      $scope.$emit("updateSources", data);
    })
    .fail(error => console.log('Error:', error));

    $scope.resetModal();
    $scope.searchText = '';
    $scope.addingSource = false;

    $("#pageModal").on('shown.bs.modal', function(){
      angular.element('input[name=sourceUrl]').focus();
    });
  });

  $scope.searchText = '';

  $scope.addSource = function() {

    console.log('-- adding new source --');

    console.log($scope.sourceUrl);
    console.log($scope.sourceAlias);
    console.log($scope.sourceBranch);

    // disable submit button
    $scope.addingSource = true;

    console.log('-- testing for duplicates --');
    for (var sourceId in $rootScope.sources) {
      console.log("Looping sources: alias ", $rootScope.sources[sourceId].alias, "url", $rootScope.sources[sourceId].url);

      if ($rootScope.sources[sourceId].alias == $scope.sourceAlias) {
        toastr.error('Alias must be unique.', '<ENV::loginPageTitle>', {timeOut: 5000});
        return;
      }

    }

    Thinx.addSource($scope.sourceUrl, $scope.sourceAlias, $scope.sourceBranch)
    .done(function(response) {

      if (typeof(response) !== "undefined") {
        if (response.success) {
          console.log(response);

          Thinx.sourceList()
          .done( function(data) {
            $scope.$emit("updateSources", data);
          })
          .fail(error => console.log('Error:', error));

          toastr.success('Source Added.', '<ENV::loginPageTitle>', {timeOut: 5000});

          $('#pageModal').modal('hide');
          $scope.addingSource = false;

        } else {
          console.log(response);
        }
      } else {
        console.log('error');
        console.log(response);
        toastr.error('Source Failed.', '<ENV::loginPageTitle>', {timeOut: 5000});
      }
    })
    .fail(function(error) {
      $('.msg-warning').text(error);
      $('.msg-warning').show();
      console.log('Error:', error);
      toastr.error('Source Failed.', '<ENV::loginPageTitle>', {timeOut: 5000});
    });

  };

  $scope.getAliasFromUrl = function() {
    console.log('procesing: ' + $scope.sourceUrl);
    if ($scope.sourceUrl.length > 10) {
      try {
        var urlParts = $scope.sourceUrl.replace(/\/\s*$/,'').split('/');
        console.log(urlParts[1]);
        if (typeof(urlParts[0]) !== "undefined" && /git/.test(urlParts[0])) {
          var projectName = urlParts[1].split('.', 1);
          console.log('detected projectname:');
          console.log(projectName[0]);
        }
      } catch(e) {
        console.log(e);
      }
      if ((typeof(projectName) !== "undefined") && (projectName.length > 0) && ($scope.sourceAlias == null || $scope.sourceAlias == '')) {
        $scope.sourceAlias = projectName[0];
      }
    }
  };

  function revokeSources(selectedItems) {
    console.log('--deleting sources ' + selectedItems.length +'--')

    Thinx.revokeSources(selectedItems)
    .done(function(data) {
      if (data.success) {
        console.log('Success:', data);

        $scope.selectedItems = [];
        Thinx.sourceList()
        .done( function(data) {
          $scope.$emit("updateSources", data);
          toastr.success('Deleted.', '<ENV::loginPageTitle>', {timeOut: 5000});
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

  $scope.revokeSources = function() {
    console.log('-- processing selected items --');
    var selectedToRevoke = $scope.selectedItems.slice();
    if (selectedToRevoke.length > 0) {
      revokeSources(selectedToRevoke);
    } else {
      toastr.warning('Nothing selected.', '<ENV::loginPageTitle>', {timeOut: 1000});
    }
  };

  $scope.checkItem = function(sourceId) {
    console.log('### toggle item in selectedItems');
    console.log($scope.selectedItems);
    var index = $scope.selectedItems.indexOf(sourceId);
    if (index > -1) {
      console.log('splicing on ', index, ' value ', $scope.selectedItems[index]);
      $scope.selectedItems.splice(index, 1);
    } else {
      $scope.selectedItems.push(sourceId);
    }
  };

  $scope.resetModal = function() {
    $scope.sourceAlias = null;
    $scope.sourceUrl = null;
    $scope.sourceBranch = null;
    $scope.selectedItems = [];
  };

}]);
