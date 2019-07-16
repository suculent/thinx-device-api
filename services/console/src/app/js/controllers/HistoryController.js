/* Setup blank page controller */
angular.module('RTM').controller('HistoryController', ['$rootScope', '$scope', 'settings', '$stateParams', function($rootScope, $scope, settings, $stateParams) {
  $scope.$on('$viewContentLoaded', function() {
    // initialize core components
    App.initAjax();

    // set default layout mode
    $rootScope.settings.layout.pageContentWhite = true;
    $rootScope.settings.layout.pageBodySolid = false;
    $rootScope.settings.layout.pageSidebarClosed = false;

    Thinx.init($rootScope, $scope);

    $scope.list = {
      searchText: ''
    };

    var tab = $stateParams.tab;
    $('[data-target="#tab_' + tab + '"]').parent().addClass("active");
    $('#tab_' + tab).addClass("active");

    Thinx.getAuditHistory()
    .done(function(data) {
      $scope.$emit("updateAuditHistory", data);
    })
    .fail(error => $scope.$emit("xhrFailed", error));

  });

  $scope.downloadArtifacts = function(build_id) {
    toastr.warning('Not implemented.', '<ENV::loginPageTitle>', {timeOut: 2000})
  };

}]);
