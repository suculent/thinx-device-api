/* Setup blank page controller */
angular.module( "RTM" ).controller( "BlankController", [ "$rootScope", "$scope", "settings", function( $rootScope, $scope, settings ) {
  $scope.$on( "$viewContentLoaded", function() {
    // initialize core components
    App.initAjax();

    // set default layout mode
    $rootScope.settings.layout.pageContentWhite = true;
    $rootScope.settings.layout.pageBodySolid = false;
    $rootScope.settings.layout.pageSidebarClosed = false;
  } );
} ] );
