/* Setup blank page controller */
angular.module('RTM').controller('EditorController', ['$rootScope', '$scope', 'settings', function($rootScope, $scope, settings) {
  $scope.$on('$viewContentLoaded', function() {
    console.log('#### Editor Overlay init')
  });

  $scope.overlayEditor = {
    utid: null,
    alias: null,
    body: null
  };

  $rootScope.hideEditorOverlay = function() {
    console.log('--- hiding editor --- ');
    $('.editor-overlay-conatiner').fadeOut(300);
  }

  $rootScope.showEditorOverlay = function(utid) {
    console.log('--- opening editor for: ' + utid + ' ---');
    $scope.resetEditor(utid);
    $('.editor-overlay-conatiner').fadeIn(300);
  }

  $scope.saveEditor = function() {
    // check for transformer with same utid
    if (!$rootScope.getTransformerByUtid($scope.overlayEditor.utid)) {
      console.log('-- creating transformer ' + $scope.overlayEditor.utid + '--');
      $rootScope.profile.info.transformers.push({
        'utid': $scope.overlayEditor.utid,
        'alias': $scope.overlayEditor.alias,
        'body': base64converter('encode', $scope.overlayEditor.body)
      });
    } else {
      console.log('-- updating transformer ' + $scope.overlayEditor.utid + '--');
      $rootScope.getTransformerByUtid($scope.overlayEditor.utid).body = base64converter('encode', $scope.overlayEditor.body);
      $rootScope.getTransformerByUtid($scope.overlayEditor.utid).alias = $scope.overlayEditor.alias;
    }

    $scope.$emit("saveProfileChanges", ["transformers"]);
    $rootScope.hideEditorOverlay();

  };

  $scope.resetEditor = function(utid) {
    if (typeof(utid) == "undefined") {
      $scope.overlayEditor.utid = generateUtid();
      $scope.overlayEditor.alias = "<my-transformer-name>";
      $scope.overlayEditor.body = base64converter('decode', $rootScope.thinx.defaults.defaultTransformerBodyBase64);
    } else {
      $scope.overlayEditor.utid = utid;
      $scope.overlayEditor.alias = $rootScope.getRawTransformerByUtid(utid).alias;
      $scope.overlayEditor.body = $rootScope.getRawTransformerByUtid(utid).body;
    }
    $scope.overlayEditor.changed = false;
    $scope.selectedItems = [];
  }

  function generateUtid() {
      if (typeof($rootScope.profile.info.transformers) !== 'undefined') {
        return String(CryptoJS.SHA256($rootScope.profile.owner+new Date().getTime()));
      }
      return String(0);
  }

}]);
